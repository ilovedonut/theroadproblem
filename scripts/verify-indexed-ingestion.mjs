import './test-bootstrap.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pool } from '../src/db/client.ts';
import { matchRoadPrecisely, linkWorkSegmentsWithPrecision } from '../src/lib/matcher.ts';

const directory='docs/road-gap-repair';
fs.mkdirSync(directory,{recursive:true});
const sample=JSON.parse(fs.readFileSync('docs/indexed-ingestion-test/indexed-road-sample.json'));
const rows=sample.rows;
const results=[];
const client=await pool.connect();
let rolledBack=false;
try {
 await client.query('BEGIN');
 await client.query("SET LOCAL statement_timeout='30s'");
 // This guard has already selected the named local test database. All copied
 // geometry, mock projects, and associations below roll back together.
 const columns=async table=>(await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,[table])).rows.map(r=>r.column_name);
 const roadColumns=await columns('roads'),segmentColumns=await columns('road_segments');
 async function insert(table,object,allowed,geometry) {
  const names=allowed.filter(k=>Object.hasOwn(object,k));
  const params=names.map(k=>object[k]);
  const values=names.map((_,i)=>`$${i+1}`);
  if(geometry){names.push('geom');params.push(JSON.stringify(geometry));values.push(`ST_SetSRID(ST_GeomFromGeoJSON($${params.length}),4326)`);}
  const updates=names.filter(n=>n!=='id').map(n=>`"${n}"=EXCLUDED."${n}"`).join(',');
  await client.query(`INSERT INTO ${table} (${names.map(n=>`"${n}"`).join(',')}) VALUES (${values.join(',')}) ON CONFLICT(id) DO UPDATE SET ${updates}`,params);
 }
 const roadFields=['id','name','ref','road_class','authority_name','state','district','is_official_corridor','has_official_name','aliases','usage_category','access_status'].filter(k=>roadColumns.includes(k));
 const segmentFields=['id','road_id','state','district','length_m','chainage_from','chainage_to','is_active','osm_way_id','osm_version','osm_tags','highway','layer','bridge','tunnel','service','display_label','usage_category','access_status','crosses_boundary','node_ids'].filter(k=>segmentColumns.includes(k));
 await client.query('UPDATE road_segments SET is_active=FALSE');
 const roads=new Map(rows.map(row=>[row.road.id,row.road]));
 for(const road of roads.values())await insert('roads',road,roadFields);
 for(const row of rows)await insert('road_segments',row.segment,segmentFields,row.geometry);
 const point=rows.find(r=>r.road.name==='Vittal Mallya Road')||rows.find(r=>!r.road.name.startsWith('Unnamed'));
 assert.ok(point,'A named real road is required as the positive control');
 const target={tender_id:'ISOLATED-INDEX-TEST',package_name:'Isolated matcher check',district:point.road.district,road_name_hint:point.road.name,coordinates:{lon:point.lon,lat:point.lat}};
 async function scenario(name,input,verify) {
  const match=await matchRoadPrecisely(client,input);
  const record={name,input,result:match};
  try{verify(match);record.passed=true;}catch(error){record.passed=false;record.failure=error.message;}
  results.push(record);
  console.log(`${record.passed?'PASS':'FAIL'}: ${name}`);
  return match;
 }
 const positive=await scenario('Actual named road geometry is discoverable',target,r=>{
  assert.ok(r.candidate_segment_ids.includes(point.segment.id));
  assert.equal(r.road_id,point.road.id);
  assert.equal(r.review_status,'needs_review');
  assert.equal(r.matched_segment_ids.length,0);
 });
 await scenario('Conflicting source district requires review',{...target,district:'New Delhi'},r=>assert.equal(r.review_status,'needs_review'));
 await scenario('Conflicting road name and identifier require review',{...target,road_name_hint:'NONEXISTENT ROAD CONTROL',road_ref:'NONEXISTENT-REF'},r=>assert.equal(r.review_status,'needs_review'));
 await scenario('Coordinates without identifying evidence require review',{tender_id:target.tender_id,package_name:target.package_name,coordinates:target.coordinates},r=>assert.equal(r.review_status,'needs_review'));
 await scenario('An off-road point remains unlinked',{...target,road_name_hint:'NONEXISTENT ROAD CONTROL',coordinates:{lon:77.209,lat:28.6139}},r=>{assert.equal(r.matched_segment_ids.length,0);assert.equal(r.review_status,'needs_review');});
 await scenario('OSM geometry does not invent authoritative chainage',{...target,coordinates:null,chainage_start_km:0,chainage_end_km:2},r=>{assert.equal(r.matched_segment_ids.length,0);assert.equal(r.review_status,'needs_review');});
 const workId=crypto.randomUUID();
 await client.query(`INSERT INTO works(id,tender_id,package_name,authority_name,work_type,official_status) VALUES($1,$2,'Isolated indexed-road test','Test authority','maintenance','unknown')`,[workId,target.tender_id+'-'+workId]);
 const linked=await linkWorkSegmentsWithPrecision(client,workId,target);
 const before=(await client.query('SELECT count(*) FROM ambiguous_matches_queue WHERE work_id=$1',[workId])).rows[0].count;
 await linkWorkSegmentsWithPrecision(client,workId,target);
 const after=(await client.query('SELECT count(*) FROM ambiguous_matches_queue WHERE work_id=$1',[workId])).rows[0].count;
 assert.equal(before,after,'Repeating the same association must not duplicate links');
 assert.equal(linked.matched_segment_ids.length,0);
 assert.equal(before,'1');
 assert.equal(positive.review_status,'needs_review','A project point must preserve candidates without inventing extent');
 await client.query('ROLLBACK');rolledBack=true;
 fs.writeFileSync(`${directory}/isolated-matching-results.json`,JSON.stringify({checked_at:new Date().toISOString(),database:new URL(process.env.TEST_DATABASE_URL).pathname.slice(1),sample_segments:rows.length,sample_roads:roads.size,rolled_back:true,link_rerun:{before,after},checks:results,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length},null,2));
 // Exercise the official production adapter's write/history/error paths in the
 // same dedicated test database, using its existing isolated verification.
 const verification=spawnSync(process.execPath,['--experimental-strip-types','scripts/verify-real-ingestion-db.mjs'],{env:process.env,encoding:'utf8'});
 fs.writeFileSync(`${directory}/isolated-official-output.txt`,verification.stdout+verification.stderr);
 assert.equal(verification.status,0,verification.stderr);
 assert.match(verification.stdout,/REAL_INGESTION_DATABASE_PASSED/);
 console.log(`Matcher scenarios: ${results.filter(r=>r.passed).length} passed, ${results.filter(r=>!r.passed).length} failed; failures are recorded for review.`);
 assert.equal(results.filter(r=>!r.passed).length,0,'Required matcher safety cases failed');
 console.log('INDEXED_INGESTION_SAFETY_PASSED');
} finally {
 if(!rolledBack)await client.query('ROLLBACK');
 client.release();await pool.end();
}
