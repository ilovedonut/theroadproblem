import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../src/db/client.ts';

export async function seedDistrictBoundaries(client) {
  console.log('[boundary] Seeding official district administrative boundaries...');

  // 1. Bengaluru Urban Boundary (OSM Relation 2020589)
  const blrPath = path.resolve('scripts/data/bengaluru_urban_boundary.geojson');
  if (fs.existsSync(blrPath)) {
    const blrData = JSON.parse(fs.readFileSync(blrPath, 'utf8'));
    const geomJson = JSON.stringify(blrData.geometry);
    const osmRelId = blrData.properties?.osm_id || 2020589;

    await client.query(`
      INSERT INTO district_boundaries (district, state, osm_relation_id, boundary_geom, source)
      VALUES (
        'Bengaluru Urban',
        'Karnataka',
        $1,
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)),
        'OpenStreetMap Administrative Boundary (Relation 2020589 / Nominatim)'
      )
      ON CONFLICT (district) DO UPDATE
      SET boundary_geom = EXCLUDED.boundary_geom,
          osm_relation_id = EXCLUDED.osm_relation_id,
          source = EXCLUDED.source;
    `, [osmRelId, geomJson]);
    console.log('  ✓ Bengaluru Urban administrative boundary indexed.');
  }

  // 2. Ramanagara District Boundary (OSM Relation 718889046)
  const ramPath = path.resolve('scripts/data/ramanagara_boundary.geojson');
  if (fs.existsSync(ramPath)) {
    const ramData = JSON.parse(fs.readFileSync(ramPath, 'utf8'));
    const geomJson = JSON.stringify(ramData.geometry);
    const osmRelId = ramData.properties?.osm_id || 718889046;

    await client.query(`
      INSERT INTO district_boundaries (district, state, osm_relation_id, boundary_geom, source)
      VALUES (
        'Ramanagara',
        'Karnataka',
        $1,
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)),
        'OpenStreetMap Administrative Boundary (Relation 718889046 / Nominatim)'
      )
      ON CONFLICT (district) DO UPDATE
      SET boundary_geom = EXCLUDED.boundary_geom,
          osm_relation_id = EXCLUDED.osm_relation_id,
          source = EXCLUDED.source;
    `, [osmRelId, geomJson]);
    console.log('  ✓ Ramanagara administrative boundary indexed.');
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
