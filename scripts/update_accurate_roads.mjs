import fs from 'node:fs';
import pg from 'pg';

const { Pool } = pg;

function resolveDatabaseUrl() {
  return process.env.DATABASE_URL || 'postgresql://postgres:Stud%23ent%40123@db.gznnzjejwqepzwlhktou.supabase.co:5432/postgres';
}

const connectionString = resolveDatabaseUrl();
const isRemoteSsl = connectionString.includes('supabase') || connectionString.includes('sslmode=require');
if (isRemoteSsl) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const pool = new Pool({
  connectionString,
  ssl: isRemoteSsl ? { rejectUnauthorized: false } : undefined
});

async function fetchOsrmRoute(fromLon, fromLat, toLon, toLat) {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { 'User-Agent': 'theroadproblem-quest-sync' } });
  const data = await res.json();
  if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
    return {
      coordinates: data.routes[0].geometry.coordinates,
      distance: data.routes[0].distance
    };
  }
  throw new Error(`OSRM failed for ${fromLon},${fromLat} -> ${toLon},${toLat}`);
}

async function main() {
  console.log('[accurate-roads] Fetching real OpenStreetMap road alignments from OSRM...');

  // 1. MG Road (Anil Kumble Circle to Trinity Circle)
  console.log('[accurate-roads] 1. Fetching MG Road...');
  const mgRoad = await fetchOsrmRoute(77.6050, 12.9751, 77.6190, 12.9735);
  console.log(`   -> MG Road: ${mgRoad.coordinates.length} waypoints, ${(mgRoad.distance/1000).toFixed(2)} km`);

  // 2. Outer Ring Road (Silk Board to Marathahalli)
  console.log('[accurate-roads] 2. Fetching Outer Ring Road...');
  const orr = await fetchOsrmRoute(77.6226, 12.9174, 77.7010, 12.9550);
  console.log(`   -> ORR: ${orr.coordinates.length} waypoints, ${(orr.distance/1000).toFixed(2)} km`);
  // Split ORR into two segments: Silk Board to Bellandur (first 55%) and Bellandur to Marathahalli (rest)
  const orrSplitIdx = Math.floor(orr.coordinates.length * 0.55);
  const orrSeg1Coords = orr.coordinates.slice(0, orrSplitIdx + 1);
  const orrSeg2Coords = orr.coordinates.slice(orrSplitIdx);

  // 3. Hosur Road (Silk Board to Electronic City Phase 1)
  console.log('[accurate-roads] 3. Fetching Hosur Road Elevated & Surface...');
  const hosur = await fetchOsrmRoute(77.6255, 12.9170, 77.6840, 12.8360);
  console.log(`   -> Hosur Road: ${hosur.coordinates.length} waypoints, ${(hosur.distance/1000).toFixed(2)} km`);

  // 4. Ramanagara Kanakapura Road (MDR-104)
  console.log('[accurate-roads] 4. Fetching Ramanagara Kanakapura Road...');
  const ramanagara = await fetchOsrmRoute(77.2780, 12.7210, 77.4180, 12.5480);
  console.log(`   -> Ramanagara Road: ${ramanagara.coordinates.length} waypoints, ${(ramanagara.distance/1000).toFixed(2)} km`);

  // 5. Bidadi to Byramangala PMGSY Road
  console.log('[accurate-roads] 5. Fetching Bidadi to Byramangala PMGSY Road...');
  const bidadi = await fetchOsrmRoute(77.3880, 12.7980, 77.4320, 12.8250);
  console.log(`   -> Bidadi PMGSY Road: ${bidadi.coordinates.length} waypoints, ${(bidadi.distance/1000).toFixed(2)} km`);

  // Build the high-resolution JSON dataset
  const updatedRoadsJson = [
    {
      road_name: 'Outer Ring Road',
      ref: 'ORR / NH-44',
      road_class: 'primary',
      authority_name: 'BBMP / BDA',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      segments: [
        {
          osm_id: 1000101,
          chainage_from: 0.0,
          chainage_to: 6.5,
          coordinates: orrSeg1Coords
        },
        {
          osm_id: 1000102,
          chainage_from: 6.5,
          chainage_to: parseFloat((orr.distance / 1000).toFixed(2)),
          coordinates: orrSeg2Coords
        }
      ]
    },
    {
      road_name: 'Hosur Road (Elevated Tollway)',
      ref: 'NH-44',
      road_class: 'motorway',
      authority_name: 'NHAI',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      segments: [
        {
          osm_id: 1000201,
          chainage_from: 0.0,
          chainage_to: parseFloat((hosur.distance / 1000).toFixed(2)),
          coordinates: hosur.coordinates
        }
      ]
    },
    {
      road_name: 'Hosur Road (Surface Service Carriageway)',
      ref: 'Service Lane NH-44',
      road_class: 'secondary',
      authority_name: 'BBMP',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      segments: [
        {
          osm_id: 1000202,
          chainage_from: 0.0,
          chainage_to: parseFloat((hosur.distance / 1000).toFixed(2)),
          coordinates: hosur.coordinates
        }
      ]
    },
    {
      road_name: 'Mahatma Gandhi Road',
      ref: 'MG Road',
      road_class: 'primary',
      authority_name: 'BBMP',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      segments: [
        {
          osm_id: 1000301,
          chainage_from: 0.0,
          chainage_to: parseFloat((mgRoad.distance / 1000).toFixed(2)),
          coordinates: mgRoad.coordinates
        }
      ]
    },
    {
      road_name: 'Ramanagara Kanakapura Rural Road',
      ref: 'MDR-104',
      road_class: 'secondary',
      authority_name: 'Karnataka PWD',
      state: 'Karnataka',
      district: 'Ramanagara',
      segments: [
        {
          osm_id: 2000101,
          chainage_from: 0.0,
          chainage_to: parseFloat((ramanagara.distance / 1000).toFixed(2)),
          coordinates: ramanagara.coordinates
        }
      ]
    },
    {
      road_name: 'Bidadi to Byramangala PMGSY Road',
      ref: 'KA-25-01',
      road_class: 'unclassified',
      authority_name: 'NRIDA / PMGSY',
      state: 'Karnataka',
      district: 'Ramanagara',
      segments: [
        {
          osm_id: 2000201,
          chainage_from: 0.0,
          chainage_to: parseFloat((bidadi.distance / 1000).toFixed(2)),
          coordinates: bidadi.coordinates
        }
      ]
    }
  ];

  fs.writeFileSync('scripts/data/sample_roads.json', JSON.stringify(updatedRoadsJson, null, 2));
  console.log('[accurate-roads] Saved updated high-res sample_roads.json!');

  // Update Supabase PostGIS Database directly
  console.log('[accurate-roads] Connecting to Supabase database to update PostGIS geometries...');
  const client = await pool.connect();
  try {
    for (const r of updatedRoadsJson) {
      const roadRes = await client.query('SELECT id FROM roads WHERE name = $1 LIMIT 1;', [r.road_name]);
      if (roadRes.rows.length === 0) continue;
      const roadId = roadRes.rows[0].id;

      // Wipe old coarse segments for this road
      await client.query('DELETE FROM road_segments WHERE road_id = $1;', [roadId]);

      // Insert accurate high-resolution segments
      for (const seg of r.segments) {
        const lineStringWkt = `LINESTRING(${seg.coordinates.map((c) => `${c[0]} ${c[1]}`).join(', ')})`;
        await client.query(`
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
          );
        `, [roadId, lineStringWkt, seg.chainage_from, seg.chainage_to, r.state, r.district, seg.osm_id]);
      }
      console.log(`   ✓ Updated accurate geometry for: ${r.road_name}`);
    }
    console.log('[accurate-roads] All road geometries successfully updated in Supabase PostGIS!');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('[accurate-roads] Error:', err);
  process.exit(1);
});
