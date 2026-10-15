import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { putStorageObject } from '../storage.ts';
import {
  classifyOsmWayTags,
  generateInformativeLabel,
  type AccessStatus,
  type RoadUsageCategory,
} from './classification.ts';
import {
  clipWayToBoundary,
  computePolylineLengthMeters,
  haversineDistanceMeters,
  loadVerifiedBengaluruBoundary,
  type BoundaryProvenance,
  type CoordPoint,
} from './boundary.ts';

export { generateInformativeLabel };

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
  timestamp?: string;
  deleted?: boolean;
}

export interface OsmImportPayload {
  district: string;
  state: string;
  source: string;
  license: string;
  retrieved_at: string;
  source_uri?: string;
  source_timestamp?: string;
  is_complete_extract?: boolean;
  elements: OsmElement[];
}

export interface OsmImportSummary {
  runId: string;
  district: string;
  boundary_version: string;
  boundary_checksum: string;
  parser_version: string;
  source_checksum: string;
  source_timestamp: string;
  dry_run: boolean;
  total_elements: number;
  valid_ways: number;
  new_inserted: number;
  updated_versions: number;
  unchanged_skipped: number;
  rejected_count: number;
  deactivated_count: number;
  review_routed_count: number;
  renamed_count: number;
  split_lineage_count: number;
  merge_lineage_count: number;
  boundary_crossing_ways: number;
  within_boundary_length_m: number;
  motor_road_length_m: number;
  rejection_breakdown: Record<string, number>;
  category_breakdown: Record<string, number>;
  access_breakdown: Record<string, number>;
  checkpoint_offset: number;
  storage_archived_key: string;
  attribution: string;
  license: string;
  errors: string[];
}

export const PARSER_VERSION = '2.0.0';

/**
 * Computes deterministic SHA-256 fingerprint for an OSM way's clipped geometry and relevant tags.
 */
export function computeWayFingerprint(way: OsmElement, clippedCoords?: CoordPoint[]): string {
  const pts = clippedCoords && clippedCoords.length >= 2 ? clippedCoords : (way.geometry || []);
  const coords = pts.map((pt) => [
    Math.round(pt.lon * 1e6) / 1e6,
    Math.round(pt.lat * 1e6) / 1e6,
  ]);
  const normTags = {
    highway: way.tags?.highway,
    name: way.tags?.name,
    ref: way.tags?.ref,
    bridge: way.tags?.bridge,
    tunnel: way.tags?.tunnel,
    layer: way.tags?.layer,
    access: way.tags?.motor_vehicle || way.tags?.vehicle || way.tags?.access || 'unknown',
    service: way.tags?.service,
    oneway: way.tags?.oneway,
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ coords, normTags }))
    .digest('hex');
}

function toWktLineString(coords: CoordPoint[]): string {
  return `LINESTRING(${coords.map((pt) => `${pt.lon} ${pt.lat}`).join(', ')})`;
}

/**
 * Minimum distance in metres between two polylines (vertex-to-vertex approximation for fast local checks).
 */
