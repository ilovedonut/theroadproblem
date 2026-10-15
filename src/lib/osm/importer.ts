import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { putStorageObject } from '../storage.ts';

export interface OsmWayNode {
  lat: number;
  lon: number;
}

export interface OsmElement {
  type: string;
  id: number;
  nodes?: number[];
  geometry?: OsmWayNode[];
  tags?: Record<string, string>;
  version?: number;
}

export interface OsmImportPayload {
  district: string;
  state: string;
  source: string;
  license: string;
  retrieved_at: string;
  source_uri?: string;
  elements: OsmElement[];
}

export interface OsmImportSummary {
  runId: string;
  district: string;
  total_elements: number;
  valid_ways: number;
  new_inserted: number;
  updated_versions: number;
  unchanged_skipped: number;
  storage_archived_key: string;
  attribution: string;
  license: string;
  errors: string[];
}

const ALLOWED_ROAD_CLASSES = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'service',
  'unclassified',
  'living_street',
  'motorway_link',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link'
]);

export function generateInformativeLabel(tags: Record<string, string> = {}): string {
  if (tags.name && tags.name.trim()) {
    return tags.name.trim();
  }
  const hw = tags.highway || 'road';
  const isService = hw === 'service' || Boolean(tags.service);
  const serviceType = tags.service ? ` (${tags.service.replace(/_/g, ' ')})` : '';
  const bridge = tags.bridge && tags.bridge !== 'no' ? ' [Elevated]' : '';
  const tunnel = tags.tunnel && tags.tunnel !== 'no' ? ' [Underpass]' : '';

  if (isService) {
    return `Unnamed service road${serviceType}${bridge}${tunnel}`;
  }
  if (hw === 'residential') {
    return `Unnamed residential street${bridge}${tunnel}`;
  }
  if (hw.includes('link')) {
    return `Unnamed ${hw.replace('_link', '')} connector${bridge}${tunnel}`;
  }
  return `Unnamed ${hw.replace(/_/g, ' ')} road${bridge}${tunnel}`;
}

export function computeWayFingerprint(way: OsmElement): string {
  const coords = (way.geometry || []).map((pt) => [
    Math.round(pt.lon * 1e6) / 1e6,
    Math.round(pt.lat * 1e6) / 1e6
  ]);
  const normTags = {
    highway: way.tags?.highway,
    name: way.tags?.name,
    ref: way.tags?.ref,
    bridge: way.tags?.bridge,
    tunnel: way.tags?.tunnel,
    layer: way.tags?.layer,
    access: way.tags?.access,
    service: way.tags?.service,
    oneway: way.tags?.oneway
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ coords, normTags }))
    .digest('hex');
}

/**
 * High-performance, chunk-batched repeatable OSM road importer.
 * Preserves OSM way identities, layer tags, and handles version transitions safely.
 * Features:
 * - Advisory lock protection against concurrent imports on the same district
 * - Atomic chunk transactions (rollback deactivations on failure)
 * - Distinct road identities for unnamed ways and disconnected local roads
 * - Separate reconciliation for official government corridors
 */
