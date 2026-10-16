import fs from 'node:fs';
import { pool } from '../src/db/client.ts';

const phase = process.argv[2] || 'before';
if (!['before', 'after'].includes(phase)) throw Error('Expected before or after');
const output = 'docs/indexed-ingestion-test';
fs.mkdirSync(output, { recursive: true });
const client = await pool.connect();
try {
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await client.query("SET LOCAL statement_timeout='30s'");
 const counts = (await client.query(`SELECT
  (SELECT count(*) FROM roads) AS roads,
  (SELECT count(*) FROM road_segments WHERE is_active) AS active_segments,
  (SELECT count(*) FROM reports) AS citizen_reports,
  (SELECT count(*) FROM works w JOIN source_records sr ON sr.id=w.source_record_id WHERE sr.parse_version='pppac-karnataka-v1') AS official_works,
  (SELECT count(*) FROM source_records WHERE parse_version='pppac-karnataka-v1') AS official_versions,
  (SELECT count(*) FROM work_segments ws JOIN works w ON w.id=ws.work_id JOIN source_records sr ON sr.id=w.source_record_id WHERE sr.parse_version='pppac-karnataka-v1') AS official_road_links,
  (SELECT count(*) FROM ambiguous_matches_queue q JOIN works w ON w.id=q.work_id JOIN source_records sr ON sr.id=w.source_record_id WHERE sr.parse_version='pppac-karnataka-v1' AND q.status='pending') AS official_pending_reviews,
  (SELECT count(*) FROM work_segments ws LEFT JOIN road_segments rs ON rs.id=ws.road_segment_id WHERE rs.id IS NULL) AS orphan_work_links`)).rows[0];
 const sources = (await client.query(`SELECT w.id AS work_id,sr.id AS source_record_id,sr.external_key,sr.source_uri,sr.raw_content,
  w.contract_value_inr,w.official_status
  FROM works w JOIN source_records sr ON sr.id=w.source_record_id
  WHERE sr.parse_version='pppac-karnataka-v1' ORDER BY sr.external_key`)).rows;
 const runs = (await client.query(`SELECT id,source_name,run_status,records_discovered,records_inserted,records_updated,records_skipped,failures_count,started_at,completed_at
  FROM ingestion_runs WHERE source_name LIKE '%PPPAC%' ORDER BY started_at DESC LIMIT 8`)).rows;
 const audit = {checked_at:new Date().toISOString(),phase,counts,sources,runs};
 fs.writeFileSync(`${output}/production-${phase}.json`,JSON.stringify(audit,null,2));
 if (phase === 'before') {
  const rows = (await client.query(`SELECT to_jsonb(r) AS road,to_jsonb(rs)-'geom' AS segment,ST_AsGeoJSON(rs.geom)::jsonb AS geometry,
   ST_X(ST_LineInterpolatePoint(rs.geom,0.5)) AS lon,ST_Y(ST_LineInterpolatePoint(rs.geom,0.5)) AS lat
   FROM road_segments rs JOIN roads r ON r.id=rs.road_id
   WHERE rs.is_active AND r.district='Bengaluru Urban'
    AND (rs.geom && ST_MakeEnvelope(77.592,12.969,77.598,12.975,4326)
      OR rs.geom && ST_MakeEnvelope(77.622,12.914,77.629,12.921,4326))
   ORDER BY r.name,rs.id LIMIT 180`)).rows;
  if (rows.length < 10) throw Error('Insufficient actual indexed-road geometry for the test');
  fs.writeFileSync(`${output}/indexed-road-sample.json`,JSON.stringify({retrieved_at:new Date().toISOString(),attribution:'© OpenStreetMap contributors; ODbL 1.0',rows},null,2));
  console.log('Copied public indexed geometry for isolated tests:',rows.length,'segments');
 }
 await client.query('COMMIT');
 console.log(JSON.stringify({phase,counts}));
 console.log('PRODUCTION_INGESTION_AUDIT_PASSED');
} catch(error) {await client.query('ROLLBACK');throw error;}
finally {client.release();await pool.end();}
