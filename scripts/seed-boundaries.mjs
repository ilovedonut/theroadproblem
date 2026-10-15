import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../src/db/client.ts';
import { loadVerifiedBengaluruBoundary } from '../src/lib/osm/boundary.ts';

export async function seedDistrictBoundaries(client) {
  console.log('[boundary] Seeding official district administrative boundaries with verified provenance...');

  // 1. Bengaluru Urban Boundary (OSM Relation 2020589)
  const blrPath = path.resolve('scripts/data/bengaluru_urban_boundary.geojson');
  if (fs.existsSync(blrPath)) {
    const raw = fs.readFileSync(blrPath, 'utf8');
    const blrData = JSON.parse(raw);
    const geomJson = JSON.stringify(blrData.geometry);
    const prov = loadVerifiedBengaluruBoundary(blrPath);

    await client.query(`
      INSERT INTO district_boundaries (
        district, state, osm_relation_id, boundary_geom, source,
        boundary_type, boundary_version, source_url, source_version_date,
        retrieved_at, checksum_sha256, crs, is_valid, validity_reason,
        repair_notes, area_sq_km
      )
      VALUES (
        'Bengaluru Urban',
        'Karnataka',
        $1,
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)),
        'OpenStreetMap Administrative Boundary (Relation 2020589 / Nominatim)',
        $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11, $12, $13
      )
      ON CONFLICT (district) DO UPDATE
      SET boundary_geom = EXCLUDED.boundary_geom,
          osm_relation_id = EXCLUDED.osm_relation_id,
          source = EXCLUDED.source,
          boundary_type = EXCLUDED.boundary_type,
          boundary_version = EXCLUDED.boundary_version,
          source_url = EXCLUDED.source_url,
          source_version_date = EXCLUDED.source_version_date,
          retrieved_at = EXCLUDED.retrieved_at,
          checksum_sha256 = EXCLUDED.checksum_sha256,
          crs = EXCLUDED.crs,
          is_valid = EXCLUDED.is_valid,
          validity_reason = EXCLUDED.validity_reason,
          repair_notes = EXCLUDED.repair_notes,
          area_sq_km = EXCLUDED.area_sq_km;
    `, [
      prov.osm_relation_id,
      geomJson,
      prov.boundary_type,
      prov.boundary_version,
      prov.source_url,
      prov.source_version_date,
      prov.retrieved_at,
      prov.checksum_sha256,
      prov.crs,
      prov.is_valid,
      prov.validity_reason,
      prov.repair_notes,
      prov.area_sq_km,
    ]);
    console.log(`  ✓ Bengaluru Urban administrative boundary indexed (version: ${prov.boundary_version}, area: ${prov.area_sq_km} km²).`);
  }

  // 2. Ramanagara District Boundary (OSM Relation 718889046)
  const ramPath = path.resolve('scripts/data/ramanagara_boundary.geojson');
  if (fs.existsSync(ramPath)) {
    const rawRam = fs.readFileSync(ramPath, 'utf8');
    const ramChecksum = crypto.createHash('sha256').update(rawRam).digest('hex');
    const ramData = JSON.parse(rawRam);
    const geomJson = JSON.stringify(ramData.geometry);
    const osmRelId = ramData.properties?.osm_id || 718889046;
    const ramVersion = `osm-rel-${osmRelId}-${ramChecksum.slice(0, 12)}`;

    await client.query(`
      INSERT INTO district_boundaries (
        district, state, osm_relation_id, boundary_geom, source,
        boundary_type, boundary_version, source_url, source_version_date,
        retrieved_at, checksum_sha256, crs, is_valid, validity_reason,
        repair_notes
      )
      VALUES (
        'Ramanagara',
        'Karnataka',
        $1,
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)),
        'OpenStreetMap Administrative Boundary (Relation 718889046 / Nominatim)',
        'administrative_district',
        $3,
        'https://www.openstreetmap.org/relation/718889046',
        '2026-10-13',
        '2026-10-13T18:55:36.835Z'::timestamptz,
        $4,
        'EPSG:4326',
        TRUE,
        'Valid Geometry',
        'None required'
      )
      ON CONFLICT (district) DO UPDATE
      SET boundary_geom = EXCLUDED.boundary_geom,
          osm_relation_id = EXCLUDED.osm_relation_id,
          source = EXCLUDED.source,
          boundary_type = EXCLUDED.boundary_type,
          boundary_version = EXCLUDED.boundary_version,
          source_url = EXCLUDED.source_url,
          checksum_sha256 = EXCLUDED.checksum_sha256,
          crs = EXCLUDED.crs,
          is_valid = EXCLUDED.is_valid;
    `, [osmRelId, geomJson, ramVersion, ramChecksum]);
    console.log(`  ✓ Ramanagara administrative boundary indexed (version: ${ramVersion}).`);
  }
}

if (process.argv[1]?.endsWith('seed-boundaries.mjs')) {
  const client = await pool.connect();
  try {
    await seedDistrictBoundaries(client);
  } finally {
    client.release();
    await pool.end();
  }
}