function minPolylineDistanceMeters(a: CoordPoint[], b: CoordPoint[]): number {
  let minD = Infinity;
  for (const pa of a) {
    for (const pb of b) {
      const d = haversineDistanceMeters(pa, pb);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

/**
 * Checks whether two ways share at least one topological OSM node or endpoint.
 */
function waysShareNode(nodesA: number[], nodesB: number[]): boolean {
  if (!nodesA.length || !nodesB.length) return false;
  const setA = new Set(nodesA);
  for (const n of nodesB) {
    if (setA.has(n)) return true;
  }
  return false;
}

/**
 * Pre-publication safety gate: detects anomalous mass deletions or widespread ID replacement.
 */
export function validateStagedImport(params: {
  existingActiveCount: number;
  proposedDeactivations: number;
  proposedUpdates: number;
  isCompleteExtract: boolean;
  maxDeactivationRatio?: number;
}): { ok: boolean; reason?: string } {
  const {
    existingActiveCount,
    proposedDeactivations,
    isCompleteExtract,
    maxDeactivationRatio = 0.15,
  } = params;

  if (!isCompleteExtract && proposedDeactivations > 0) {
    return {
      ok: false,
      reason: `Partial extract attempted to deactivate ${proposedDeactivations} segments; deactivations are blocked on non-complete extracts.`,
    };
  }

  if (existingActiveCount >= 20 && proposedDeactivations / existingActiveCount > maxDeactivationRatio) {
    return {
      ok: false,
      reason: `Anomalous mass deactivation detected: proposed deactivating ${proposedDeactivations} of ${existingActiveCount} active segments (${((proposedDeactivations / existingActiveCount) * 100).toFixed(1)}% > ${(maxDeactivationRatio * 100).toFixed(1)}% threshold). Aborting publication.`,
    };
  }

  return { ok: true };
}

/**
 * Repeatable, boundary-verified, lineage-preserving OSM road importer for Bengaluru Urban.
 */
export async function importOsmRoads(
  client: pg.PoolClient,
  options: {
    district?: string;
    state?: string;
    payload?: OsmImportPayload;
    sourceFilePath?: string;
    boundaryFilePath?: string;
    boundary?: BoundaryProvenance;
    enforceBoundary?: boolean;
    includeNonMotor?: boolean;
    includeConstructionProposed?: boolean;
    isCompleteExtract?: boolean;
    dryRun?: boolean;
    checkpointOffset?: number;
    limit?: number;
    chunkSize?: number;
    maxDeactivationRatio?: number;
  } = {}
): Promise<OsmImportSummary> {
  const district = options.district || 'Bengaluru Urban';
  const state = options.state || 'Karnataka';
  const chunkSize = options.chunkSize || 60;
  const dryRun = Boolean(options.dryRun);
  const startOffset = Math.max(0, options.checkpointOffset || 0);

  // Load verified boundary polygon
  const boundary =
    options.boundary ||
    (district === 'Bengaluru Urban'
      ? loadVerifiedBengaluruBoundary(options.boundaryFilePath)
      : null);
  const enforceBoundary = options.enforceBoundary !== false && boundary !== null;

  // 1. Load & Validate Input Extract BEFORE acquiring locks or modifying state
  let rawPayload: OsmImportPayload;
  if (options.payload) {
    rawPayload = options.payload;
  } else {
    const filePath =
      options.sourceFilePath || path.resolve('scripts/data/bengaluru_roads_osm_sample.json');
    if (!fs.existsSync(filePath)) {
      throw new Error(`OSM source extract file not found: ${filePath}`);
    }
    const rawFileText = fs.readFileSync(filePath, 'utf8');
    if (!rawFileText.trim()) {
      throw new Error(`OSM source extract file is empty: ${filePath}`);
    }
    rawPayload = JSON.parse(rawFileText);
  }

  if (!rawPayload || !Array.isArray(rawPayload.elements) || rawPayload.elements.length === 0) {
    throw new Error(
      'Invalid or empty OSM extract payload: refusing to run import or deactivate existing index on empty/partial input.'
    );
  }

  const isCompleteExtract =
    Boolean(options.isCompleteExtract ?? rawPayload.is_complete_extract) && !options.limit;

  const rawJson = JSON.stringify(rawPayload);
  const fullChecksum = crypto.createHash('sha256').update(rawJson).digest('hex');
  const sourceUri =
    rawPayload.source_uri || 'https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf';
  const sourceTimestamp =
    rawPayload.source_timestamp || rawPayload.retrieved_at || new Date().toISOString();
  const districtKey = district.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const storageKey = `raw_sources/osm/${districtKey}_${fullChecksum.slice(0, 16)}.json`;

  // 2. Classify & Clip Elements Against Verified Boundary
  const rawElements = options.limit
    ? rawPayload.elements.slice(0, options.limit)
    : rawPayload.elements;

  const rejectionBreakdown: Record<string, number> = {};
  const categoryBreakdown: Record<string, number> = {};
  const accessBreakdown: Record<string, number> = {};
  let boundaryCrossingWaysCount = 0;
  let totalWithinBoundaryLengthM = 0;
  let totalMotorRoadLengthM = 0;
  const deletedWayIdsInExtract: number[] = [];

  interface PreparedWayCandidate {
    way: OsmElement;
    classification: ReturnType<typeof classifyOsmWayTags>;
    sourceCoords: CoordPoint[];
    clippedCoords: CoordPoint[];
    sourceWkt: string;
    clippedWkt: string;
    sourceLengthM: number;
    withinBoundaryLengthM: number;
    crossesBoundary: boolean;
    wayFingerprint: string;
    sourceFeatureId: string;
    nodeIds: number[];
    startNodeId: number | null;
    endNodeId: number | null;
  }

  const validCandidates: PreparedWayCandidate[] = [];

  for (const el of rawElements) {
    if (el.type !== 'way') {
      rejectionBreakdown.non_way_element = (rejectionBreakdown.non_way_element || 0) + 1;
      continue;
    }

    if (el.deleted) {
      deletedWayIdsInExtract.push(el.id);
      continue;
    }

    if (!el.geometry || !Array.isArray(el.geometry) || el.geometry.length < 2) {
      rejectionBreakdown.invalid_geometry = (rejectionBreakdown.invalid_geometry || 0) + 1;
      continue;
    }

    const classification = classifyOsmWayTags(el.tags || {}, {
      includeNonMotor: options.includeNonMotor,
      includeConstructionProposed: options.includeConstructionProposed,
    });

    if (!classification.included) {
      const reason = classification.rejectionReason || 'excluded_highway_class';
      rejectionBreakdown[reason] = (rejectionBreakdown[reason] || 0) + 1;
      continue;
    }

    const sourceCoords: CoordPoint[] = el.geometry.map((pt) => ({
      lon: Number(pt.lon),
      lat: Number(pt.lat),
    }));

    let clippedCoords = sourceCoords;
    let sourceLengthM = computePolylineLengthMeters(sourceCoords);
    let withinBoundaryLengthM = sourceLengthM;
    let crossesBoundary = false;

    if (enforceBoundary && boundary) {
      const clipRes = clipWayToBoundary(sourceCoords, boundary);
      if (clipRes.status === 'outside') {
        rejectionBreakdown.outside_boundary = (rejectionBreakdown.outside_boundary || 0) + 1;
        continue;
      }
      if (clipRes.status === 'invalid' || clipRes.primaryClippedCoords.length < 2) {
        rejectionBreakdown.invalid_clipped_geometry =
          (rejectionBreakdown.invalid_clipped_geometry || 0) + 1;
        continue;
      }
      clippedCoords = clipRes.primaryClippedCoords;
      sourceLengthM = clipRes.sourceLengthM;
      withinBoundaryLengthM = clipRes.withinBoundaryLengthM;
      crossesBoundary = clipRes.crossesBoundary;
      if (crossesBoundary) {
        boundaryCrossingWaysCount++;
      }
    }

    categoryBreakdown[classification.usageCategory] =
      (categoryBreakdown[classification.usageCategory] || 0) + 1;
    accessBreakdown[classification.accessStatus] =
      (accessBreakdown[classification.accessStatus] || 0) + 1;

    totalWithinBoundaryLengthM += withinBoundaryLengthM;
    if (classification.isMotorRoad) {
      totalMotorRoadLengthM += withinBoundaryLengthM;
    }

    const nodeIds = Array.isArray(el.nodes) ? el.nodes.map(Number).filter(Number.isFinite) : [];
    const startNodeId = nodeIds.length > 0 ? nodeIds[0] : null;
    const endNodeId = nodeIds.length > 0 ? nodeIds[nodeIds.length - 1] : null;
    const sourceFeatureId = `osm:way:${el.id}`;
    const wayFingerprint = computeWayFingerprint(el, clippedCoords);

    validCandidates.push({
      way: el,
      classification,
      sourceCoords,
      clippedCoords,
      sourceWkt: toWktLineString(sourceCoords),
      clippedWkt: toWktLineString(clippedCoords),
      sourceLengthM: Number(sourceLengthM.toFixed(2)),
      withinBoundaryLengthM: Number(withinBoundaryLengthM.toFixed(2)),
      crossesBoundary,
      wayFingerprint,
      sourceFeatureId,
      nodeIds,
      startNodeId,
      endNodeId,
    });
  }

  const rejectedCount = Object.values(rejectionBreakdown).reduce((a, b) => a + b, 0);

  if (validCandidates.length === 0 && deletedWayIdsInExtract.length === 0) {
    throw new Error(
      `Zero eligible ways found inside boundary for ${district} (rejected: ${rejectedCount}). Refusing to proceed with empty candidate set.`
    );
  }

  // 3. Dry-Run Execution Path (Read-Only Diff Against Active Index, Zero Writes)
  if (dryRun) {
    let insertedCount = 0;
    let updatedVersionsCount = 0;
    let skippedCount = 0;
    let renamedCount = 0;
    let reviewRoutedCount = 0;
    let deactivatedCount = 0;

    const allCandidateWayIds = validCandidates.map((c) => c.way.id);
    const existingRes = await client.query(
      `
      SELECT rs.id, rs.road_id, rs.osm_way_id, rs.version, rs.source_checksum,
             r.name as road_name, r.ref as road_ref
      FROM road_segments rs
      JOIN roads r ON r.id = rs.road_id
      WHERE rs.osm_way_id = ANY($1::bigint[]) AND rs.is_active = TRUE;
    `,
      [allCandidateWayIds]
    );

    const existingMap = new Map<number, any>();
    for (const row of existingRes.rows) {
      existingMap.set(Number(row.osm_way_id), row);
    }

    // Check if any changed segments have associated works that would need review
    const changedSegmentIds: string[] = [];
    for (const cand of validCandidates) {
      const ex = existingMap.get(cand.way.id);
      if (!ex) {
        insertedCount++;
      } else if (ex.source_checksum === cand.wayFingerprint) {
        skippedCount++;
      } else {
        updatedVersionsCount++;
        changedSegmentIds.push(ex.id);
        if (
          cand.classification.hasOfficialName &&
          ex.road_name &&
          ex.road_name !== cand.classification.displayName
        ) {
          renamedCount++;
        }
      }
    }

    if (changedSegmentIds.length > 0) {
      const wsRes = await client.query(
        `SELECT COUNT(DISTINCT work_id) as cnt FROM work_segments WHERE road_segment_id = ANY($1::uuid[]);`,
        [changedSegmentIds]
      );
      reviewRoutedCount = parseInt(wsRes.rows[0]?.cnt || '0', 10);
    }

    if (deletedWayIdsInExtract.length > 0 && isCompleteExtract) {
      const delRes = await client.query(
        `SELECT COUNT(*) as cnt FROM road_segments WHERE osm_way_id = ANY($1::bigint[]) AND is_active = TRUE;`,
        [deletedWayIdsInExtract]
      );
      deactivatedCount = parseInt(delRes.rows[0]?.cnt || '0', 10);
    }

    return {
      runId: `dry-run-${fullChecksum.slice(0, 12)}`,
      district,
      boundary_version: boundary?.boundary_version || 'unbounded',
      boundary_checksum: boundary?.checksum_sha256 || '',
      parser_version: PARSER_VERSION,
      source_checksum: fullChecksum,
      source_timestamp: sourceTimestamp,
      dry_run: true,
      total_elements: rawElements.length,
      valid_ways: validCandidates.length,
      new_inserted: insertedCount,
      updated_versions: updatedVersionsCount,
      unchanged_skipped: skippedCount,
      rejected_count: rejectedCount,
      deactivated_count: deactivatedCount,
      review_routed_count: reviewRoutedCount,
      renamed_count: renamedCount,
      split_lineage_count: 0,
      merge_lineage_count: 0,
      boundary_crossing_ways: boundaryCrossingWaysCount,
      within_boundary_length_m: Number(totalWithinBoundaryLengthM.toFixed(2)),
      motor_road_length_m: Number(totalMotorRoadLengthM.toFixed(2)),
      rejection_breakdown: rejectionBreakdown,
      category_breakdown: categoryBreakdown,
      access_breakdown: accessBreakdown,
      checkpoint_offset: validCandidates.length,
      storage_archived_key: `dry_run:${storageKey}`,
      attribution: 'OpenStreetMap Contributors (https://www.openstreetmap.org/copyright)',
      license: rawPayload.license || 'ODbL 1.0',
      errors: [],
    };
  }

  // 4. Exclusive Advisory Lock Protection per District
  const lockKey = `osm_import:${district}`;
  const lockRes = await client.query(
    'SELECT pg_try_advisory_lock(hashtext($1)) as locked;',
    [lockKey]
  );
  if (!lockRes.rows[0]?.locked) {
    throw new Error(`Concurrent OSM import already in progress for district: ${district}`);
  }
  let lockAcquired = true;

  try {
    // 5. Archive raw payload in Storage
    await putStorageObject(storageKey, Buffer.from(rawJson, 'utf8'), 'application/json');

    // 6. Register / Ensure OSM Data Source in data_sources
    await client.query(`
      INSERT INTO data_sources (name, publisher, base_uri, license, retrieval_method, update_frequency, terms_reviewed_at)
      VALUES (
        'OpenStreetMap India Roads',
        'OpenStreetMap Contributors',
        'https://www.openstreetmap.org/copyright',
        'ODbL 1.0',
        'geofabrik_osmium_extract',
        'weekly',
        NOW()
      )
      ON CONFLICT DO NOTHING;
    `);

    const osmSourceRes = await client.query(
      `SELECT id FROM data_sources WHERE name = 'OpenStreetMap India Roads' LIMIT 1;`
    );
    const sourceId = osmSourceRes.rows[0]?.id;

    // 7. Record in source_records with immutable checksum
    await client.query(
      `
      INSERT INTO source_records (source_id, external_key, source_uri, raw_content, checksum_sha256, parse_version)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (source_id, external_key, checksum_sha256) DO NOTHING;
    `,
      [
        sourceId,
        `OSM-${districtKey}-${fullChecksum.slice(0, 12)}`,
        sourceUri,
        JSON.stringify({
          district,
          state,
          boundary_version: boundary?.boundary_version || null,
          boundary_checksum: boundary?.checksum_sha256 || null,
          license: rawPayload.license,
          retrieved_at: rawPayload.retrieved_at,
          total_elements: rawPayload.elements.length,
          valid_ways: validCandidates.length,
          rejected_count: rejectedCount,
        }),
        fullChecksum,
        PARSER_VERSION,
      ]
    );

    const coverageStatus =
      isCompleteExtract || validCandidates.length >= 1000 ? 'complete_district' : 'pilot_bounded';

    // 8. Initialize Execution Run in osm_imports
    const runRes = await client.query(
      `
      INSERT INTO osm_imports (
        district, source_url, source_license, checksum_sha256, ways_count,
        coverage_status, status, boundary_version, boundary_checksum,
        source_timestamp, parser_version, rejected_count, rejection_breakdown,
        within_boundary_length_m, motor_road_length_m, checkpoint_offset, is_dry_run
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, 'running', $7, $8,
        $9::timestamptz, $10, $11, $12::jsonb,
        $13, $14, $15, FALSE
      )
      RETURNING id;
    `,
      [
        district,
        sourceUri,
        rawPayload.license || 'ODbL 1.0',
        fullChecksum,
        validCandidates.length,
        coverageStatus,
        boundary?.boundary_version || 'osm-rel-2020589-v1',
        boundary?.checksum_sha256 || '',
        sourceTimestamp,
        PARSER_VERSION,
        rejectedCount,
        JSON.stringify(rejectionBreakdown),
        Number(totalWithinBoundaryLengthM.toFixed(2)),
        Number(totalMotorRoadLengthM.toFixed(2)),
        startOffset,
      ]
    );
    const runId = runRes.rows[0].id;

    let insertedCount = 0;
    let updatedVersionsCount = 0;
    let skippedCount = 0;
    let deactivatedCount = 0;
    let reviewRoutedCount = 0;
    let renamedCount = 0;
    let splitLineageCount = 0;
    let mergeLineageCount = 0;
    let lastCheckpointOffset = startOffset;
    const errors: string[] = [];

    try {
      // Pre-check existing active count for anomaly validation gate
      const activeCountRes = await client.query(
        `SELECT COUNT(*) as cnt FROM road_segments WHERE district = $1 AND is_active = TRUE;`,
        [district]
      );
      const existingActiveCount = parseInt(activeCountRes.rows[0]?.cnt || '0', 10);

      const gateRes = validateStagedImport({
        existingActiveCount,
        proposedDeactivations: deletedWayIdsInExtract.length,
        proposedUpdates: 0,
        isCompleteExtract,
        maxDeactivationRatio: options.maxDeactivationRatio,
      });
      if (!gateRes.ok) {
        throw new Error(gateRes.reason);
      }

      // Process in chunks with atomic transactions per chunk
      for (let i = startOffset; i < validCandidates.length; i += chunkSize) {
        const chunk = validCandidates.slice(i, i + chunkSize);
        const chunkWayIds = chunk.map((c) => c.way.id);

        // Fetch existing active segments for this chunk
        const existingRes = await client.query(
          `
          SELECT rs.id, rs.road_id, rs.osm_way_id, rs.version, rs.is_active,
                 rs.source_checksum, rs.length_m, rs.node_ids,
                 r.name as road_name, r.ref as road_ref,
                 r.has_official_name as road_has_official_name,
                 r.aliases as road_aliases
          FROM road_segments rs
          JOIN roads r ON r.id = rs.road_id
          WHERE rs.osm_way_id = ANY($1::bigint[]) AND rs.is_active = TRUE;
        `,
          [chunkWayIds]
        );

        const existingMap = new Map<number, any>();
        for (const row of existingRes.rows) {
          existingMap.set(Number(row.osm_way_id), row);
        }

        interface ItemToUpsert {
          cand: PreparedWayCandidate;
          version: number;
          parentSegmentId: string | null;
          parentLengthM: number | null;
          existingRoadId: string | null;
          existingRoadName: string | null;
          existingRoadRef: string | null;
          existingRoadHasOfficialName: boolean | null;
          resolvedRoadId?: string;
          transitionType: 'initial' | 'geometry_update' | 'split' | 'merge';
          additionalParentSegmentIds: string[];
        }

        const itemsToInsert: ItemToUpsert[] = [];
        const deactivateIds: string[] = [];

        for (const cand of chunk) {
          const existing = existingMap.get(cand.way.id);
          if (existing) {
            if (existing.source_checksum === cand.wayFingerprint) {
              skippedCount++;
              continue;
            }
            deactivateIds.push(existing.id);
          }

          const nextVersion = existing
            ? (Number(existing.version) || 1) + 1
            : cand.way.version || 1;

          itemsToInsert.push({
            cand,
            version: nextVersion,
            parentSegmentId: existing ? existing.id : null,
            parentLengthM: existing ? Number(existing.length_m || 0) : null,
            existingRoadId: existing ? existing.road_id : null,
            existingRoadName: existing ? existing.road_name : null,
            existingRoadRef: existing ? existing.road_ref : null,
            existingRoadHasOfficialName:
              existing && existing.road_has_official_name !== undefined
                ? Boolean(existing.road_has_official_name)
                : null,
            transitionType: existing ? 'geometry_update' : 'initial',
            additionalParentSegmentIds: [],
          });
        }

        if (itemsToInsert.length === 0) {
          lastCheckpointOffset = i + chunk.length;
          continue;
        }

        const inOuterTx = (client as any)._txStatus === 'T';
        const spName = `chunk_sp_${i}`;
        if (inOuterTx) {
          await client.query(`SAVEPOINT ${spName};`);
        } else {
          await client.query('BEGIN;');
        }

        try {
          // A. Detect split / merge lineage for new ways sharing nodes with deactivated/shortened ways
          for (const item of itemsToInsert) {
            if (!item.parentSegmentId && item.cand.nodeIds.length >= 2) {
              // Check if an existing segment on the same road or sharing >= 2 nodes was split/merged
              const nodeOverlapRes = await client.query(
                `
                SELECT rs.id, rs.road_id, rs.osm_way_id, rs.node_ids
                FROM road_segments rs
                WHERE rs.district = $1
                  AND rs.node_ids && $2::bigint[]
                  AND rs.osm_way_id != $3
                ORDER BY rs.updated_at DESC
                LIMIT 5;
              `,
                [district, item.cand.nodeIds, item.cand.way.id]
              );

              const sharedParents: any[] = [];
              for (const row of nodeOverlapRes.rows) {
                const rowNodes: number[] = (row.node_ids || []).map(Number);
                const sharedCount = item.cand.nodeIds.filter((n) => rowNodes.includes(n)).length;
                // Sharing >= 2 internal/boundary nodes indicates a way split or merge
                if (sharedCount >= 2) {
                  sharedParents.push(row);
                }
              }

              if (sharedParents.length === 1) {
                item.parentSegmentId = sharedParents[0].id;
                item.existingRoadId = item.existingRoadId || sharedParents[0].road_id;
                item.transitionType = 'split';
              } else if (sharedParents.length > 1) {
                item.parentSegmentId = sharedParents[0].id;
                item.additionalParentSegmentIds = sharedParents.slice(1).map((p) => p.id);
                item.existingRoadId = item.existingRoadId || sharedParents[0].road_id;
                item.transitionType = 'merge';
              }
            } else if (
              item.parentSegmentId &&
              item.parentLengthM &&
              item.cand.withinBoundaryLengthM < item.parentLengthM * 0.75
            ) {
              // If another way in this batch shares nodes with this shortened way, mark as split
              const siblingSplit = itemsToInsert.some(
                (other) =>
                  other !== item &&
                  waysShareNode(item.cand.nodeIds, other.cand.nodeIds) &&
                  other.cand.classification.displayName === item.cand.classification.displayName
              );
              if (siblingSplit) {
                item.transitionType = 'split';
                for (const other of itemsToInsert) {
                  if (
                    other !== item &&
                    !other.parentSegmentId &&
                    waysShareNode(item.cand.nodeIds, other.cand.nodeIds)
                  ) {
                    other.parentSegmentId = item.parentSegmentId;
                    other.existingRoadId = item.existingRoadId;
                    other.transitionType = 'split';
                  }
                }
              }
            }
          }

          // B. Deactivate old versions atomically
          if (deactivateIds.length > 0) {
            await client.query(
              `
              UPDATE road_segments
              SET is_active = FALSE,
                  deactivated_at = NOW(),
                  deactivation_reason = 'upstream_geometry_or_tag_revision',
                  updated_at = NOW()
              WHERE id = ANY($1::uuid[]);
            `,
              [deactivateIds]
            );
          }

          // C. Road Identity Resolution & Rename Preservation
          for (const item of itemsToInsert) {
            if (item.existingRoadId) {
              item.resolvedRoadId = item.existingRoadId;

              // Check if road was renamed or acquired/lost an official name or ref
              const newName = item.cand.classification.displayName;
              const newRef = item.cand.classification.officialRef;
              const nameChanged =
                item.existingRoadName && item.existingRoadName !== newName;
              const refChanged =
                newRef && item.existingRoadRef !== newRef;

              if (nameChanged || refChanged) {
                const aliasToAdd =
                  item.existingRoadHasOfficialName &&
                  item.existingRoadName &&
                  !item.existingRoadName.startsWith('Unnamed')
                    ? [item.existingRoadName, ...item.cand.classification.aliases]
                    : item.cand.classification.aliases;

                await client.query(
                  `
                  UPDATE roads
                  SET name = $1,
                      display_name = $1,
                      ref = COALESCE($2, ref),
                      has_official_name = $3,
                      aliases = (
                        SELECT COALESCE(array_agg(DISTINCT a), '{}')
                        FROM unnest(array_cat(COALESCE(aliases, '{}'), $4::text[])) AS a
                        WHERE a IS NOT NULL AND a <> '' AND a <> $1
                      ),
                      updated_at = NOW()
                  WHERE id = $5;
                `,
                  [
                    newName,
                    newRef,
                    item.cand.classification.hasOfficialName,
                    aliasToAdd,
                    item.existingRoadId,
                  ]
                );

                if (nameChanged) {
                  renamedCount++;
                  await client.query(
                    `
                    INSERT INTO events (
                      entity_type, entity_id, event_type, old_state, new_state, reason
                    ) VALUES (
                      'road', $1, 'road_renamed',
                      $2::jsonb, $3::jsonb,
                      'Road name or reference updated in OpenStreetMap extract; stable road ID and aliases preserved'
                    );
                  `,
                    [
                      item.existingRoadId,
                      JSON.stringify({
                        name: item.existingRoadName,
                        ref: item.existingRoadRef,
                      }),
                      JSON.stringify({
                        name: newName,
                        ref: newRef,
                        osm_way_id: item.cand.way.id,
                      }),
                    ]
                  );
                }
              }
            }
          }

          // 2. Unnamed ways: Each way preserves its distinct OSM way identity ('osm:way:' + way.id)
          const unnamedItems = itemsToInsert.filter(
            (item) => !item.resolvedRoadId && !item.cand.classification.hasOfficialName
          );
          if (unnamedItems.length > 0) {
            const unnamedSourceIds = unnamedItems.map((u) => u.cand.sourceFeatureId);
            const existingUnnamedRes = await client.query(
              `
              SELECT id, source_feature_id
              FROM roads
              WHERE source_feature_id = ANY($1::text[]);
            `,
              [unnamedSourceIds]
            );

            const unnamedRoadMap = new Map<string, string>();
            for (const r of existingUnnamedRes.rows) {
              unnamedRoadMap.set(r.source_feature_id, r.id);
            }

            const missingUnnamed = unnamedItems.filter(
              (u) => !unnamedRoadMap.has(u.cand.sourceFeatureId)
            );
            if (missingUnnamed.length > 0) {
              const uValues: string[] = [];
              const uParams: any[] = [];
              let uIdx = 1;

              for (const u of missingUnnamed) {
                uValues.push(
                  `($${uIdx++}, $${uIdx++}, $${uIdx++}, $${uIdx++}, $${uIdx++}, $${uIdx++}, $${uIdx++}, $${uIdx++}, $${uIdx++}, FALSE, FALSE, $${uIdx++}, $${uIdx++})`
                );
                uParams.push(
                  u.cand.classification.displayName,
                  u.cand.classification.displayFallback,
                  u.cand.classification.officialRef,
                  u.cand.classification.roadClass,
                  u.cand.classification.operator, // NULL if not explicitly tagged in OSM
                  state,
                  district,
                  sourceId,
                  u.cand.sourceFeatureId,
                  u.cand.classification.usageCategory,
                  u.cand.classification.accessStatus
                );
              }

              const insertUnnamedRes = await client.query(
                `
                INSERT INTO roads (
                  name, display_name, ref, road_class, authority_name, state, district,
                  source_id, source_feature_id, is_official_corridor, has_official_name,
                  usage_category, access_status
                )
                VALUES ${uValues.join(', ')}
                ON CONFLICT DO NOTHING
                RETURNING id, source_feature_id;
              `,
                uParams
              );

              for (const r of insertUnnamedRes.rows) {
                unnamedRoadMap.set(r.source_feature_id, r.id);
              }
            }

            for (const u of unnamedItems) {
              u.resolvedRoadId = unnamedRoadMap.get(u.cand.sourceFeatureId);
            }
          }

          // 3. Named ways: Reconcile official corridors vs local spatial/topological clusters
          const namedItems = itemsToInsert.filter(
            (item) => !item.resolvedRoadId && item.cand.classification.hasOfficialName
          );
          if (namedItems.length > 0) {
            const distinctNames = Array.from(
              new Set(namedItems.map((n) => n.cand.classification.displayName))
            );
            const officialRes = await client.query(
              `
              SELECT id, name
              FROM roads
              WHERE is_official_corridor = TRUE AND district = $1 AND name = ANY($2::text[]);
            `,
              [district, distinctNames]
            );

            const officialMap = new Map<string, string>();
            for (const r of officialRes.rows) {
              officialMap.set(r.name, r.id);
            }

            for (const n of namedItems) {
              const name = n.cand.classification.displayName;
              if (officialMap.has(name)) {
                n.resolvedRoadId = officialMap.get(name);
              }
            }

            // For remaining local named ways: check spatial proximity (within 500m)
            // so identically named roads in different parts of the city stay distinct!
            const remainingNamed = namedItems.filter((n) => !n.resolvedRoadId);
            const chunkLocalRoads = new Map<
              string,
              Array<{ id: string; coords: CoordPoint[]; wkt: string; nodeIds: number[] }>
            >();

            for (const item of remainingNamed) {
              const rName = item.cand.classification.displayName;
              const proxRes = await client.query(
                `
                SELECT r.id
                FROM roads r
                JOIN road_segments rs ON rs.road_id = r.id
                WHERE r.district = $1
                  AND r.name = $2
                  AND rs.is_active = TRUE
                  AND ST_DWithin(
                    rs.geom::geography,
                    ST_SetSRID(ST_GeomFromText($3), 4326)::geography,
                    500
                  )
                LIMIT 1;
              `,
                [district, rName, item.cand.clippedWkt]
              );

              if (proxRes.rows.length > 0) {
                item.resolvedRoadId = proxRes.rows[0].id;
                continue;
              }

              // Check if a road created earlier in this chunk is proximate (<500m) or shares a node
              const localCandidates = chunkLocalRoads.get(rName) || [];
              let matchedLocalId: string | null = null;
              for (const cand of localCandidates) {
                if (
                  waysShareNode(item.cand.nodeIds, cand.nodeIds) ||
                  minPolylineDistanceMeters(item.cand.clippedCoords, cand.coords) <= 500
                ) {
                  matchedLocalId = cand.id;
                  break;
                }
              }

              if (matchedLocalId) {
                item.resolvedRoadId = matchedLocalId;
                continue;
              }

              // Disconnected or new named road: create a distinct road entity
              const newRoadRes = await client.query(
                `
                INSERT INTO roads (
                  name, display_name, ref, road_class, authority_name, state, district,
                  source_id, source_feature_id, is_official_corridor, has_official_name,
                  aliases, usage_category, access_status
                )
                VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, FALSE, TRUE, $9::text[], $10, $11)
                RETURNING id;
              `,
                [
                  rName,
                  item.cand.classification.officialRef,
                  item.cand.classification.roadClass,
                  item.cand.classification.operator, // NULL when unknown
                  state,
                  district,
                  sourceId,
                  item.cand.sourceFeatureId,
                  item.cand.classification.aliases,
                  item.cand.classification.usageCategory,
                  item.cand.classification.accessStatus,
                ]
              );

              const newId = newRoadRes.rows[0].id;
              item.resolvedRoadId = newId;

              const existingList = chunkLocalRoads.get(rName) || [];
              existingList.push({
                id: newId,
                coords: item.cand.clippedCoords,
                wkt: item.cand.clippedWkt,
                nodeIds: item.cand.nodeIds,
              });
              chunkLocalRoads.set(rName, existingList);
            }
          }

          // D. Batch Insert Active Segments into road_segments
          const segValues: string[] = [];
          const segParams: any[] = [];
          let sIdx = 1;

          for (const item of itemsToInsert) {
            const roadId = item.resolvedRoadId;
            if (!roadId) continue;

            const c = item.cand;
            const cl = c.classification;

            segValues.push(`(
              $${sIdx++},
              ST_SetSRID(ST_GeomFromText($${sIdx++}), 4326),
              ST_SetSRID(ST_GeomFromText($${sIdx++}), 4326),
              $${sIdx++}, $${sIdx++},
              ARRAY[$${sIdx++}::bigint], $${sIdx++}, $${sIdx++},
              $${sIdx++}::jsonb, $${sIdx++}, $${sIdx++}, $${sIdx++},
              $${sIdx++}, $${sIdx++}, $${sIdx++}, $${sIdx++},
              $${sIdx++}, $${sIdx++}, $${sIdx++}, $${sIdx++},
              $${sIdx++}, $${sIdx++}, $${sIdx++}, $${sIdx++},
              $${sIdx++}, $${sIdx++}, $${sIdx++}::bigint[],
              $${sIdx++}, TRUE
            )`);

            segParams.push(
              roadId,
              c.clippedWkt,
              c.sourceWkt,
              state,
              district,
              c.way.id,
              c.way.id,
              item.version,
              JSON.stringify(c.way.tags || {}),
              cl.roadClass,
              cl.bridge,
              cl.tunnel,
              cl.layer,
              cl.accessRaw, // 'unknown' when absent in OSM
              cl.accessStatus,
              cl.usageCategory,
              cl.serviceSubtype,
              cl.isServiceRoad,
              cl.oneway,
              c.wayFingerprint,
              c.sourceFeatureId,
              c.withinBoundaryLengthM,
              c.withinBoundaryLengthM,
              c.sourceLengthM,
              c.crossesBoundary,
              boundary?.boundary_version || 'osm-rel-2020589-v1',
              c.nodeIds,
              item.version
            );
          }

          if (segValues.length > 0) {
            const segInsertRes = await client.query(
              `
              INSERT INTO road_segments (
                road_id, geom, source_geom, state, district,
                osm_ids, osm_way_id, osm_version,
                osm_tags, road_class, bridge, tunnel,
                layer, access, access_status, usage_category,
                service, is_service, oneway, source_checksum,
                source_feature_id, length_m, within_boundary_length_m, source_length_m,
                crosses_boundary, boundary_version, node_ids,
                version, is_active
              ) VALUES ${segValues.join(', ')}
              RETURNING id, osm_way_id, version, road_id;
            `,
              segParams
            );

            const itemsByWayId = new Map<number, ItemToUpsert>();
            for (const item of itemsToInsert) {
              itemsByWayId.set(item.cand.way.id, item);
            }

            // Build parent -> child mapping for lineage & evidence/contract safety
            const parentToChildren = new Map<string, string[]>();
            const linValues: string[] = [];
            const linParams: any[] = [];
            let lIdx = 1;

            for (const row of segInsertRes.rows) {
              const item = itemsByWayId.get(Number(row.osm_way_id));
              if (!item) continue;

              if (item.parentSegmentId) {
                const tType = item.transitionType === 'initial' ? 'geometry_update' : item.transitionType;
                const reason =
                  tType === 'split'
                    ? 'Way split into child segments in upstream OpenStreetMap extract'
                    : tType === 'merge'
                    ? 'Ways merged in upstream OpenStreetMap extract'
                    : 'Upstream OpenStreetMap geometry or attribute revision';

                linValues.push(`($${lIdx++}, $${lIdx++}, $${lIdx++}, $${lIdx++}, $${lIdx++})`);
                linParams.push(
                  row.id,
                  item.parentSegmentId,
                  tType,
                  reason,
                  `osm:${row.osm_way_id}:v${row.version}`
                );

                const list = parentToChildren.get(item.parentSegmentId) || [];
                list.push(row.id);
                parentToChildren.set(item.parentSegmentId, list);

                if (tType === 'split') splitLineageCount++;
                else if (tType === 'merge') mergeLineageCount++;
                updatedVersionsCount++;

                for (const extraParentId of item.additionalParentSegmentIds) {
                  linValues.push(`($${lIdx++}, $${lIdx++}, 'merge', 'Merged from multiple parent ways', $${lIdx++})`);
                  linParams.push(row.id, extraParentId, `osm:${row.osm_way_id}:v${row.version}`);
                }
              } else {
                linValues.push(
                  `($${lIdx++}, NULL, 'initial', 'Initial import from verified OSM extract (ODbL 1.0)', $${lIdx++})`
                );
                linParams.push(row.id, `osm:${row.osm_way_id}:v${row.version}`);
                insertedCount++;
              }
            }

            if (linValues.length > 0) {
              await client.query(
                `
                INSERT INTO road_segment_lineage (
                  segment_id, parent_segment_id, transition_type, reason, source_version
                ) VALUES ${linValues.join(', ')};
              `,
                linParams
              );
            }

            // E. Evidence & Government Work-Association Safety on Revised/Split Segments
            // Rules:
            // 1. Never move a citizen's observed_point or incident centroid.
            // 2. Never automatically transfer contracts/works to every child segment on a split;
            //    instead retain historical work_segments and route uncertain associations to ambiguous_matches_queue.
            // 3. Never overwrite manual_verified associations.
            for (const [parentSegId, childSegIds] of parentToChildren.entries()) {
              const workAssocs = await client.query(
                `
                SELECT ws.work_id, ws.chainage_start_km, ws.chainage_end_km,
                       ws.matching_confidence, ws.review_status, ws.review_notes,
                       w.tender_id, w.authority_name, w.package_name,
                       r.name as road_name, r.district
                FROM work_segments ws
                JOIN works w ON w.id = ws.work_id
                JOIN road_segments rs ON rs.id = ws.road_segment_id
                JOIN roads r ON r.id = rs.road_id
                WHERE ws.road_segment_id = $1;
              `,
                [parentSegId]
              );

              for (const wa of workAssocs.rows) {
                if (childSegIds.length > 1) {
                  // Parent segment was SPLIT into multiple child segments:
                  // Do NOT auto-attach the work to all children; route to review queue!
                  await client.query(
                    `
                    INSERT INTO ambiguous_matches_queue (
                      work_id, tender_id, district, authority_name, road_name_hint,
                      chainage_start_km, chainage_end_km, candidate_segment_ids,
                      reason, status
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 'pending')
                    ON CONFLICT DO NOTHING;
                  `,
                    [
                      wa.work_id,
                      wa.tender_id || `WORK-${wa.work_id}`,
                      wa.district || district,
                      wa.authority_name,
                      wa.road_name,
                      wa.chainage_start_km,
                      wa.chainage_end_km,
                      JSON.stringify(childSegIds),
                      `Road segment ${parentSegId} split into ${childSegIds.length} child segments in upstream OSM extract; human review required before re-linking contract.`,
                    ]
                  );
                  reviewRoutedCount++;
                } else if (childSegIds.length === 1) {
                  // 1-to-1 geometry revision: preserve association if not manual_verified conflict,
                  // or route to review while keeping manual_verified notes intact.
                  const childId = childSegIds[0];
                  await client.query(
                    `
                    INSERT INTO work_segments (
                      work_id, road_segment_id, chainage_start_km, chainage_end_km,
                      matching_confidence, review_status, review_notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (work_id, road_segment_id) DO NOTHING;
                  `,
                    [
                      wa.work_id,
                      childId,
                      wa.chainage_start_km,
                      wa.chainage_end_km,
                      wa.matching_confidence,
                      wa.review_status,
                      wa.review_notes,
                    ]
                  );
                }
              }
            }
          }

          lastCheckpointOffset = i + chunk.length;
          await client.query(
            `UPDATE osm_imports SET checkpoint_offset = $1 WHERE id = $2;`,
            [lastCheckpointOffset, runId]
          );

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

      // F. Handle Explicit OSM Way Deletions (ONLY when confirmed deleted or complete extract)
      if (deletedWayIdsInExtract.length > 0 && isCompleteExtract) {
        const delRes = await client.query(
          `
          UPDATE road_segments
          SET is_active = FALSE,
              deactivated_at = NOW(),
              deactivation_reason = 'confirmed_upstream_osm_deletion',
              updated_at = NOW()
          WHERE district = $1
            AND osm_way_id = ANY($2::bigint[])
            AND is_active = TRUE
          RETURNING id;
        `,
          [district, deletedWayIdsInExtract]
        );
        deactivatedCount = delRes.rowCount || 0;
      }

      // G. Register District-Wide Coverage Sector when Complete Extract Imported
      if (coverageStatus === 'complete_district' && boundary) {
        const [minLon, minLat, maxLon, maxLat] = boundary.bbox;
        await client.query(
          `
          INSERT INTO imported_coverage_sectors (
            district, sector_key, sector_name, bounds_geom, ways_count, status, last_imported_at
          ) VALUES (
            $1, 'bengaluru_urban_full', 'Bengaluru Urban Administrative District (Full Coverage)',
            ST_MakeEnvelope($2, $3, $4, $5, 4326),
            $6, 'completed', NOW()
          )
          ON CONFLICT (district, sector_key) DO UPDATE
          SET bounds_geom = EXCLUDED.bounds_geom,
              ways_count = EXCLUDED.ways_count,
              status = 'completed',
              last_imported_at = NOW();
        `,
          [district, minLon, minLat, maxLon, maxLat, validCandidates.length]
        );
      }

      const changeSummary = {
        boundary_version: boundary?.boundary_version || 'unbounded',
        boundary_checksum: boundary?.checksum_sha256 || '',
        parser_version: PARSER_VERSION,
        total_elements: rawElements.length,
        valid_ways: validCandidates.length,
        new_inserted: insertedCount,
        updated_versions: updatedVersionsCount,
        unchanged_skipped: skippedCount,
        rejected_count: rejectedCount,
        deactivated_count: deactivatedCount,
        review_routed_count: reviewRoutedCount,
        renamed_count: renamedCount,
        split_lineage_count: splitLineageCount,
        merge_lineage_count: mergeLineageCount,
        boundary_crossing_ways: boundaryCrossingWaysCount,
        within_boundary_length_m: Number(totalWithinBoundaryLengthM.toFixed(2)),
        motor_road_length_m: Number(totalMotorRoadLengthM.toFixed(2)),
        rejection_breakdown: rejectionBreakdown,
        category_breakdown: categoryBreakdown,
        access_breakdown: accessBreakdown,
      };

      // Complete Import Ledger Run
      await client.query(
        `
        UPDATE osm_imports
        SET status = 'completed',
            ways_count = $1,
            inserted_count = $2,
            updated_count = $3,
            skipped_count = $4,
            rejected_count = $5,
            deactivated_count = $6,
            review_routed_count = $7,
            within_boundary_length_m = $8,
            motor_road_length_m = $9,
            rejection_breakdown = $10::jsonb,
            change_summary = $11::jsonb,
            checkpoint_offset = $1,
            completed_at = NOW()
        WHERE id = $12;
      `,
        [
          validCandidates.length,
          insertedCount,
          updatedVersionsCount,
          skippedCount,
          rejectedCount,
          deactivatedCount,
          reviewRoutedCount,
          Number(totalWithinBoundaryLengthM.toFixed(2)),
          Number(totalMotorRoadLengthM.toFixed(2)),
          JSON.stringify(rejectionBreakdown),
          JSON.stringify(changeSummary),
          runId,
        ]
      );
    } catch (err: any) {
      errors.push(err.message);
      try {
        await client.query(
          `
          UPDATE osm_imports
          SET status = 'failed',
              error_details = $1,
              completed_at = NOW()
          WHERE id = $2;
        `,
          [err.message, runId]
        );
      } catch {}
      throw err;
    }

    return {
      runId,
      district,
      boundary_version: boundary?.boundary_version || 'unbounded',
      boundary_checksum: boundary?.checksum_sha256 || '',
      parser_version: PARSER_VERSION,
      source_checksum: fullChecksum,
      source_timestamp: sourceTimestamp,
      dry_run: false,
      total_elements: rawElements.length,
      valid_ways: validCandidates.length,
      new_inserted: insertedCount,
      updated_versions: updatedVersionsCount,
      unchanged_skipped: skippedCount,
      rejected_count: rejectedCount,
      deactivated_count: deactivatedCount,
      review_routed_count: reviewRoutedCount,
      renamed_count: renamedCount,
      split_lineage_count: splitLineageCount,
      merge_lineage_count: mergeLineageCount,
      boundary_crossing_ways: boundaryCrossingWaysCount,
      within_boundary_length_m: Number(totalWithinBoundaryLengthM.toFixed(2)),
      motor_road_length_m: Number(totalMotorRoadLengthM.toFixed(2)),
      rejection_breakdown: rejectionBreakdown,
      category_breakdown: categoryBreakdown,
      access_breakdown: accessBreakdown,
      checkpoint_offset: lastCheckpointOffset,
      storage_archived_key: storageKey,
      attribution: 'OpenStreetMap Contributors (https://www.openstreetmap.org/copyright)',
      license: rawPayload.license || 'ODbL 1.0',
      errors,
    };
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtext($1));', [lockKey]);
      } catch {}
    }
  }
}
