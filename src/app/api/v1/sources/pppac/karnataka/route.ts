import { query } from '@/db/client';
import { PARSE_VERSION,PPPAC_PUBLISHER,PPPAC_URL } from '@/lib/ingestor/adapters/pppac';
export const dynamic='force-dynamic';
export async function GET() {
  try {
    const result=await query(`SELECT w.id AS project_id,sr.id AS source_record_id,sr.external_key,sr.source_uri,sr.retrieved_at,sr.checksum_sha256,
      sr.raw_content->>'package_name' AS project_name,sr.raw_content->>'authority_name' AS authority,
      sr.raw_content->>'approval_date' AS approval_date,sr.raw_content->>'approval_status' AS approval_status,
      sr.raw_content->>'approved_project_cost_inr' AS approved_project_cost_inr,
      sr.raw_content->>'financial_basis' AS financial_basis,
      sr.raw_content->'archive'->>'sha256' AS archived_document_sha256,
      'needs_review' AS road_matching_status
      FROM works w JOIN source_records sr ON sr.id=w.source_record_id
      WHERE sr.parse_version=$1 ORDER BY sr.external_key LIMIT 500`,[PARSE_VERSION]);
    return Response.json({publisher:PPPAC_PUBLISHER,source_url:PPPAC_URL,coverage:'Karnataka road project approvals; not contract awards, current road condition or actual spending',records:result.rows},{headers:{'Cache-Control':'public, max-age=60'}});
  }catch(error){console.error('Official source query failed',error);return Response.json({error:'Official source records are temporarily unavailable.'},{status:503});}
}
