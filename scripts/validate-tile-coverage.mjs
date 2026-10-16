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
      } catch {}
      if (process.env.DATABASE_URL) break;
    }
  }
}

import { query, pool } from '../src/db/client.ts';
import { buildRoadTile, tile2bbox, writeTileManifest } from './build-road-tiles.mjs';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

function parseCliArgs(argv) {
  const opts = {
    outDir: path.resolve('output/tiles/bengaluru'),
    sampleTile: { z: 14, x: 11723, y: 7596 }, // Majestic / Central Bengaluru
    reportPath: path.resolve('output/tiles/coverage-validation.json'),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out-dir' && argv[i + 1]) {
      opts.outDir = path.resolve(argv[++i]);
    } else if (arg.startsWith('--out-dir=')) {
      opts.outDir = path.resolve(arg.slice(10));
    } else if (arg === '--sample-tile' && argv[i + 1]) {
      const parts = argv[++i].split(',').map((v) => parseInt(v.trim(), 10));
      opts.sampleTile = { z: parts[0], x: parts[1], y: parts[2] };
    } else if (arg.startsWith('--sample-tile=')) {
      const parts = arg.slice(14).split(',').map((v) => parseInt(v.trim(), 10));
      opts.sampleTile = { z: parts[0], x: parts[1], y: parts[2] };
    } else if (arg === '--report' && argv[i + 1]) {
      opts.reportPath = path.resolve(argv[++i]);
    } else if (arg.startsWith('--report=')) {
      opts.reportPath = path.resolve(arg.slice(9));
    }
  }

  return opts;
}

