import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadVerifiedBengaluruBoundary } from '../src/lib/osm/boundary.ts';

/**
 * Offline / Server-Side Geofabrik .osm.pbf Extract Processor for Bengaluru Urban.
 *
 * Uses `osmium extract --polygon` against the verified Bengaluru Urban Administrative District
 * polygon (OSM Relation 2020589) and converts eligible highway ways into a dated, checksummed
 * JSON extract ready for `scripts/import-osm-roads.mjs`.
 *
 * Reference:
 * - https://download.geofabrik.de/asia/india.html
 * - https://docs.osmcode.org/osmium/latest/osmium-extract.html
 */

function parseCliArgs(argv) {
  const args = {
    regionalPbf: undefined,
    extractedPbf: path.resolve('scripts/data/bengaluru_urban.osm.pbf'),
    boundaryPath: path.resolve('scripts/data/bengaluru_urban_boundary.geojson'),
    outputPath: path.resolve('scripts/data/bengaluru_urban_roads.osm.json'),
    manifestPath: path.resolve('scripts/data/bengaluru_osm_manifest.json'),
    sourceUrl: 'https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf',
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--regional-pbf' && argv[i + 1]) args.regionalPbf = path.resolve(argv[++i]);
    else if (a === '--pbf' && argv[i + 1]) args.extractedPbf = path.resolve(argv[++i]);
    else if (a === '--boundary' && argv[i + 1]) args.boundaryPath = path.resolve(argv[++i]);
    else if (a === '--output' && argv[i + 1]) args.outputPath = path.resolve(argv[++i]);
    else if (a === '--manifest' && argv[i + 1]) args.manifestPath = path.resolve(argv[++i]);
    else if (a === '--source-url' && argv[i + 1]) args.sourceUrl = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const boundary = loadVerifiedBengaluruBoundary(args.boundaryPath);

  console.log('='.repeat(78));
  console.log(' THE ROAD PROBLEM: OFFLINE GEOFABRIK .OSM.PBF EXTRACT PROCESSOR');
  console.log('='.repeat(78));
  console.log(`  Boundary:          ${boundary.boundary_name} (${boundary.boundary_type})`);
  console.log(`  Boundary Version:  ${boundary.boundary_version}`);
  console.log(`  Boundary SHA-256:  ${boundary.checksum_sha256}`);

  if (args.regionalPbf) {
    if (!fs.existsSync(args.regionalPbf)) {
      throw new Error(`Regional .osm.pbf file not found: ${args.regionalPbf}`);
    }
    console.log(`  Clipping regional PBF via osmium extract...`);
    execFileSync(
      'osmium',
      [
        'extract',
        '--polygon',
        args.boundaryPath,
        '--strategy',
        'complete_ways',
        args.regionalPbf,
        '-o',
        args.extractedPbf,
        '--overwrite',
      ],
      { stdio: 'inherit' }
    );
  }

  if (!fs.existsSync(args.extractedPbf)) {
    throw new Error(
      `Extracted .osm.pbf not found at ${args.extractedPbf}. Pass --regional-pbf <southern-zone-latest.osm.pbf> or --pbf <bengaluru_urban.osm.pbf>.`
    );
  }

  const pbfBytes = fs.readFileSync(args.extractedPbf);
  const pbfSha256 = crypto.createHash('sha256').update(pbfBytes).digest('hex');

  // Filter highway ways and export to GeoJSONSeq with OSM IDs, versions, and tags
  const tmpFilteredPbf = `${args.extractedPbf}.highways.osm.pbf`;
  const tmpGeojsonSeq = `${args.extractedPbf}.highways.geojsonseq`;

  execFileSync(
    'osmium',
    ['tags-filter', args.extractedPbf, 'w/highway', '-o', tmpFilteredPbf, '--overwrite'],
    { stdio: 'inherit' }
  );

  execFileSync(
    'osmium',
    [
      'export',
      tmpFilteredPbf,
      '-f',
      'geojsonseq',
      '-a',
      'id,type,version,timestamp',
      '-o',
      tmpGeojsonSeq,
      '--overwrite',
    ],
    { stdio: 'inherit' }
  );

  const lines = fs
    .readFileSync(tmpGeojsonSeq, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  const elements = [];
  for (const line of lines) {
    const cleaned = line.replace(/^\x1e/, '');
    const feat = JSON.parse(cleaned);
    if (feat.geometry?.type !== 'LineString' || !Array.isArray(feat.geometry.coordinates)) {
      continue;
    }
    const props = feat.properties || {};
    const rawId = Number(String(feat.id || props['@id'] || '').replace(/^w/, ''));
    if (!Number.isFinite(rawId) || rawId <= 0) continue;

    const tags = {};
    for (const [k, v] of Object.entries(props)) {
      if (!k.startsWith('@') && v !== null && v !== undefined) {
        tags[k] = String(v);
      }
    }

    elements.push({
      type: 'way',
      id: rawId,
      version: Number(props['@version'] || 1),
      timestamp: props['@timestamp'] || undefined,
      tags,
      geometry: feat.geometry.coordinates.map(([lon, lat]) => ({
        lon: Number(lon),
        lat: Number(lat),
      })),
    });
  }

  fs.rmSync(tmpFilteredPbf, { force: true });
  fs.rmSync(tmpGeojsonSeq, { force: true });

  const payload = {
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    source: 'Geofabrik OpenStreetMap Regional Extract (Southern Zone)',
    source_uri: args.sourceUrl,
    pbf_checksum_sha256: pbfSha256,
    boundary_version: boundary.boundary_version,
    boundary_checksum_sha256: boundary.checksum_sha256,
    license: 'Open Database License (ODbL) 1.0 (https://www.openstreetmap.org/copyright)',
    retrieved_at: new Date().toISOString(),
    is_complete_extract: true,
    elements,
  };

  const outText = JSON.stringify(payload, null, 2);
  fs.writeFileSync(args.outputPath, outText, 'utf8');
  const outSha256 = crypto.createHash('sha256').update(outText).digest('hex');

  console.log(`  ✓ Extracted ${elements.length} OSM highway ways into ${args.outputPath}`);
  console.log(`  ✓ Output SHA-256: ${outSha256}`);
}

main().catch((err) => {
  console.error('FATAL: Extract processing failed:', err.message);
  process.exit(1);
});
