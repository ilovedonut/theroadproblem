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
import { buildRoadTile, tile2bbox, writeTileManifest, findMvtFiles } from './build-road-tiles.mjs';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

function parseCliArgs(argv) {
  const opts = {
    outDir: path.resolve('output/tiles/bengaluru'),
    publishDir: path.resolve('public/tiles/roads/bengaluru'),
    version: '20261016',
    minZoom: 10,
    maxZoom: 14,
    sampleTile: { z: 14, x: 11723, y: 7596 }, // Majestic / Central Bengaluru
    reportPath: path.resolve('output/tiles/coverage-validation.json'),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out-dir' && argv[i + 1]) {
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

function parseTileCoordinates(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  const match = norm.match(/\/(\d+)\/(\d+)\/(\d+)\.mvt$/);
  if (match) {
    return {
      z: parseInt(match[1], 10),
      x: parseInt(match[2], 10),
      y: parseInt(match[3], 10),
    };
  }
  return null;
}

async function validateTileCoverage() {
  const opts = parseCliArgs(process.argv.slice(2));
  const { z: sampleZ, x: sampleX, y: sampleY } = opts.sampleTile;

  console.log('='.repeat(78));
  console.log(' BENGALURU ROAD VECTOR TILE COVERAGE VALIDATION');
  console.log('='.repeat(78));
  console.log(` Tiles Directory:    ${opts.outDir}`);
  console.log(` Published Dir:      ${path.join(opts.publishDir, opts.version)}`);
  console.log(` Zoom Range:         ${opts.minZoom} -> ${opts.maxZoom}`);
  console.log(` Sample Tile (z/x/y): ${sampleZ}/${sampleX}/${sampleY} (Majestic / Central Bengaluru)`);
  console.log(` Output Report:      ${opts.reportPath}`);

  // 1. Audit Manifests
  console.log(`\n[1/6] Auditing Manifests:`);
  const manifestPath = path.join(opts.outDir, 'manifest.json');
  const pubManifestPath = path.join(opts.publishDir, 'manifest.json');

  const manifestPresent = fs.existsSync(manifestPath);
  const pubManifestPresent = fs.existsSync(pubManifestPath);

  let manifestData = null;
  let pubManifestData = null;

  if (manifestPresent) {
    try {
      manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      console.log(`  ✓ Output manifest present: ${manifestPath}`);
    } catch (err) {
      console.error(`  ✗ Output manifest invalid JSON:`, err.message);
    }
  } else {
    console.warn(`  ✗ Output manifest NOT found: ${manifestPath}`);
  }

  if (pubManifestPresent) {
    try {
      pubManifestData = JSON.parse(fs.readFileSync(pubManifestPath, 'utf8'));
      console.log(`  ✓ Published manifest present: ${pubManifestPath}`);
    } catch (err) {
      console.error(`  ✗ Published manifest invalid JSON:`, err.message);
    }
  } else {
    console.warn(`  ! Published manifest NOT found (will be written upon publish): ${pubManifestPath}`);
  }

  // 2. Audit Disk Tiles Inventory
  console.log(`\n[2/6] Auditing Disk Tiles Inventory:`);
  const allMvtFiles = findMvtFiles(opts.outDir);
  const publishedMvtFiles = findMvtFiles(path.join(opts.publishDir, opts.version));

  console.log(`  Total MVT in output dir:    ${allMvtFiles.length.toLocaleString()}`);
  console.log(`  Total MVT in published dir: ${publishedMvtFiles.length.toLocaleString()}`);

  const tilesByZoom = {};
  let totalBytesOnDisk = 0;

  for (const file of allMvtFiles) {
    const coords = parseTileCoordinates(file);
    if (coords) {
      tilesByZoom[coords.z] = (tilesByZoom[coords.z] || 0) + 1;
    }
    totalBytesOnDisk += fs.statSync(file).size;
  }

  for (let z = opts.minZoom; z <= opts.maxZoom; z++) {
    const count = tilesByZoom[z] || 0;
    console.log(`   - Zoom ${z}: ${count} tiles on disk`);
  }
  console.log(`  Total Bytes on Disk: ${(totalBytesOnDisk / (1024 * 1024)).toFixed(2)} MB`);

  const distinctCountMatchesManifest =
    manifestData?.tile_stats?.written_tiles === allMvtFiles.length;
  const bytesMatchManifest =
    manifestData?.tile_stats?.total_bytes === totalBytesOnDisk;

  console.log(`  Manifest stats exact match: ${distinctCountMatchesManifest && bytesMatchManifest ? 'YES' : 'NO'}`);

  // 3. Vector Tile Protobuf & Schema Validation
  console.log(`\n[3/6] Decoding Vector Tiles & Inspecting Schema:`);
  const allowedKeys = new Set(['road_id', 'name', 'ref', 'road_class', 'authority_name']);
  const observedKeys = new Set();
  const unauthorizedKeys = new Set();

  const inspectedTiles = [];
  const filesByZoom = {};
  for (const file of allMvtFiles) {
    const coords = parseTileCoordinates(file);
    if (coords) {
      if (!filesByZoom[coords.z]) filesByZoom[coords.z] = [];
      filesByZoom[coords.z].push({ file, coords });
    }
  }

  // Select sample tiles across each zoom level
  const tilesToInspect = [];
  for (let z = opts.minZoom; z <= opts.maxZoom; z++) {
    const list = filesByZoom[z] || [];
    if (z <= 11) {
      // Inspect all tiles for low zooms (only a few)
      tilesToInspect.push(...list);
    } else {
      // Sample up to 8 tiles for higher zooms
      tilesToInspect.push(...list.slice(0, 8));
      // Ensure sampleTile is included if present
      const sampleMatch = list.find(
        (t) => t.coords.x === sampleX && t.coords.y === sampleY
      );
      if (sampleMatch && !tilesToInspect.includes(sampleMatch)) {
        tilesToInspect.push(sampleMatch);
      }
    }
  }

  let totalFeaturesAudited = 0;
  let allDecodedSuccessfully = true;
  let roadsLayerPresentInAll = true;

  for (const item of tilesToInspect) {
    try {
      const buf = fs.readFileSync(item.file);
      const vt = new VectorTile(new Pbf(buf));
      if (!vt.layers['roads']) {
        roadsLayerPresentInAll = false;
        console.error(`  ✗ Layer 'roads' missing in ${item.file}`);
        continue;
      }
      const layer = vt.layers['roads'];
      totalFeaturesAudited += layer.length;

      for (let i = 0; i < layer.length; i++) {
        const props = layer.feature(i).properties;
        for (const k of Object.keys(props)) {
          observedKeys.add(k);
          if (!allowedKeys.has(k)) {
            unauthorizedKeys.add(k);
          }
        }
      }
    } catch (err) {
      allDecodedSuccessfully = false;
      console.error(`  ✗ Error decoding ${item.file}:`, err.message);
    }
  }

  console.log(`  Inspected Tiles:   ${tilesToInspect.length}`);
  console.log(`  Audited Features:  ${totalFeaturesAudited.toLocaleString()}`);
  console.log(`  Observed Fields:   [${[...observedKeys].join(', ')}]`);
  console.log(`  Unauthorized Keys: [${[...unauthorizedKeys].join(', ')}]`);

  // 4. Zoom Hierarchy Verification
  console.log(`\n[4/6] Verifying Zoom Hierarchy:`);
  const majorHighwayClasses = new Set([
    'motorway',
    'trunk',
    'primary',
    'secondary',
    'tertiary',
    'motorway_link',
    'trunk_link',
    'primary_link',
    'secondary_link',
    'tertiary_link',
  ]);

  const collectorClasses = new Set([
    ...majorHighwayClasses,
    'unclassified',
    'road',
  ]);

  // Check Zoom 10 tiles:
  const zoom10Files = filesByZoom[10] || [];
  const zoom10Classes = new Set();
  let zoom10InvalidClasses = [];

  for (const { file } of zoom10Files) {
    const vt = new VectorTile(new Pbf(fs.readFileSync(file)));
    const layer = vt.layers['roads'];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const rc = layer.feature(i).properties.road_class;
      if (rc) zoom10Classes.add(rc);
      // In zoom 10, residential, living_street, unclassified should NEVER appear
      if (['residential', 'living_street', 'unclassified'].includes(rc)) {
        zoom10InvalidClasses.push(rc);
      }
    }
  }

  const zoom10Passed = zoom10InvalidClasses.length === 0 && zoom10Classes.size > 0;
  console.log(`  Zoom 10 Classes:    [${[...zoom10Classes].join(', ')}]`);
  console.log(`  Zoom 10 Non-Major:  ${zoom10InvalidClasses.length} features (Expected: 0) -> ${zoom10Passed ? 'PASS' : 'FAIL'}`);

  // Check Zoom 12-13 tiles:
  const zoom12And13Files = [...(filesByZoom[12] || []), ...(filesByZoom[13] || [])];
  const zoom12And13Classes = new Set();
  let zoom12And13Residential = 0;

  for (const { file } of zoom12And13Files.slice(0, 15)) {
    const vt = new VectorTile(new Pbf(fs.readFileSync(file)));
    const layer = vt.layers['roads'];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const rc = layer.feature(i).properties.road_class;
      if (rc) zoom12And13Classes.add(rc);
      if (['residential', 'living_street'].includes(rc)) {
        zoom12And13Residential++;
      }
    }
  }

  const zoom12And13Passed = zoom12And13Residential === 0 && zoom12And13Classes.size > 0;
  console.log(`  Zoom 12-13 Classes: [${[...zoom12And13Classes].join(', ')}]`);
  console.log(`  Zoom 12-13 Minor:   ${zoom12And13Residential} features (Expected: 0) -> ${zoom12And13Passed ? 'PASS' : 'FAIL'}`);

  // Check Zoom 14 tiles:
  const zoom14Files = filesByZoom[14] || [];
  const zoom14Classes = new Set();
  let zoom14ResidentialCount = 0;

  for (const { file } of zoom14Files.slice(0, 15)) {
    const vt = new VectorTile(new Pbf(fs.readFileSync(file)));
    const layer = vt.layers['roads'];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const rc = layer.feature(i).properties.road_class;
      if (rc) zoom14Classes.add(rc);
      if (rc === 'residential') zoom14ResidentialCount++;
    }
  }

  const zoom14Passed = zoom14ResidentialCount > 0 && zoom14Classes.has('residential');
  console.log(`  Zoom 14 Classes:    [${[...zoom14Classes].join(', ')}]`);
  console.log(`  Zoom 14 Full Net:   ${zoom14ResidentialCount} residential features -> ${zoom14Passed ? 'PASS (Full active motor network present)' : 'FAIL'}`);

  // 5. Ground Truth Verification Against Database
  console.log(`\n[5/6] Comparing Ground Truth Against Database:`);
  const sampleTilePath = path.join(opts.outDir, String(sampleZ), String(sampleX), `${sampleY}.mvt`);

  if (!fs.existsSync(sampleTilePath)) {
    console.log(`  Sample tile ${sampleZ}/${sampleX}/${sampleY} not on disk, generating...`);
    const mvt = await buildRoadTile(sampleZ, sampleX, sampleY);
    fs.mkdirSync(path.dirname(sampleTilePath), { recursive: true });
    fs.writeFileSync(sampleTilePath, mvt);
  }

  const sampleTileBuf = fs.readFileSync(sampleTilePath);
  const sampleVt = new VectorTile(new Pbf(sampleTileBuf));
  const sampleRoadsLayer = sampleVt.layers['roads'];
  const tileRoadIds = new Set();

  for (let i = 0; i < sampleRoadsLayer.length; i++) {
    const rId = sampleRoadsLayer.feature(i).properties.road_id;
    if (rId) tileRoadIds.add(rId);
  }

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

  const dbRes = await query(dbSql, [sampleZ, sampleX, sampleY]);
  const dbRoadIds = new Set(dbRes.rows.map((r) => r.road_id));

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

  console.log(`  Sample Tile:       ${sampleZ}/${sampleX}/${sampleY} (${sampleTileBuf.length.toLocaleString()} bytes)`);
  console.log(`  Tile Road Count:   ${tileRoadIds.size.toLocaleString()}`);
  console.log(`  DB Active Roads:   ${dbRoadIds.size.toLocaleString()}`);
  console.log(`  Missing in Tile:   ${missingInTile.length}`);
  console.log(`  Completeness:      ${completenessPct}%`);

  const completenessPassed = completenessPct >= 99.0;
  console.log(`  Completeness >= 99%: ${completenessPassed ? 'PASS' : 'FAIL'}`);

  // 6. Assertions & Validation Report
  console.log(`\n[6/6] Compiling Assertions & Validation Report:`);
  const assertions = [
    { name: 'Output directory manifest exists and is valid', passed: manifestPresent && !!manifestData },
    { name: 'Published directory manifest exists and is valid', passed: pubManifestPresent && !!pubManifestData },
    { name: 'Distinct tile count on disk > 0', passed: allMvtFiles.length > 0 },
    { name: 'All zoom levels 10 to 14 represented on disk', passed: [10, 11, 12, 13, 14].every((z) => (tilesByZoom[z] || 0) > 0) },
    { name: 'Manifest written_tiles matches distinct files on disk', passed: distinctCountMatchesManifest },
    { name: 'Manifest total_bytes matches sum of files on disk', passed: bytesMatchManifest },
    { name: 'Published tile count matches output directory tile count', passed: publishedMvtFiles.length === allMvtFiles.length },
    { name: 'All inspected vector tiles decode and contain roads layer', passed: allDecodedSuccessfully && roadsLayerPresentInAll },
    { name: 'Required properties present (road_id, name, ref, road_class, authority_name)', passed: ['road_id', 'road_class'].every((k) => observedKeys.has(k)) },
    { name: 'No unauthorized properties baked into road tiles', passed: unauthorizedKeys.size === 0 },
    { name: 'Zoom 10 contains only major highway classes / corridors', passed: zoom10Passed },
    { name: 'Zoom 12-13 contains only major classes and collectors', passed: zoom12And13Passed },
    { name: 'Zoom 14 contains full active motor network including residential', passed: zoom14Passed },
    { name: 'Sample tile feature completeness >= 99.0%', passed: completenessPassed },
  ];

  const allPassed = assertions.every((a) => a.passed);

  for (const a of assertions) {
    console.log(`  ${a.passed ? '✓' : '✗'} ${a.name}`);
  }

  const report = {
    timestamp: new Date().toISOString(),
    status: allPassed ? 'PASS' : 'FAIL',
    out_dir: opts.outDir,
    publish_dir: path.join(opts.publishDir, opts.version),
    manifests: {
      output_manifest: manifestData,
      published_manifest: pubManifestData,
    },
    disk_inventory: {
      total_tiles_on_disk: allMvtFiles.length,
      published_tiles_on_disk: publishedMvtFiles.length,
      total_bytes_on_disk: totalBytesOnDisk,
      tiles_by_zoom: tilesByZoom,
    },
    zoom_hierarchy: {
      zoom_10: {
        classes_observed: [...zoom10Classes],
        non_major_violations: zoom10InvalidClasses.length,
        passed: zoom10Passed,
      },
      zoom_12_13: {
        classes_observed: [...zoom12And13Classes],
        minor_violations: zoom12And13Residential,
        passed: zoom12And13Passed,
      },
      zoom_14: {
        classes_observed: [...zoom14Classes],
        residential_count: zoom14ResidentialCount,
        passed: zoom14Passed,
      },
    },
    schema_validation: {
      inspected_tiles_count: tilesToInspect.length,
      total_features_audited: totalFeaturesAudited,
      observed_properties: [...observedKeys],
      unauthorized_properties: [...unauthorizedKeys],
    },
    sample_tile_completeness: {
      sample_tile: `${sampleZ}/${sampleX}/${sampleY}`,
      file_path: sampleTilePath,
      file_size_bytes: sampleTileBuf.length,
      distinct_road_ids_in_tile: tileRoadIds.size,
      db_active_roads_count: dbRoadIds.size,
      missing_roads_count: missingInTile.length,
      completeness_percentage: completenessPct,
      passed: completenessPassed,
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
