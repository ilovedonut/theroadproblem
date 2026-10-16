#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

// 1. Resolve database credentials before loading the db client
if (!process.env.DATABASE_URL) {
  const envCandidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(import.meta.dirname, '../.env.local'),
    'C:/Users/shiva/Desktop/the road problem/.env.local',
  ];
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch {
        // fallback
      }
      if (process.env.DATABASE_URL) break;
    }
  }
}

import { query, pool } from '../src/db/client.ts';

// Tile Coordinate Math
export function lon2tile(lon, z) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}

export function lat2tile(lat, z) {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
}

export function tile2lon(x, z) {
  return (x / Math.pow(2, z)) * 360 - 180;
}

export function tile2lat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function tile2bbox(z, x, y) {
  return {
    west: tile2lon(x, z),
    south: tile2lat(y + 1, z),
    east: tile2lon(x + 1, z),
    north: tile2lat(y, z),
  };
}

/**
 * Zoom hierarchy SQL filter:
 * - Zoom 10-11: Major highways ('motorway','trunk','primary','secondary','tertiary' and links)
 *   or official corridors.
 * - Zoom 12-13: Major highways + collectors ('unclassified','road').
 * - Zoom 14+: All active motor carriageways.
 */
export function getZoomHierarchyFilter(z) {
  if (z <= 11) {
    const majorClasses =
      "'motorway','trunk','primary','secondary','tertiary','motorway_link','trunk_link','primary_link','secondary_link','tertiary_link'";
    return `AND (COALESCE(rs.road_class, r.road_class) IN (${majorClasses}) OR r.is_official_corridor = true)`;
  } else if (z <= 13) {
    const collectorClasses =
      "'motorway','trunk','primary','secondary','tertiary','motorway_link','trunk_link','primary_link','secondary_link','tertiary_link','unclassified','road'";
    return `AND (COALESCE(rs.road_class, r.road_class) IN (${collectorClasses}) OR r.is_official_corridor = true)`;
  } else {
    // Zoom 14+: All active motor carriageways
    return ``;
  }
}

/**
 * Generate a single MVT tile directly using PostGIS native functions:
 * ST_TileEnvelope and ST_AsMVT with ST_AsMVTGeom
 */
export async function buildRoadTile(z, x, y) {
  const zoomFilter = getZoomHierarchyFilter(z);
  const sql = `
    WITH bounds AS (
      SELECT
        ST_TileEnvelope($1, $2, $3) AS geom_3857,
        ST_Transform(ST_TileEnvelope($1, $2, $3), 4326) AS geom_4326
    ),
    tile_features AS (
      SELECT
        rs.road_id,
        r.name,
        r.ref,
        COALESCE(rs.road_class, r.road_class) AS road_class,
        r.authority_name,
        ST_AsMVTGeom(
          ST_Transform(rs.geom, 3857),
          b.geom_3857,
          4096,
          64,
          true
        ) AS geom
      FROM road_segments rs
      JOIN roads r ON rs.road_id = r.id
      CROSS JOIN bounds b
      WHERE rs.is_active = true
        AND (rs.usage_category IS NULL OR rs.usage_category IN ('public_motor', 'restricted_motor'))
        AND rs.geom && b.geom_4326
        AND ST_Intersects(rs.geom, b.geom_4326)
        ${zoomFilter}
    )
    SELECT ST_AsMVT(tile_features, 'roads', 4096, 'geom') AS mvt
    FROM tile_features
    WHERE geom IS NOT NULL
  `;

  const res = await query(sql, [z, x, y]);
  const mvt = res.rows[0]?.mvt;
  return Buffer.isBuffer(mvt) ? mvt : Buffer.alloc(0);
}

export function findMvtFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.mvt')) {
        files.push(fullPath);
      }
    }
  }
  walk(dir);
  return files;
}

export function calculateDiskStats(dir, totalGridTiles) {
  const files = findMvtFiles(dir);
  let totalBytes = 0;
  for (const file of files) {
    const stat = fs.statSync(file);
    totalBytes += stat.size;
  }
  const writtenTiles = files.length;
  const totalTiles = Math.max(totalGridTiles || 0, writtenTiles);
  const skippedTiles = Math.max(0, totalTiles - writtenTiles);
  return {
    total_tiles: totalTiles,
    written_tiles: writtenTiles,
    skipped_empty_tiles: skippedTiles,
    total_bytes: totalBytes,
  };
}

