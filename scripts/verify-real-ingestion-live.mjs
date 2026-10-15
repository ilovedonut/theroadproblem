import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pool } from '../src/db/client.ts';
import { getStorageObject } from '../src/lib/storage.ts';
import { runAllIngestors } from '../src/lib/ingestor/runner.ts';
import { PPPAC_SOURCE,PARSE_VERSION,sha256 } from '../src/lib/ingestor/adapters/pppac.ts';
// Live verification imports only freshly fetched official data. No synthetic
// payloads, test users, incident submissions, seeds or schema changes occur here.
try {
 const count=async()=> (await pool.query(`SELECT (SELECT count(*) FROM source_records sr JOIN data_sources ds ON ds.id=sr.source_id WHERE ds.name=$1) AS source_versions,(SELECT count(*) FROM works w JOIN source_records sr ON sr.id=w.source_record_id WHERE sr.parse_version=$2) AS works,(SELECT count(*) FROM events e JOIN source_records sr ON sr.id=e.source_record_id WHERE sr.parse_version=$2) AS events,(SELECT count(*) FROM reports) AS reports`,[PPPAC_SOURCE,PARSE_VERSION])).rows[0];
 const before=await count();
 const first=(await runAllIngestors()).runs[0];assert.ok(first.total_discovered>0);assert.equal(first.errors.length,0);
 const afterFirst=await count();
 const second=(await runAllIngestors()).runs[0];const afterSecond=await count();
 assert.equal(second.new_inserted,0);assert.equal(second.updated,0);assert.equal(second.unchanged_skipped,second.total_discovered);assert.deepEqual(afterSecond,afterFirst);
 assert.equal(before.reports,afterSecond.reports,'Live ingestion must not submit citizen reports');
 const archive=await getStorageObject(first.archive_key);assert.ok(archive);assert.equal(sha256(archive),first.source_checksum);
 const record=(await pool.query(`SELECT sr.id,sr.source_uri,sr.raw_content,w.id AS work_id,w.contract_value_inr,w.official_status FROM source_records sr JOIN works w ON w.source_record_id=sr.id WHERE sr.parse_version=$1 ORDER BY sr.external_key LIMIT 1`,[PARSE_VERSION])).rows[0];
 assert.ok(record.source_uri.startsWith('https://www.pppinindia.gov.in/'));assert.equal(record.contract_value_inr,null);assert.equal(record.official_status,'unknown');
 const evidence={verified_at:new Date().toISOString(),before,afterFirst,afterSecond,first,second,archive_sha256:sha256(archive),representative_record:{id:record.id,work_id:record.work_id,source_url:record.source_uri,project_name:record.raw_content.package_name,approval_date:record.raw_content.approval_date,approved_project_cost_inr:record.raw_content.approved_project_cost_inr,matching:'needs_review_no_guessed_pin'}};
 fs.mkdirSync('docs/ingestion-repair/evidence',{recursive:true});fs.writeFileSync('docs/ingestion-repair/evidence/live-verification.json',JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence,null,2));console.log('REAL_LIVE_INGESTION_PASSED');
}finally {await pool.end();}