export async function importOsmRoads(
  client: pg.PoolClient,
  options: {
    district?: string;
    state?: string;
    payload?: OsmImportPayload;
    sourceFilePath?: string;
    limit?: number;
    chunkSize?: number;
  } = {}
): Promise<OsmImportSummary> {
  const district = options.district || 'Bengaluru Urban';
  const state = options.state || 'Karnataka';
  const chunkSize = options.chunkSize || 60;

  // 1. Advisory Lock Protection (exclusive per district during import)
  const lockKey = `osm_import:${district}`;
  const lockRes = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) as locked;', [lockKey]);
  if (!lockRes.rows[0]?.locked) {
    throw new Error(`Concurrent OSM import already in progress for district: ${district}`);
  }
  let lockAcquired = true;

  let rawPayload: OsmImportPayload;
  if (options.payload) {
    rawPayload = options.payload;
  } else {
    const filePath = options.sourceFilePath || path.resolve('scripts/data/bengaluru_roads_osm_sample.json');
    if (!fs.existsSync(filePath)) {
      throw new Error(`OSM source extract file not found: ${filePath}`);
    }
    rawPayload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  const rawJson = JSON.stringify(rawPayload);
  const fullChecksum = crypto.createHash('sha256').update(rawJson).digest('hex');
  const sourceUri = rawPayload.source_uri || 'https://overpass-api.de/api/interpreter';
  const districtKey = district.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const storageKey = `raw_sources/osm/${districtKey}_${fullChecksum.slice(0, 16)}.json`;

  try {
    // 2. Archive raw payload in Storage (dual-bucket quarantine isolation preserved)
    await putStorageObject(storageKey, Buffer.from(rawJson, 'utf8'), 'application/json');

    // 3. Register / Ensure OSM Data Source in data_sources
    await client.query(`
      INSERT INTO data_sources (name, publisher, base_uri, license, retrieval_method, update_frequency, terms_reviewed_at)
      VALUES (
        'OpenStreetMap India Roads',
        'OpenStreetMap Contributors',
        'https://www.openstreetmap.org/copyright',
        'ODbL 1.0',
        'overpass_extract',
        'weekly',
        NOW()
      )
      ON CONFLICT DO NOTHING;
    `);

    const osmSourceRes = await client.query(`SELECT id FROM data_sources WHERE name = 'OpenStreetMap India Roads' LIMIT 1;`);
    const sourceId = osmSourceRes.rows[0]?.id;

    // 4. Record in source_records with immutable checksum
    await client.query(`
      INSERT INTO source_records (source_id, external_key, source_uri, raw_content, checksum_sha256, parse_version)
      VALUES ($1, $2, $3, $4, $5, '1.0')
      ON CONFLICT (source_id, external_key, checksum_sha256) DO NOTHING;
    `, [
      sourceId,
      `OSM-${districtKey}-${fullChecksum.slice(0, 12)}`,
      sourceUri,
      JSON.stringify({
        district,
        state,
        license: rawPayload.license,
        retrieved_at: rawPayload.retrieved_at,
        total_elements: rawPayload.elements.length
      }),
      fullChecksum
    ]);

    // 5. Initialize Execution Run in osm_imports
    const runRes = await client.query(`
      INSERT INTO osm_imports (district, source_url, source_license, checksum_sha256, ways_count, coverage_status, status)
      VALUES ($1, $2, $3, $4, $5, 'pilot_bounded', 'running')
      RETURNING id;
    `, [district, sourceUri, rawPayload.license || 'ODbL 1.0', fullChecksum, rawPayload.elements.length]);
    const runId = runRes.rows[0].id;

    let validWaysCount = 0;
    let insertedCount = 0;
    let updatedVersionsCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    try {
      const rawElements = options.limit ? rawPayload.elements.slice(0, options.limit) : rawPayload.elements;

      // Filter valid motor-vehicle road ways
      const validWays: OsmElement[] = [];
      for (const el of rawElements) {
        if (el.type === 'way' && el.geometry && el.geometry.length >= 2 && el.tags?.highway) {
          if (ALLOWED_ROAD_CLASSES.has(el.tags.highway)) {
            validWays.push(el);
          }
        }
      }

      validWaysCount = validWays.length;

      // Process in chunks with atomic transactions per chunk
      for (let i = 0; i < validWays.length; i += chunkSize) {
        const chunk = validWays.slice(i, i + chunkSize);
        const chunkWayIds = chunk.map((w) => w.id);

        // Check existing active segments for this chunk
        const existingRes = await client.query(`
          SELECT id, road_id, osm_way_id, version, is_active, source_checksum
          FROM road_segments
          WHERE osm_way_id = ANY($1::bigint[]) AND is_active = TRUE;
        `, [chunkWayIds]);

        const existingMap = new Map<number, any>();
        for (const row of existingRes.rows) {
          existingMap.set(Number(row.osm_way_id), row);
        }

        // Identify items that need insert or update
        interface ItemToInsert {
          way: OsmElement;
          wkt: string;
          roadName: string;
          hasOfficialName: boolean;
          officialRef: string | null;
          hw: string;
          bridge: string | null;
          tunnel: string | null;
          layer: number;
          access: string;
          service: string | null;
          isService: boolean;
          wayFingerprint: string;
          sourceFeatureId: string;
          version: number;
          parentSegmentId: string | null;
          existingRoadId: string | null;
          resolvedRoadId?: string;
        }

        const itemsToInsert: ItemToInsert[] = [];
        const deactivateIds: string[] = [];

        for (const way of chunk) {
          const wayFingerprint = computeWayFingerprint(way);
          const existing = existingMap.get(way.id);

          if (existing) {
            if (existing.source_checksum === wayFingerprint) {
              // Unchanged: skip!
              skippedCount++;
              continue;
            }

            // Changed: deactivate old version atomically with replacement
            deactivateIds.push(existing.id);
          }

          const points = way.geometry!.map((pt) => `${pt.lon} ${pt.lat}`).join(', ');
          const wkt = `LINESTRING(${points})`;
          const hw = way.tags!.highway!;
          const isService = hw === 'service' || Boolean(way.tags?.service);
          const bridge = way.tags?.bridge && way.tags.bridge !== 'no' ? way.tags.bridge : null;
          const tunnel = way.tags?.tunnel && way.tags.tunnel !== 'no' ? way.tags.tunnel : null;
          const layer = parseInt(way.tags?.layer || '0', 10) || 0;
          const access = way.tags?.access || 'yes';
          const service = way.tags?.service || null;
          const hasOfficialName = Boolean(way.tags?.name && way.tags.name.trim());
          const informativeLabel = generateInformativeLabel(way.tags || {});
          const roadName = hasOfficialName ? way.tags!.name!.trim() : informativeLabel;
          const officialRef = way.tags?.ref || null;
          const sourceFeatureId = `osm:way:${way.id}`;
          const nextVersion = existing ? (existing.version || 1) + 1 : (way.version || 1);

          itemsToInsert.push({
            way,
            wkt,
            roadName,
            hasOfficialName,
            officialRef,
            hw,
            bridge,
            tunnel,
            layer,
            access,
            service,
            isService,
            wayFingerprint,
            sourceFeatureId,
            version: nextVersion,
            parentSegmentId: existing ? existing.id : null,
            existingRoadId: existing ? existing.road_id : null
          });
        }

        if (itemsToInsert.length === 0) {
          continue;
        }

        // Check outer transaction state to safely use SAVEPOINT or BEGIN
        const inOuterTx = (client as any)._txStatus === 'T';
        const spName = `chunk_sp_${i}`;

        if (inOuterTx) {
          await client.query(`SAVEPOINT ${spName};`);
        } else {
          await client.query('BEGIN;');
        }

        try {
          // A. Deactivate old versions atomically
          if (deactivateIds.length > 0) {
            await client.query(`
              UPDATE road_segments
              SET is_active = FALSE, updated_at = NOW()
              WHERE id = ANY($1::uuid[]);
            `, [deactivateIds]);
          }

          // B. Road Identity Resolution
          // 1. Items with existingRoadId reuse that exact road entity
          for (const item of itemsToInsert) {
            if (item.existingRoadId) {
              item.resolvedRoadId = item.existingRoadId;
            }
          }

          // 2. Unnamed ways: Each way preserves its OSM way identity (source_feature_id = 'osm:way:' + way.id)
          const unnamedItems = itemsToInsert.filter((item) => !item.resolvedRoadId && !item.hasOfficialName);
          if (unnamedItems.length > 0) {
            const unnamedSourceIds = unnamedItems.map((u) => u.sourceFeatureId);
            const existingUnnamedRes = await client.query(`
              SELECT id, source_feature_id
              FROM roads
              WHERE source_feature_id = ANY($1::text[]);
            `, [unnamedSourceIds]);

            const unnamedRoadMap = new Map<string, string>();
            for (const r of existingUnnamedRes.rows) {
              unnamedRoadMap.set(r.source_feature_id, r.id);
            }

            const missingUnnamed = unnamedItems.filter((u) => !unnamedRoadMap.has(u.sourceFeatureId));
            if (missingUnnamed.length > 0) {
              const uValues: string[] = [];
              const uParams: any[] = [];
              let uIdx = 1;

              for (const u of missingUnnamed) {
                uValues.push(`($${uIdx++}, $${uIdx++}, $${uIdx++}, $${uIdx++}, $${uIdx++}, $${uIdx++}, $${uIdx++}, $${uIdx++}, FALSE)`);
                uParams.push(
                  u.roadName,
                  u.officialRef,
                  u.hw,
                  u.way.tags?.operator || 'Local Public Authority',
                  state,
                  district,
                  sourceId,
                  u.sourceFeatureId
                );
              }

              const insertUnnamedRes = await client.query(`
                INSERT INTO roads (name, ref, road_class, authority_name, state, district, source_id, source_feature_id, is_official_corridor)
                VALUES ${uValues.join(', ')}
                ON CONFLICT DO NOTHING
                RETURNING id, source_feature_id;
              `, uParams);

              for (const r of insertUnnamedRes.rows) {
                unnamedRoadMap.set(r.source_feature_id, r.id);
              }
            }

            for (const u of unnamedItems) {
              u.resolvedRoadId = unnamedRoadMap.get(u.sourceFeatureId);
            }
          }

          // 3. Named ways: Reconcile official corridors vs local spatial clusters
          const namedItems = itemsToInsert.filter((item) => !item.resolvedRoadId && item.hasOfficialName);
          if (namedItems.length > 0) {
            // Check official government corridors first
            const distinctNames = Array.from(new Set(namedItems.map((n) => n.roadName)));
            const officialRes = await client.query(`
              SELECT id, name
              FROM roads
              WHERE is_official_corridor = TRUE AND district = $1 AND name = ANY($2::text[]);
            `, [district, distinctNames]);

            const officialMap = new Map<string, string>();
            for (const r of officialRes.rows) {
              officialMap.set(r.name, r.id);
            }

            for (const n of namedItems) {
              if (officialMap.has(n.roadName)) {
                n.resolvedRoadId = officialMap.get(n.roadName);
              }
            }

            // For remaining local named ways: check spatial proximity (within 500m)
            const remainingNamed = namedItems.filter((n) => !n.resolvedRoadId);
            const chunkLocalRoads = new Map<string, Array<{ id: string; wkt: string }>>();

            for (const item of remainingNamed) {
              // Check if DB has an active segment of this road within 500m
              const proxRes = await client.query(`
                SELECT r.id
                FROM roads r
                JOIN road_segments rs ON rs.road_id = r.id
                WHERE r.district = $1
                  AND r.name = $2
                  AND rs.is_active = TRUE
                  AND ST_DWithin(rs.geom::geography, ST_SetSRID(ST_GeomFromText($3), 4326)::geography, 500)
                LIMIT 1;
              `, [district, item.roadName, item.wkt]);

              if (proxRes.rows.length > 0) {
                item.resolvedRoadId = proxRes.rows[0].id;
                continue;
              }

              // Check if a road created earlier in this chunk is proximate
              const localCandidates = chunkLocalRoads.get(item.roadName) || [];
              let matchedLocalId: string | null = null;
              for (const cand of localCandidates) {
                const distCheck = await client.query(`
                  SELECT ST_DWithin(
                    ST_SetSRID(ST_GeomFromText($1), 4326)::geography,
                    ST_SetSRID(ST_GeomFromText($2), 4326)::geography,
                    500
                  ) as within_dist;
                `, [item.wkt, cand.wkt]);
                if (distCheck.rows[0]?.within_dist) {
                  matchedLocalId = cand.id;
                  break;
                }
              }

              if (matchedLocalId) {
                item.resolvedRoadId = matchedLocalId;
                continue;
              }

              // Disconnected or new road: create a distinct road entity
              const newRoadRes = await client.query(`
                INSERT INTO roads (name, ref, road_class, authority_name, state, district, source_id, source_feature_id, is_official_corridor)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
                RETURNING id;
              `, [
                item.roadName,
                item.officialRef,
                item.hw,
                item.way.tags?.operator || 'Local Public Authority',
                state,
                district,
                sourceId,
                item.sourceFeatureId
              ]);

              const newId = newRoadRes.rows[0].id;
              item.resolvedRoadId = newId;

              const existingList = chunkLocalRoads.get(item.roadName) || [];
              existingList.push({ id: newId, wkt: item.wkt });
              chunkLocalRoads.set(item.roadName, existingList);
            }
          }

          // C. Multi-value batch insert for road_segments
          const segValues: string[] = [];
          const segParams: any[] = [];
          let sIdx = 1;

          for (const item of itemsToInsert) {
            const roadId = item.resolvedRoadId;
            if (!roadId) continue;

            segValues.push(`(
              $${sIdx++},
              ST_SetSRID(ST_GeomFromText($${sIdx++}), 4326),
              $${sIdx++}, $${sIdx++},
              ARRAY[$${sIdx++}::bigint], $${sIdx++}, $${sIdx++},
              $${sIdx++}, $${sIdx++}, $${sIdx++}, $${sIdx++},
              $${sIdx++}, $${sIdx++}, $${sIdx++}, $${sIdx++},
              $${sIdx++}, $${sIdx++},
              ST_Length(ST_SetSRID(ST_GeomFromText($${sIdx++}), 4326)::geography),
              $${sIdx++}, TRUE
            )`);

            segParams.push(
              roadId,
              item.wkt,
              state,
              district,
              item.way.id,
              item.way.id,
              item.version,
              JSON.stringify(item.way.tags || {}),
              item.hw,
              item.bridge,
              item.tunnel,
              item.layer,
              item.access,
              item.service,
              item.isService,
              item.wayFingerprint,
              item.sourceFeatureId,
              item.wkt,
              item.version
            );
          }

          if (segValues.length > 0) {
            const segInsertRes = await client.query(`
              INSERT INTO road_segments (
                road_id, geom, state, district, osm_ids, osm_way_id, osm_version,
                osm_tags, road_class, bridge, tunnel, layer, access, service,
                is_service, source_checksum, source_feature_id, length_m, version, is_active
              ) VALUES ${segValues.join(', ')}
              RETURNING id, osm_way_id, version;
            `, segParams);

            // Build item lookup by way.id
            const itemsByWayId = new Map<number, ItemToInsert>();
            for (const item of itemsToInsert) {
              itemsByWayId.set(item.way.id, item);
            }

            // Multi-value batch insert for road_segment_lineage
            const linValues: string[] = [];
            const linParams: any[] = [];
            let lIdx = 1;

            for (const row of segInsertRes.rows) {
              const item = itemsByWayId.get(Number(row.osm_way_id));
              if (item?.parentSegmentId) {
                linValues.push(`($${lIdx++}, $${lIdx++}, 'geometry_update', 'Upstream OpenStreetMap geometry refresh', $${lIdx++})`);
                linParams.push(row.id, item.parentSegmentId, `osm:${row.osm_way_id}:v${row.version}`);
                updatedVersionsCount++;
              } else {
                linValues.push(`($${lIdx++}, NULL, 'initial', 'Initial import from licensed OSM extract (ODbL 1.0)', $${lIdx++})`);
                linParams.push(row.id, `osm:${row.osm_way_id}:v${row.version}`);
                insertedCount++;
              }
            }

            if (linValues.length > 0) {
              await client.query(`
                INSERT INTO road_segment_lineage (
                  segment_id, parent_segment_id, transition_type, reason, source_version
                ) VALUES ${linValues.join(', ')};
              `, linParams);
            }
          }

          if (inOuterTx) {
            await client.query(`RELEASE SAVEPOINT ${spName};`);
          } else {
            await client.query('COMMIT;');
          }
        } catch (chunkErr) {
          if (inOuterTx) {
            await client.query(`ROLLBACK TO SAVEPOINT ${spName};`);
          } else {
            await client.query('ROLLBACK;');
          }
          throw chunkErr;
        }
      }

      // Complete Import Ledger Run
      await client.query(`
        UPDATE osm_imports
        SET status = 'completed',
            ways_count = $1,
            inserted_count = $2,
            updated_count = $3,
            skipped_count = $4,
            completed_at = NOW()
        WHERE id = $5;
      `, [validWaysCount, insertedCount, updatedVersionsCount, skippedCount, runId]);

    } catch (err: any) {
      console.error('[importer original error]:', err);
      errors.push(err.message);
      try {
        await client.query(`
          UPDATE osm_imports
          SET status = 'failed',
              error_details = $1,
              completed_at = NOW()
          WHERE id = $2;
        `, [err.message, runId]);
      } catch {}
      throw err;
    }

    return {
      runId,
      district,
      total_elements: rawPayload.elements.length,
      valid_ways: validWaysCount,
      new_inserted: insertedCount,
      updated_versions: updatedVersionsCount,
      unchanged_skipped: skippedCount,
      storage_archived_key: storageKey,
      attribution: 'OpenStreetMap Contributors (https://www.openstreetmap.org/copyright)',
      license: rawPayload.license || 'ODbL 1.0',
      errors
    };
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtext($1));', [lockKey]);
      } catch {}
    }
  }
}
