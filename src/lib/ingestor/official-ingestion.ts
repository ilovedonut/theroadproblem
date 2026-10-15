import type pg from 'pg';
import { putStorageObject, type StorageUploadResult } from '../storage.ts';
import { fetchPppac, PARSE_VERSION, PPPAC_PUBLISHER, PPPAC_SOURCE, PPPAC_URL, sha256 } from './adapters/pppac.ts';
import type { IngestRunSummary } from './types.ts';
type FetchResult=Awaited<ReturnType<typeof fetchPppac>>;
type Archive=(key:string,body:Buffer,type:string)=>Promise<StorageUploadResult>;

export async function runOfficialIngestion(client:pg.PoolClient,options:{dryRun?:boolean;fetchSource?:()=>Promise<FetchResult>;archive?:Archive;requireRemoteArchive?:boolean}={}) {
  const summary:IngestRunSummary&{run_id?:string;dry_run:boolean;source_url:string;archive_key?:string;source_checksum?:string;review_required:number}={job:'pppac_karnataka_roads',started_at:new Date().toISOString(),completed_at:'',total_discovered:0,new_inserted:0,updated:0,unchanged_skipped:0,r2_archived:0,errors:[],dry_run:!!options.dryRun,source_url:PPPAC_URL,review_required:0};
  if(options.dryRun){const source=await(options.fetchSource||fetchPppac)();return {...summary,total_discovered:source.records.length,source_checksum:source.checksum,completed_at:new Date().toISOString()};}
  const lock=await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',[PPPAC_SOURCE]);
  if(!lock.rows[0].acquired)throw new Error('An official ingestion run is already active');
  let runId:string|undefined;
  try {
    runId=(await client.query(`INSERT INTO ingestion_runs(source_name,run_status,cursor_state) VALUES($1,'running',$2) RETURNING id`,[PPPAC_SOURCE,PPPAC_URL])).rows[0].id;summary.run_id=runId;
    const fetched=await(options.fetchSource||fetchPppac)();summary.total_discovered=fetched.records.length;summary.source_checksum=fetched.checksum;
    const key=`raw_sources/pppac/karnataka/${fetched.checksum}.html`;
    const archived=await(options.archive||putStorageObject)(key,fetched.body,'text/html; charset=utf-8');
    if(options.requireRemoteArchive!==false&&archived.driver==='local')throw new Error('Production ingestion requires confirmed R2 archival');
    summary.archive_key=key;summary.r2_archived=1;
    await client.query('BEGIN');
    const ds=await client.query(`SELECT id FROM data_sources WHERE name=$1 ORDER BY created_at LIMIT 1`,[PPPAC_SOURCE]);
    const sourceId=ds.rows[0]?.id||(await client.query(`INSERT INTO data_sources(name,publisher,base_uri,license,retrieval_method,update_frequency,terms_reviewed_at) VALUES($1,$2,$3,$4,'official_html','twice_daily',NOW()) RETURNING id`,[PPPAC_SOURCE,PPPAC_PUBLISHER,PPPAC_URL,'Public official register; reuse subject to publisher terms. No open-data licence asserted.'])).rows[0].id;
    for(const record of fetched.records) {
      const checksum=sha256(JSON.stringify(record));
      const prior=await client.query(`SELECT id,checksum_sha256 FROM source_records WHERE source_id=$1 AND external_key=$2 ORDER BY retrieved_at DESC,id DESC LIMIT 1`,[sourceId,record.external_key]);
      // Compare the current projection, rather than the newest immutable version:
      // a source can legitimately revert to an older published value.
      const current=await client.query(`SELECT w.id,sr.id AS source_record_id,sr.checksum_sha256 FROM works w JOIN source_records sr ON sr.id=w.source_record_id WHERE sr.source_id=$1 AND sr.external_key=$2 LIMIT 1`,[sourceId,record.external_key]);
      if(current.rows[0]?.checksum_sha256===checksum){summary.unchanged_skipped++;continue;}
      const exact=await client.query('SELECT id FROM source_records WHERE source_id=$1 AND external_key=$2 AND checksum_sha256=$3',[sourceId,record.external_key,checksum]);
      const payload={...record,source_name:PPPAC_SOURCE,publisher:PPPAC_PUBLISHER,source_uri:PPPAC_URL,work_type:'PPPAC road project appraisal',official_status:'unknown',financial_basis:'approved_project_cost_not_contract_award_or_actual_spend',archive:{key,sha256:fetched.checksum,bucket:archived.bucket},details:`${record.approval_status} on ${record.approval_date}; approved project cost INR ${record.approved_project_cost_inr}. Current construction status and contractor are not provided by this register.`,is_demo:false};
      const srId=exact.rows[0]?.id||(await client.query(`INSERT INTO source_records(source_id,external_key,source_uri,raw_content,checksum_sha256,parse_version) VALUES($1,$2,$3,$4::jsonb,$5,$6) RETURNING id`,[sourceId,record.external_key,PPPAC_URL,JSON.stringify(payload),checksum,PARSE_VERSION])).rows[0].id;
      let workId:string;
      if(current.rows.length){workId=current.rows[0].id;await client.query(`UPDATE works SET package_name=$1,authority_name=$2,source_record_id=$3 WHERE id=$4`,[record.package_name,record.authority_name,srId,workId]);summary.updated++;}
      else{workId=(await client.query(`INSERT INTO works(authority_name,package_name,work_type,official_status,source_record_id) VALUES($1,$2,'PPPAC road project appraisal','unknown',$3) RETURNING id`,[record.authority_name,record.package_name,srId])).rows[0].id;summary.new_inserted++;}
      await client.query(`INSERT INTO events(entity_type,entity_id,event_type,old_state,new_state,source_record_id,reason) VALUES('work',$1,$2,$3::jsonb,$4::jsonb,$5,$6)`,[workId,current.rows.length?'official_source_revised':'official_project_recorded',current.rows[0]?JSON.stringify(current.rows[0]):null,JSON.stringify({source_record_id:srId,checksum,approval_status:record.approval_status,approved_project_cost_inr:record.approved_project_cost_inr}),srId,'Fetched from the Ministry of Finance PPPAC register; approval is not an award or ground verification.']);
      // Statewide approvals lack district and georeferenced chainage. Historic
      // NH numbers alone cannot safely identify present-day OSM segments.
      await client.query(`INSERT INTO ambiguous_matches_queue(source_record_id,work_id,tender_id,authority_name,road_name_hint,chainage_start_km,chainage_end_km,candidate_segment_ids,reason) VALUES($1,$2,$3,$4,$5,$6,$7,'[]'::jsonb,$8)`,[srId,workId,record.external_key,record.authority_name,record.road_ref,record.chainage_start_km,record.chainage_end_km,'Official statewide project approval; district/geometry and road identifier concordance must be reviewed before attaching to road segments.']);summary.review_required++;
    }
    await client.query(`UPDATE ingestion_runs SET run_status='completed',records_discovered=$2,records_inserted=$3,records_updated=$4,records_skipped=$5,completed_at=NOW(),last_successful_refresh=NOW(),cursor_state=$6 WHERE id=$1`,[runId,summary.total_discovered,summary.new_inserted,summary.updated,summary.unchanged_skipped,JSON.stringify({source_url:PPPAC_URL,archive_key:key,sha256:fetched.checksum})]);
    await client.query('COMMIT');summary.completed_at=new Date().toISOString();return summary;
  }catch(error){await client.query('ROLLBACK');const message=error instanceof Error?error.message:'Unknown ingestion error';if(runId)await client.query(`UPDATE ingestion_runs SET run_status='failed',failures_count=1,failed_records=$2::jsonb,completed_at=NOW() WHERE id=$1`,[runId,JSON.stringify([{error:message}])]);throw error;}
  finally{await client.query('SELECT pg_advisory_unlock(hashtext($1))',[PPPAC_SOURCE]);}
}
