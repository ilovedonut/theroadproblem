import crypto from 'node:crypto';
import pg from 'pg';
import { linkWorkSegmentsWithPrecision } from './matcher.ts';

export interface IngestSummary {
  total: number;
  inserted_or_updated: number;
  unchanged_skipped: number;
}

export async function ingestOfficialContracts(
  client: pg.PoolClient,
  contracts: any[]
): Promise<IngestSummary> {
  let insertedCount = 0;
  let skippedCount = 0;

  for (const c of contracts) {
    const rawJsonStr = JSON.stringify(c);
    const checksum = crypto.createHash('sha256').update(rawJsonStr).digest('hex');

    // 1. Find data source
    const dsRes = await client.query(`SELECT id FROM data_sources WHERE name = $1 LIMIT 1;`, [c.source_name]);
    let sourceId = dsRes.rows[0]?.id;
    if (!sourceId) {
      const newDs = await client.query(`
        INSERT INTO data_sources (name, publisher, base_uri, license, retrieval_method, update_frequency, terms_reviewed_at)
        VALUES ($1, $2, $3, $4, 'api_scheduled', 'weekly', NOW())
        RETURNING id;
      `, [c.source_name, c.authority_name, c.source_uri, c.license]);
      sourceId = newDs.rows[0].id;
    }

    // 2. Check if immutable version already exists
    const existingRec = await client.query(`
      SELECT id FROM source_records 
      WHERE source_id = $1 AND external_key = $2 AND checksum_sha256 = $3
      LIMIT 1;
    `, [sourceId, c.external_key, checksum]);

    if (existingRec.rows.length > 0) {
      skippedCount++;
      continue; // Unchanged rerun adds zero duplicate facts or events
    }

    // 3. Insert immutable source_record
    const recInsert = await client.query(`
      INSERT INTO source_records (
        source_id, external_key, source_uri, raw_content, checksum_sha256, parse_version, retrieved_at
      ) VALUES ($1, $2, $3, $4::jsonb, $5, 'v1.0.0', NOW())
      RETURNING id;
    `, [sourceId, c.external_key, c.source_uri, rawJsonStr, checksum]);
    const sourceRecordId = recInsert.rows[0].id;

    // 4. Upsert contractor
    let contractorId: string;
    const existingContractor = await client.query(`
      SELECT id FROM contractors WHERE normalized_name = $1 LIMIT 1;
    `, [c.contractor.normalized_name]);

    if (existingContractor.rows.length > 0) {
      contractorId = existingContractor.rows[0].id;
    } else {
      const conInsert = await client.query(`
        INSERT INTO contractors (legal_name, normalized_name, vendor_identifier, cin, gstin)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `, [c.contractor.legal_name, c.contractor.normalized_name, c.contractor.vendor_identifier, c.contractor.cin, c.contractor.gstin]);
      contractorId = conInsert.rows[0].id;
    }

    // 5. Upsert work package
    let workId: string;
    const existingWork = await client.query(`
      SELECT id, official_status FROM works WHERE tender_id = $1 LIMIT 1;
    `, [c.tender_id]);

    let oldStatus: string | null = null;
    if (existingWork.rows.length > 0) {
      workId = existingWork.rows[0].id;
      oldStatus = existingWork.rows[0].official_status;
      await client.query(`
        UPDATE works 
        SET official_status = $1, actual_completion_date = $2, source_record_id = $3
        WHERE id = $4;
      `, [c.official_status, c.actual_completion_date, sourceRecordId, workId]);
    } else {
      const workInsert = await client.query(`
        INSERT INTO works (
          authority_name, tender_id, contract_id, package_name, work_type, official_status,
          start_date, target_completion_date, actual_completion_date, contract_value_inr,
          defect_liability_end_date, source_record_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id;
      `, [
        c.authority_name, c.tender_id, c.contract_id, c.package_name, c.work_type, c.official_status,
        c.start_date, c.target_completion_date, c.actual_completion_date, c.contract_value_inr,
        c.defect_liability_end_date, sourceRecordId
      ]);
      workId = workInsert.rows[0].id;
    }

    // 6. Link Work to Contractor
    await client.query(`
      INSERT INTO work_contractors (work_id, contractor_id, role, confidence, source_record_id)
      VALUES ($1, $2, 'primary_contractor', 'verified_contract', $3)
      ON CONFLICT (work_id, contractor_id) DO UPDATE SET confidence = 'verified_contract';
    `, [workId, contractorId, sourceRecordId]);

    // 7. Multi-Criteria Precision Spatial / Road Segment Linkage
    await linkWorkSegmentsWithPrecision(client, workId, {
      tender_id: c.tender_id,
      package_name: c.package_name,
      district: c.district || null,
      authority_name: c.authority_name,
      road_name_hint: c.road_name_hint,
      road_ref: c.road_ref || null,
      chainage_start_km: c.chainage_start_km,
      chainage_end_km: c.chainage_end_km,
    }, sourceRecordId);

    // 8. Append Civic Audit Event
    await client.query(`
      INSERT INTO events (
        entity_type, entity_id, event_type, old_state, new_state, effective_at, source_record_id, reason
      ) VALUES (
        'work', $1, 
        CASE WHEN $2::text IS NULL THEN 'work_package_awarded' ELSE 'work_status_updated' END,
        jsonb_build_object('official_status', $2::text),
        jsonb_build_object('official_status', $3::text, 'contractor', $4::text, 'package', $5::text),
        NOW(), $6, 'Official public works data refreshed from ' || $7::text
      );
    `, [workId, oldStatus, c.official_status, c.contractor.legal_name, c.package_name, sourceRecordId, c.source_name]);

    insertedCount++;
  }

  return {
    total: contracts.length,
    inserted_or_updated: insertedCount,
    unchanged_skipped: skippedCount,
  };
}