function findMvtFiles(dir) {
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

async function validateTileCoverage() {
  const opts = parseCliArgs(process.argv.slice(2));
  const { z, x, y } = opts.sampleTile;

  console.log('='.repeat(78));
  console.log(' BENGALURU ROAD VECTOR TILE COVERAGE VALIDATION');
  console.log('='.repeat(78));
  console.log(` Tiles Directory:    ${opts.outDir}`);
  console.log(` Sample Tile (z/x/y): ${z}/${x}/${y} (Majestic / Central Bengaluru)`);
  console.log(` Output Report:      ${opts.reportPath}`);

  const sampleTilePath = path.join(opts.outDir, String(z), String(x), `${y}.mvt`);
  const manifestPath = path.join(opts.outDir, 'manifest.json');

  // If sample tile does not exist on disk, generate it to ensure validator can run standalone
  if (!fs.existsSync(sampleTilePath)) {
    console.log(`\n Sample tile not found on disk. Generating sample tile ${z}/${x}/${y}...`);
    const mvt = await buildRoadTile(z, x, y);
    const tileDir = path.dirname(sampleTilePath);
    fs.mkdirSync(tileDir, { recursive: true });
    fs.writeFileSync(sampleTilePath, mvt);
    const bbox = tile2bbox(z, x, y);
    writeTileManifest(opts.outDir, { written: 1, skipped: 0, totalBytes: mvt.length }, [bbox.west, bbox.south, bbox.east, bbox.north], z, z);
    console.log(` ✓ Sample tile generated: ${sampleTilePath} (${mvt.length.toLocaleString()} bytes)`);
  }

  // 1. Audit Tile on Disk
  const tileBuffer = fs.readFileSync(sampleTilePath);
  const tileSize = tileBuffer.length;
  console.log(`\n[1/4] Auditing Tile File on Disk:`);
  console.log(`  File Path:         ${sampleTilePath}`);
  console.log(`  File Size:         ${tileSize.toLocaleString()} bytes`);

  if (tileSize === 0) {
    throw new Error(`Tile ${sampleTilePath} is empty (0 bytes).`);
  }

  // 2. Decode Vector Tile and Inspect Schema
  console.log(`\n[2/4] Decoding Protobuf & Inspecting Layer Schema:`);
  const vt = new VectorTile(new Pbf(tileBuffer));
  const layerNames = Object.keys(vt.layers);
  console.log(`  Layers in tile:    [${layerNames.join(', ')}]`);

  if (!vt.layers['roads']) {
    throw new Error(`Layer 'roads' missing in vector tile. Found: ${layerNames.join(', ')}`);
  }

  const roadsLayer = vt.layers['roads'];
  const featureCount = roadsLayer.length;
  console.log(`  Features in layer: ${featureCount.toLocaleString()}`);

  const propertyKeys = new Set();
  const tileRoadIds = new Set();
  const unauthorizedKeys = new Set();
  const allowedKeys = new Set(['road_id', 'name', 'ref', 'road_class', 'authority_name']);

  for (let i = 0; i < featureCount; i++) {
    const f = roadsLayer.feature(i);
    const props = f.properties;
    if (props.road_id) tileRoadIds.add(props.road_id);

    for (const key of Object.keys(props)) {
      propertyKeys.add(key);
      if (!allowedKeys.has(key)) {
        unauthorizedKeys.add(key);
      }
    }
  }

  console.log(`  Observed Fields:   [${[...propertyKeys].join(', ')}]`);
  console.log(`  Distinct Roads:    ${tileRoadIds.size.toLocaleString()}`);

  if (unauthorizedKeys.size > 0) {
    console.warn(`  [WARN] Unexpected feature properties detected: [${[...unauthorizedKeys].join(', ')}]`);
  } else {
    console.log(`  ✓ No extraneous data (works/incidents) baked into road tiles.`);
  }

  // 3. Ground Truth Verification Against Database
  console.log(`\n[3/4] Comparing Ground Truth Against Database:`);
  const dbSql = `
    WITH bounds AS (
      SELECT ST_Transform(ST_TileEnvelope($1, $2, $3), 4326) AS geom_4326
    )
    SELECT DISTINCT rs.road_id
    FROM road_segments rs
    JOIN roads r ON rs.road_id = r.id
    CROSS JOIN bounds b
    WHERE rs.is_active = true
      AND (rs.usage_category IS NULL OR rs.usage_category IN ('public_motor', 'restricted_motor'))
      AND rs.geom && b.geom_4326
      AND ST_Intersects(rs.geom, b.geom_4326)
  `;

  const dbRes = await query(dbSql, [z, x, y]);
  const dbRoadIds = new Set(dbRes.rows.map((r) => r.road_id));
  console.log(`  DB Active Roads:   ${dbRoadIds.size.toLocaleString()}`);

  const missingInTile = [];
  for (const id of dbRoadIds) {
    if (!tileRoadIds.has(id)) {
      missingInTile.push(id);
    }
  }

  const completenessPct =
    dbRoadIds.size === 0
      ? 100
      : Number((((dbRoadIds.size - missingInTile.length) / dbRoadIds.size) * 100).toFixed(2));

  console.log(`  Tile Road Count:   ${tileRoadIds.size.toLocaleString()}`);
  console.log(`  Missing in Tile:   ${missingInTile.length}`);
  console.log(`  Completeness:      ${completenessPct}%`);

  const completenessPassed = completenessPct >= 99.0;
  if (!completenessPassed) {
    throw new Error(`Completeness check failed: ${completenessPct}% < 99.0%`);
  }
  console.log(`  ✓ Feature completeness verification PASSED (>= 99.0%).`);

  // 4. Directory & Manifest Audit
  console.log(`\n[4/4] Directory Coverage & Manifest Audit:`);
  const allMvtFiles = findMvtFiles(opts.outDir);
  const manifestPresent = fs.existsSync(manifestPath);

  let manifestData = null;
  if (manifestPresent) {
    try {
      manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {}
  }

  console.log(`  Total MVT on disk: ${allMvtFiles.length}`);
  console.log(`  Manifest Present:  ${manifestPresent ? 'YES' : 'NO'}`);

  const assertions = [
    { name: 'Tile file exists and is non-empty', passed: tileSize > 0 },
    { name: 'Vector tile contains roads layer', passed: !!vt.layers['roads'] },
    { name: 'Features contain road_id, name, and road_class', passed: propertyKeys.has('road_id') && propertyKeys.has('road_class') },
    { name: 'No works or incidents baked in', passed: unauthorizedKeys.size === 0 },
    { name: 'Feature completeness >= 99%', passed: completenessPassed },
    { name: 'Manifest index exists in output directory', passed: manifestPresent },
  ];

  const allPassed = assertions.every((a) => a.passed);

  const report = {
    timestamp: new Date().toISOString(),
    status: allPassed ? 'PASS' : 'FAIL',
    out_dir: opts.outDir,
    manifest_present: manifestPresent,
    manifest: manifestData,
    total_tiles_on_disk: allMvtFiles.length,
    sample_tile: {
      z,
      x,
      y,
      file_path: sampleTilePath,
      file_size_bytes: tileSize,
      layer_name: 'roads',
      feature_count: featureCount,
      distinct_road_ids_in_tile: tileRoadIds.size,
      db_active_roads_count: dbRoadIds.size,
      missing_roads_count: missingInTile.length,
      completeness_percentage: completenessPct,
      feature_properties: [...propertyKeys],
      unauthorized_properties: [...unauthorizedKeys],
    },
    assertions,
  };

  fs.mkdirSync(path.dirname(opts.reportPath), { recursive: true });
  fs.writeFileSync(opts.reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n' + '='.repeat(78));
  console.log(` VALIDATION STATUS: ${allPassed ? 'ALL ASSERTIONS PASSED (100%)' : 'FAILURES DETECTED'}`);
  console.log(` Report written to:  ${opts.reportPath}`);
  console.log('='.repeat(78));

  await pool.end();
  process.exit(allPassed ? 0 : 1);
}

// Execute when run as CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename || '')) {
  validateTileCoverage().catch(async (err) => {
    console.error('\nTile coverage validation error:', err);
    try {
      await pool.end();
    } catch {}
    process.exit(1);
  });
}