export function parseCliArgs(argv) {
  const opts = {
    bbox: [77.4759, 12.8179, 77.7384, 13.1535], // default Bengaluru Urban
    minZoom: 10,
    maxZoom: 14,
    outDir: path.resolve('output/tiles/bengaluru'),
    publishDir: path.resolve('public/tiles/roads/bengaluru'),
    version: '20261016',
    publish: true,
    single: null,
    dryRun: false,
    concurrency: 4,
    clean: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--bbox' && argv[i + 1]) {
      opts.bbox = argv[++i].split(',').map((v) => parseFloat(v.trim()));
    } else if (arg.startsWith('--bbox=')) {
      opts.bbox = arg.slice(7).split(',').map((v) => parseFloat(v.trim()));
    } else if (arg === '--min-zoom' && argv[i + 1]) {
      opts.minZoom = parseInt(argv[++i], 10);
    } else if (arg.startsWith('--min-zoom=')) {
      opts.minZoom = parseInt(arg.slice(11), 10);
    } else if (arg === '--max-zoom' && argv[i + 1]) {
      opts.maxZoom = parseInt(argv[++i], 10);
    } else if (arg.startsWith('--max-zoom=')) {
      opts.maxZoom = parseInt(arg.slice(11), 10);
    } else if (arg === '--out-dir' && argv[i + 1]) {
      opts.outDir = path.resolve(argv[++i]);
    } else if (arg.startsWith('--out-dir=')) {
      opts.outDir = path.resolve(arg.slice(10));
    } else if (arg === '--publish-dir' && argv[i + 1]) {
      opts.publishDir = path.resolve(argv[++i]);
    } else if (arg.startsWith('--publish-dir=')) {
      opts.publishDir = path.resolve(arg.slice(14));
    } else if (arg === '--version' && argv[i + 1]) {
      opts.version = argv[++i].trim();
    } else if (arg.startsWith('--version=')) {
      opts.version = arg.slice(10).trim();
    } else if (arg === '--publish') {
      opts.publish = true;
    } else if (arg === '--no-publish' || arg === '--publish=false') {
      opts.publish = false;
    } else if (arg === '--single' && argv[i + 1]) {
      const parts = argv[++i].split(',').map((v) => parseInt(v.trim(), 10));
      opts.single = { z: parts[0], x: parts[1], y: parts[2] };
    } else if (arg.startsWith('--single=')) {
      const parts = arg.slice(9).split(',').map((v) => parseInt(v.trim(), 10));
      opts.single = { z: parts[0], x: parts[1], y: parts[2] };
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--concurrency' && argv[i + 1]) {
      opts.concurrency = parseInt(argv[++i], 10);
    } else if (arg.startsWith('--concurrency=')) {
      opts.concurrency = parseInt(arg.slice(14), 10);
    } else if (arg === '--clean') {
      opts.clean = true;
    } else if (arg === '--no-clean') {
      opts.clean = false;
    }
  }

  return opts;
}

