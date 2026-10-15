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
 * Fetches OSM road data for a sector across Overpass mirrors with backoff and caching.
 */
export async function fetchSectorOsmData(
  sector: DistrictSector,
  options: {
    maxRetriesPerMirror?: number;
    timeoutMs?: number;
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
            'User-Agent': 'TheRoadProblem-Collector/1.0 (civic-road-audit)'
          },
          body: `data=${encodeURIComponent(ql)}`,
          signal: controller.signal
        });
        clearTimeout(timer);

        if (res.ok) {
          const raw = await res.json();
          if (Array.isArray(raw.elements)) {
            const payload: OsmImportPayload = {
              district: sector.district,
              state: sector.state,
              source: `OpenStreetMap / Overpass (${new URL(mirror).hostname})`,
              license: 'Open Database License (ODbL) 1.0',
              retrieved_at: new Date().toISOString(),
              source_uri: mirror,
              elements: raw.elements
            };

            // Save to sector cache
            fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2), 'utf8');
            return payload;
          }
        }
      } catch (fetchErr: any) {
        // Exponential backoff before next attempt
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }

  // Fallback to local cache if present
  if (fs.existsSync(cacheFile)) {
    console.warn(`[Collector] Overpass mirrors unavailable. Falling back to cached extract for ${sector.sector_key}`);
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }

  // Fallback to local sample if bounding box intersects sample
  const samplePath = path.resolve('scripts/data/bengaluru_roads_osm_sample.json');
  if (fs.existsSync(samplePath)) {
    console.warn(`[Collector] Falling back to sample extract for ${sector.sector_key}`);
    const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
    const [minLon, minLat, maxLon, maxLat] = sector.bbox;
    const filtered = sample.elements.filter((el: any) => {
      if (!el.geometry) return false;
      return el.geometry.some((pt: any) => pt.lon >= minLon && pt.lon <= maxLon && pt.lat >= minLat && pt.lat <= maxLat);
    });
    return {
      district: sector.district,
      state: sector.state,
      source: 'OpenStreetMap Sample Fallback',
      license: sample.license || 'Open Database License (ODbL) 1.0',
      retrieved_at: new Date().toISOString(),
      source_uri: sample.source_uri,
      elements: filtered
    };
  }

  throw new Error(`Failed to fetch sector data for ${sector.sector_key} from Overpass mirrors and no local cache available.`);
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

  // Check if sector was already imported recently
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
          total_elements: existing.ways_count,
          valid_ways: existing.ways_count,
          new_inserted: 0,
          updated_versions: 0,
          unchanged_skipped: existing.ways_count,
          storage_archived_key: `cached_sector_${sector.sector_key}`,
          attribution: 'OpenStreetMap Contributors (https://www.openstreetmap.org/copyright)',
          license: 'ODbL 1.0',
          errors: []
        };
      }
    }
  }

  // Fetch sector data
  const payload = await fetchSectorOsmData(sector);

  // Import into database
  const summary = await importOsmRoads(client, {
    district: sector.district,
    state: sector.state,
    payload,
    limit: options.limit
  });

  // Record sector coverage in imported_coverage_sectors
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
