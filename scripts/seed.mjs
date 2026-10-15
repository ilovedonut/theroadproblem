import './test-bootstrap.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import pg from 'pg';

const { Pool } = pg;

// Ensure .env.local is loaded if process.env.DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
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
    }
  } catch {}
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('127.0.0.1') && !process.env.DATABASE_URL.includes('localhost')) {
    return process.env.DATABASE_URL;
  }
  try {
    const wslIp = execSync('wsl -d Ubuntu -- hostname -I', { encoding: 'utf8' }).trim().split(/\s+/)[0];
    if (wslIp) {
      return `postgres://postgres:postgres@${wslIp}:5432/theroadproblem`;
    }
  } catch {}
  return process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/theroadproblem';
}

const connectionStringRaw = resolveDatabaseUrl();
const isRemoteSsl = connectionStringRaw.includes('supabase') || connectionStringRaw.includes('sslmode=require');

let sslConfig = undefined;
let connectionString = connectionStringRaw;

if (isRemoteSsl) {
  connectionString = connectionStringRaw.replace(/[\?&]sslmode=[^&]+/, '');
  const certPath = path.resolve('certs/supabase-ca.pem');
  let caCert = undefined;
  if (fs.existsSync(certPath)) {
    caCert = fs.readFileSync(certPath, 'utf8');
  }
  sslConfig = {
    ca: caCert,
    rejectUnauthorized: true,
    checkServerIdentity: () => undefined,
  };
}

const pool = new Pool({
  connectionString,
  ssl: sslConfig
});

export async function importRoadsAndLocalities(client) {
  console.log('[seed] Seeding data sources...');
  const dsRes = await client.query(`
    INSERT INTO data_sources (name, publisher, base_uri, license, retrieval_method, update_frequency, terms_reviewed_at)
    VALUES 
      ('OpenStreetMap India Roads', 'OpenStreetMap Contributors', 'https://download.geofabrik.de/asia/india.html', 'ODbL 1.0', 'extract', 'weekly', NOW()),
      ('Open Government Data Transport', 'Ministry of Road Transport and Highways (MoRTH)', 'https://data.gov.in', 'GODL India', 'api', 'monthly', NOW()),
      ('Central Public Procurement Portal', 'National Informatics Centre (NIC)', 'https://eprocure.gov.in', 'GODL India', 'web', 'weekly', NOW())
    ON CONFLICT DO NOTHING
    RETURNING id;
  `);

  const osmSourceRes = await client.query(`SELECT id FROM data_sources WHERE name = 'OpenStreetMap India Roads' LIMIT 1;`);
  const osmSourceId = osmSourceRes.rows[0]?.id;

  console.log('[seed] Seeding localities...');
  const localities = JSON.parse(fs.readFileSync('scripts/data/sample_localities.json', 'utf8'));
  for (const loc of localities) {
    await client.query(`
      INSERT INTO localities (name, name_hi, state, district, type, center)
      VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326))
      ON CONFLICT DO NOTHING;
    `, [loc.name, loc.name_hi, loc.state, loc.district, loc.type, loc.lon, loc.lat]);
  }

  console.log('[seed] Seeding road network with geometry & lineage...');
  const roads = JSON.parse(fs.readFileSync('scripts/data/sample_roads.json', 'utf8'));
  let insertedSegments = 0;

  for (const r of roads) {
    // 1. Upsert Road entity
    let roadId;
    const existingRoad = await client.query(`SELECT id FROM roads WHERE name = $1 AND state = $2 LIMIT 1;`, [r.road_name, r.state]);
    if (existingRoad.rows.length > 0) {
      roadId = existingRoad.rows[0].id;
    } else {
      const roadInsert = await client.query(`
        INSERT INTO roads (name, ref, road_class, authority_name, state, district, source_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `, [r.road_name, r.ref, r.road_class, r.authority_name, r.state, r.district, osmSourceId]);
      roadId = roadInsert.rows[0].id;
    }

    // 2. Process segments
    for (const seg of r.segments) {
      const lineStringWkt = `LINESTRING(${seg.coordinates.map((c) => `${c[0]} ${c[1]}`).join(', ')})`;
      
      // Check if segment already exists for these OSM IDs
      const existingSeg = await client.query(`
        SELECT id, length_m, version FROM road_segments 
        WHERE road_id = $1 AND $2 = ANY(osm_ids)
        LIMIT 1;
      `, [roadId, seg.osm_id]);

      if (existingSeg.rows.length > 0) {
        // Unchanged reimport: preserve UUID!
        continue;
      }

      // Insert new segment
      const segInsert = await client.query(`
        INSERT INTO road_segments (
          road_id, geom, chainage_from, chainage_to, state, district, osm_ids, length_m, version, is_active
        ) VALUES (
          $1,
          ST_SetSRID(ST_GeomFromText($2), 4326),
          $3, $4, $5, $6,
          ARRAY[$7::bigint],
          ST_Length(ST_SetSRID(ST_GeomFromText($2), 4326)::geography),
          1,
          TRUE
        )
        RETURNING id, length_m;
      `, [roadId, lineStringWkt, seg.chainage_from, seg.chainage_to, r.state, r.district, seg.osm_id]);

      const newSegId = segInsert.rows[0].id;
      insertedSegments++;

      // Record lineage
      await client.query(`
        INSERT INTO road_segment_lineage (segment_id, parent_segment_id, transition_type, reason, source_version)
        VALUES ($1, NULL, 'initial', 'Initial import from licensed OSM extract', 'osm-2026-10');
      `, [newSegId]);
    }
  }

  console.log(`[seed] Seed completed: ${insertedSegments} new road segments indexed.`);
}

async function main() {
  const client = await pool.connect();
  try {
    await importRoadsAndLocalities(client);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('seed.mjs')) {
  main().catch((err) => {
    console.error('[seed] Error running seed:', err);
    process.exit(1);
  });
}