export function writeTileManifest(targetDir, stats, bbox, minZoom, maxZoom, extraMeta = {}) {
  const manifestPath = path.join(targetDir, 'manifest.json');
  const diskStats = calculateDiskStats(targetDir, stats?.total_tiles);

  const manifest = {
    name: 'bengaluru-roads',
    description: 'PostGIS Mapbox Vector Tiles for Bengaluru road network',
    version: '1.0.0',
    active_version: extraMeta.activeVersion || '20261016',
    city: 'bengaluru',
    format: 'mvt',
    bounds: bbox,
    center: [
      (bbox[0] + bbox[2]) / 2,
      (bbox[1] + bbox[3]) / 2,
      Math.floor((minZoom + maxZoom) / 2),
    ],
    minzoom: minZoom,
    maxzoom: maxZoom,
    min_zoom: minZoom,
    max_zoom: maxZoom,
    tile_template: extraMeta.tileTemplate || `/tiles/roads/bengaluru/${extraMeta.activeVersion || '20261016'}/{z}/{x}/{y}.mvt`,
    attribution: '© OpenStreetMap contributors, BBMP, KRDCL, NHAI',
    layers: [
      {
        id: 'roads',
        description: 'Active road carriageways with official attributes',
        fields: {
          road_id: 'String (UUID)',
          name: 'String',
          ref: 'String',
          road_class: 'String',
          authority_name: 'String',
        },
      },
    ],
    vector_layers: [
      {
        id: 'roads',
        description: 'Active road carriageways with official attributes',
        fields: {
          road_id: 'String (UUID)',
          name: 'String',
          ref: 'String',
          road_class: 'String',
          authority_name: 'String',
        },
      },
    ],
    tile_stats: diskStats,
    last_generated_at: new Date().toISOString(),
  };

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

async function run() {
  const opts = parseCliArgs(process.argv.slice(2));

  console.log('='.repeat(78));
  console.log(' BENGALURU ROAD VECTOR TILE GENERATOR (MVT)');
  console.log('='.repeat(78));
  console.log(` Output Directory:   ${opts.outDir}`);
  if (opts.publish) {
    console.log(` Publish Directory:  ${path.join(opts.publishDir, opts.version)}`);
  }
  console.log(` Bounding Box:       [${opts.bbox.join(', ')}]`);
  console.log(` Mode:               ${opts.dryRun ? 'DRY RUN' : opts.single ? 'SINGLE TILE' : 'BATCH PYRAMID'}`);

  if (opts.single) {
    const { z, x, y } = opts.single;
    console.log(` Target Tile:        z=${z}, x=${x}, y=${y}`);
    const bbox = tile2bbox(z, x, y);
    console.log(` Tile Bounds:        [${bbox.west.toFixed(5)}, ${bbox.south.toFixed(5)}, ${bbox.east.toFixed(5)}, ${bbox.north.toFixed(5)}]`);

    if (opts.dryRun) {
      console.log(' [Dry Run] Would generate tile without writing to disk.');
      await pool.end();
      process.exit(0);
    }

    const t0 = Date.now();
    const mvt = await buildRoadTile(z, x, y);
    const duration = Date.now() - t0;

    const tileDir = path.join(opts.outDir, String(z), String(x));
    const tilePath = path.join(tileDir, `${y}.mvt`);

    fs.mkdirSync(tileDir, { recursive: true });
    fs.writeFileSync(tilePath, mvt);

    console.log(` ✓ Tile written to:  ${tilePath}`);
    console.log(`   Tile size:        ${mvt.length.toLocaleString()} bytes`);
    console.log(`   Generation time:  ${duration}ms`);

    writeTileManifest(opts.outDir, { total_tiles: 1 }, [bbox.west, bbox.south, bbox.east, bbox.north], z, z, {
      activeVersion: opts.version,
    });
    console.log(` ✓ Manifest updated: ${path.join(opts.outDir, 'manifest.json')}`);

    if (opts.publish) {
      const pubTileDir = path.join(opts.publishDir, opts.version, String(z), String(x));
      const pubTilePath = path.join(pubTileDir, `${y}.mvt`);
      fs.mkdirSync(pubTileDir, { recursive: true });
      fs.writeFileSync(pubTilePath, mvt);
      console.log(` ✓ Published tile:   ${pubTilePath}`);

      writeTileManifest(opts.publishDir, { total_tiles: 1 }, [bbox.west, bbox.south, bbox.east, bbox.north], z, z, {
        activeVersion: opts.version,
        tileTemplate: `/tiles/roads/bengaluru/${opts.version}/{z}/{x}/{y}.mvt`,
      });
      console.log(` ✓ Published manifest updated: ${path.join(opts.publishDir, 'manifest.json')}`);
    }

    await pool.end();
    return;
  }

  // Calculate tiles to generate across zoom range
  const tilesToGenerate = [];
  const [west, south, east, north] = opts.bbox;

  for (let z = opts.minZoom; z <= opts.maxZoom; z++) {
    const minX = Math.min(lon2tile(west, z), lon2tile(east, z));
    const maxX = Math.max(lon2tile(west, z), lon2tile(east, z));
    const minY = Math.min(lat2tile(north, z), lat2tile(south, z));
    const maxY = Math.max(lat2tile(north, z), lat2tile(south, z));

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tilesToGenerate.push({ z, x, y });
      }
    }
  }

  console.log(` Zoom Levels:        ${opts.minZoom} -> ${opts.maxZoom}`);
  console.log(` Total Tile Count:   ${tilesToGenerate.length} tiles`);

  if (opts.dryRun) {
    console.log('\n[Dry Run] Planned tiles by zoom level:');
    for (let z = opts.minZoom; z <= opts.maxZoom; z++) {
      const count = tilesToGenerate.filter((t) => t.z === z).length;
      console.log(`  - Zoom ${z}: ${count} tiles`);
    }
    console.log('\n[Dry Run] Complete. No tiles written.');
    await pool.end();
    process.exit(0);
  }

  // Clean output directory for target zooms if clean is requested
  if (opts.clean) {
    for (let z = opts.minZoom; z <= opts.maxZoom; z++) {
      const zDir = path.join(opts.outDir, String(z));
      if (fs.existsSync(zDir)) {
        fs.rmSync(zDir, { recursive: true, force: true });
      }
      if (opts.publish) {
        const pubZDir = path.join(opts.publishDir, opts.version, String(z));
        if (fs.existsSync(pubZDir)) {
          fs.rmSync(pubZDir, { recursive: true, force: true });
        }
      }
    }
  }

  let written = 0;
  let skipped = 0;
  let totalBytes = 0;
  const startTime = Date.now();

  // Process tiles with concurrency pool
  let cursor = 0;
  async function worker() {
    while (cursor < tilesToGenerate.length) {
      const idx = cursor++;
      const { z, x, y } = tilesToGenerate[idx];
      const mvt = await buildRoadTile(z, x, y);

      if (mvt.length === 0) {
        skipped++;
      } else {
        const tileDir = path.join(opts.outDir, String(z), String(x));
        const tilePath = path.join(tileDir, `${y}.mvt`);
        fs.mkdirSync(tileDir, { recursive: true });
        fs.writeFileSync(tilePath, mvt);

        if (opts.publish) {
          const pubTileDir = path.join(opts.publishDir, opts.version, String(z), String(x));
          const pubTilePath = path.join(pubTileDir, `${y}.mvt`);
          fs.mkdirSync(pubTileDir, { recursive: true });
          fs.writeFileSync(pubTilePath, mvt);
        }

        written++;
        totalBytes += mvt.length;
      }

      if ((written + skipped) % 25 === 0 || written + skipped === tilesToGenerate.length) {
        console.log(`  Progress: ${written + skipped}/${tilesToGenerate.length} tiles (${written} written, ${skipped} skipped empty, ${(totalBytes / 1024).toFixed(1)} KB)`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(opts.concurrency, tilesToGenerate.length) }, () => worker());
  await Promise.all(workers);

  const totalDuration = Date.now() - startTime;
  console.log('\nGeneration Summary:');
  console.log(`  Total Tiles Checked: ${tilesToGenerate.length}`);
  console.log(`  Tiles Written:       ${written}`);
  console.log(`  Empty Tiles Skipped: ${skipped}`);
  console.log(`  Total Tile Payload:  ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`  Duration:            ${(totalDuration / 1000).toFixed(2)}s`);

  writeTileManifest(opts.outDir, { total_tiles: tilesToGenerate.length }, opts.bbox, opts.minZoom, opts.maxZoom, {
    activeVersion: opts.version,
  });
  console.log(` ✓ Manifest saved:     ${path.join(opts.outDir, 'manifest.json')}`);

  if (opts.publish) {
    writeTileManifest(
      opts.publishDir,
      { total_tiles: tilesToGenerate.length },
      opts.bbox,
      opts.minZoom,
      opts.maxZoom,
      {
        activeVersion: opts.version,
        tileTemplate: `/tiles/roads/bengaluru/${opts.version}/{z}/{x}/{y}.mvt`,
      }
    );
    console.log(` ✓ Published manifest: ${path.join(opts.publishDir, 'manifest.json')}`);
  }

  await pool.end();
}

// Execute when run as CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename || '')) {
  run().catch(async (err) => {
    console.error('Fatal error building road tiles:', err);
    try {
      await pool.end();
    } catch {}
    process.exit(1);
  });
}
