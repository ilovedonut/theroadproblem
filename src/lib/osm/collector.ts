import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { importOsmRoads } from './importer.ts';
import type { OsmImportPayload, OsmImportSummary } from './importer.ts';

export interface DistrictSector {
  sector_key: string;
  sector_name: string;
  district: string;
  state: string;
  // [minLon, minLat, maxLon, maxLat]
  bbox: [number, number, number, number];
}

export const BENGALURU_URBAN_SECTORS: DistrictSector[] = [
  {
    sector_key: 'bengaluru_cbd',
    sector_name: 'Bengaluru CBD & Central Arterials',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    bbox: [77.5600, 12.9400, 77.6400, 13.0000]
  },
  {
    sector_key: 'bengaluru_south_hosur',
    sector_name: 'Bengaluru South & Hosur Road Corridor',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    bbox: [77.5800, 12.8200, 77.7100, 12.9400]
  },
  {
    sector_key: 'bengaluru_east_orr',
    sector_name: 'Bengaluru East & Whitefield / Outer Ring Road Corridor',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    bbox: [77.6400, 12.9200, 77.7800, 13.0400]
  },
  {
    sector_key: 'bengaluru_north_airport',
    sector_name: 'Bengaluru North & Airport Highway Corridor',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    bbox: [77.5400, 13.0000, 77.6800, 13.1800]
  },
  {
    sector_key: 'bengaluru_west_arterials',
    sector_name: 'Bengaluru West & Mysore Road Corridor',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    bbox: [77.4600, 12.9000, 77.5600, 13.0200]
  }
];

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

/**
 * Builds Overpass QL query for a geographic bounding box.
 */
export function buildOverpassQuery(bbox: [number, number, number, number], timeoutSeconds: number = 60): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return `[out:json][timeout:${timeoutSeconds}];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${minLat},${minLon},${maxLat},${maxLon});
);
out body geom qt;`;
}

/**
 * Fetches OSM road data for a sector across Overpass mirrors with backoff and verified local sector caching.
 * NOTE: Never silently substitutes demo or sample road arrays on failure.
 */
export async function fetchSectorOsmData(
  sector: DistrictSector,
  options: {
    maxRetriesPerMirror?: number;
    timeoutMs?: number;
    allowCachedSector?: boolean;
  } = {}
): Promise<OsmImportPayload> {
  const maxRetries = options.maxRetriesPerMirror || 2;
  const timeoutMs = options.timeoutMs || 25000;
  const ql = buildOverpassQuery(sector.bbox);

  const cacheDir = path.resolve('scripts/data/sectors');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const cacheFile = path.join(cacheDir, `${sector.sector_key}.json`);

  for (const mirror of OVERPASS_MIRRORS) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(mirror, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'TheRoadProblem-Collector/2.0 (civic-road-audit)'
          },
          body: `data=${encodeURIComponent(ql)}`,
          signal: controller.signal
        });
        clearTimeout(timer);

        if (res.ok) {
          const raw = await res.json();
          if (Array.isArray(raw.elements) && raw.elements.length > 0) {
            const payload: OsmImportPayload = {
              district: sector.district,
              state: sector.state,
              source: `OpenStreetMap / Overpass (${new URL(mirror).hostname})`,
              license: 'Open Database License (ODbL) 1.0',
              retrieved_at: new Date().toISOString(),
              source_uri: mirror,
              is_complete_extract: false,
              elements: raw.elements
            };

            fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2), 'utf8');
            return payload;
          }
        }
      } catch {
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }

  if (options.allowCachedSector !== false && fs.existsSync(cacheFile)) {
    console.warn(`[Collector] Overpass mirrors unavailable. Using previously verified sector cache for ${sector.sector_key}`);
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }

  throw new Error(
    `Failed to fetch sector data for ${sector.sector_key} from Overpass mirrors and no verified sector cache exists. Refusing to substitute demo/sample fallback data.`
  );
}

/**
 * Collects and imports a district sector with idempotency and coverage sector registration.
 */
export async function collectAndImportSector(
  client: pg.PoolClient,
  sector: DistrictSector,
  options: {
    force?: boolean;
    limit?: number;
  } = {}
): Promise<OsmImportSummary> {
  const [minLon, minLat, maxLon, maxLat] = sector.bbox;

  if (!options.force) {
    const checkRes = await client.query(`
      SELECT id, ways_count, status, last_imported_at
      FROM imported_coverage_sectors
      WHERE district = $1 AND sector_key = $2 AND status = 'completed';
    `, [sector.district, sector.sector_key]);

    if (checkRes.rows.length > 0) {
      const existing = checkRes.rows[0];
      const ageHours = (Date.now() - new Date(existing.last_imported_at).getTime()) / (1000 * 60 * 60);
      if (ageHours < 24 * 7) {
        return {
          runId: `cached-${existing.id}`,
          district: sector.district,
          boundary_version: 'sector-cached',
          boundary_checksum: '',
          parser_version: '2.0.0',
          source_checksum: '',
          source_timestamp: new Date(existing.last_imported_at).toISOString(),
          dry_run: false,
          total_elements: existing.ways_count,
          valid_ways: existing.ways_count,
          new_inserted: 0,
          updated_versions: 0,
          unchanged_skipped: existing.ways_count,
          rejected_count: 0,
          deactivated_count: 0,
          review_routed_count: 0,
          renamed_count: 0,
          split_lineage_count: 0,
          merge_lineage_count: 0,
          boundary_crossing_ways: 0,
          within_boundary_length_m: 0,
          motor_road_length_m: 0,
          rejection_breakdown: {},
          category_breakdown: {},
          access_breakdown: {},
          checkpoint_offset: existing.ways_count,
          storage_archived_key: `cached_sector_${sector.sector_key}`,
          attribution: 'OpenStreetMap Contributors (https://www.openstreetmap.org/copyright)',
          license: 'ODbL 1.0',
          errors: []
        };
      }
    }
  }

  const payload = await fetchSectorOsmData(sector);

  const summary = await importOsmRoads(client, {
    district: sector.district,
    state: sector.state,
    payload,
    isCompleteExtract: false,
    limit: options.limit
  });

  await client.query(`
    INSERT INTO imported_coverage_sectors (
      district, sector_key, sector_name, bounds_geom, ways_count, status, last_imported_at
    ) VALUES (
      $1, $2, $3,
      ST_MakeEnvelope($4, $5, $6, $7, 4326),
      $8, 'completed', NOW()
    )
    ON CONFLICT (district, sector_key) DO UPDATE
    SET bounds_geom = EXCLUDED.bounds_geom,
        sector_name = EXCLUDED.sector_name,
        ways_count = EXCLUDED.ways_count,
        status = 'completed',
        last_imported_at = NOW();
  `, [
    sector.district,
    sector.sector_key,
    sector.sector_name,
    minLon,
    minLat,
    maxLon,
    maxLat,
    summary.valid_ways
  ]);

  return summary;
}
