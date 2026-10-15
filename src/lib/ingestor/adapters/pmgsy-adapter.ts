import crypto from 'node:crypto';
import pg from 'pg';
import { putStorageObject } from '../../storage.ts';
import { linkWorkSegmentsWithPrecision } from '../../matcher.ts';
import type { IngestRunSummary } from '../types.ts';

export interface PmgsyRecord {
  source_name: string;
  publisher: string;
  base_uri: string;
  district: string;
  state: string;
  package_name: string;
  tender_id: string;
  contract_id: string;
  work_type: string;
  official_status: string;
  contract_value_inr: number;
  start_date: string;
  target_completion_date: string;
  actual_completion_date?: string | null;
  defect_liability_end_date: string;
  external_key: string;
  source_uri: string;
  road_name_hint?: string;
  road_ref?: string;
  chainage_start_km?: number;
  chainage_end_km?: number;
  coordinates?: { lon: number; lat: number } | null;
  geometry_geojson?: unknown;
  sanction_year?: string;
  sanction_order_no?: string;
  sanction_date?: string;
  executive_engineer?: string;
  payload_version?: string;
  contractor: {
    legal_name: string;
    normalized_name: string;
    vendor_identifier: string;
    cin: string;
    gstin: string;
  };
}

export interface PmgsyAdapterOptions {
  endpointUrl?: string;
  directRecords?: PmgsyRecord[];
  district?: string;
  maxRetries?: number;
  initialBackoffMs?: number;
}

/**
 * Robust HTTP Fetch with Bounded Retries & Exponential Backoff
 */
export async function fetchWithRetry(
  url: string,
  options: { maxRetries?: number; initialBackoffMs?: number } = {}
): Promise<{ records: PmgsyRecord[]; cursor?: string; district?: string }> {
  const maxRetries = options.maxRetries ?? 3;
  const initialBackoffMs = options.initialBackoffMs ?? 200;

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'TheRoadProblem-IngestionWorker/1.0 (+https://theroadproblem.quest)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      lastError = err;
      attempt++;
      if (attempt > maxRetries) break;

      const backoff = initialBackoffMs * Math.pow(2, attempt - 1) + Math.random() * 50;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw new Error(`Fetch failed after ${maxRetries} retries for ${url}: ${lastError?.message}`);
}

/**
 * PMGSY OMMAS Ingestion Adapter:
 * - Fetches records for target district (e.g., Ramanagara)
 * - Archives immutable raw JSON in Cloudflare R2 under versioned checksum keys
 * - Deduplicates via SHA-256 fingerprinting
 * - Preserves historical source lineage on mutation
 * - Multi-criteria precision road matching with ambiguous queue routing
 * - Records execution ledger in ingestion_runs
 */
export async function runPmgsyIngestion(
  client: pg.PoolClient,
  options: PmgsyAdapterOptions = {}
): Promise<IngestRunSummary & { runId?: string; matchedRoads?: any[] }> {
  const startedAt = new Date().toISOString();
  const district = options.district || 'Ramanagara';
  const errors: string[] = [];
  const failedRecords: any[] = [];
  const matchedRoads: any[] = [];

  let recordsDiscovered = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let r2Count = 0;
  let runId: string | undefined;

  // 1. Fetch Records
  let records: PmgsyRecord[] = [];
  let cursorState = `pmgsy-${district}-${Date.now()}`;

  try {
    if (options.directRecords && options.directRecords.length > 0) {
      records = options.directRecords;
    } else if (options.endpointUrl) {
      const fetched = await fetchWithRetry(options.endpointUrl, {
        maxRetries: options.maxRetries ?? 3,
        initialBackoffMs: options.initialBackoffMs ?? 200,
      });
      records = fetched.records || [];
      if (fetched.cursor) cursorState = fetched.cursor;
    } else {
      throw new Error('Either endpointUrl or directRecords must be provided to runPmgsyIngestion');
    }
  } catch (fetchErr: any) {
    errors.push(`Fetch failed: ${fetchErr.message}`);
    return {
      job: 'pmgsy_ommas_ingestor',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      total_discovered: 0,
      new_inserted: 0,
      updated: 0,
      unchanged_skipped: 0,
      r2_archived: 0,
      errors,
    };
  }

  recordsDiscovered = records.length;

  // 2. Initialize Ingestion Run Audit Ledger Row
  try {
    const runRes = await client.query(`
      INSERT INTO ingestion_runs (
        source_name, district, run_status, cursor_state,
        records_discovered, records_inserted, records_updated, records_skipped,
        started_at
      ) VALUES ($1, $2, 'running', $3, $4, 0, 0, 0, NOW())
      RETURNING id;
    `, [`PMGSY OMMAS ${district}`, district, cursorState, recordsDiscovered]);
    runId = runRes.rows[0]?.id;
  } catch (runInitErr: any) {
    console.warn(`[Ingestion Run Init Warning] ${runInitErr.message}`);
  }

  // 3. Process Each Record
  for (const rec of records) {
    try {
      const rawJsonStr = JSON.stringify(rec);
      const checksum = crypto.createHash('sha256').update(rawJsonStr).digest('hex');

      // 3a. Archive raw payload to R2 under immutable versioned checksum key
      const r2Key = `raw_sources/pmgsy/${rec.external_key}_${checksum.slice(0, 16)}.json`;
      try {
        await putStorageObject(r2Key, Buffer.from(rawJsonStr, 'utf8'), 'application/json');
        r2Count++;
      } catch (r2Err: any) {
        console.warn(`[Storage Archival Non-fatal] ${r2Err.message}`);
      }

      // 3b. Register / Lookup Data Source
      const dsRes = await client.query(`
        SELECT id FROM data_sources WHERE name = $1 LIMIT 1;
      `, [rec.source_name]);

      let sourceId = dsRes.rows[0]?.id;
      if (!sourceId) {
        const newDs = await client.query(`
          INSERT INTO data_sources (
            name, publisher, base_uri, license, retrieval_method, update_frequency, terms_reviewed_at
          ) VALUES ($1, $2, $3, 'Open Government Data License - India (OGDL)', 'api_scheduled', 'daily', NOW())
          RETURNING id;
        `, [rec.source_name, rec.publisher || 'NRIDA / KRRDA', rec.base_uri || rec.source_uri]);
        sourceId = newDs.rows[0].id;
      }

      // 3c. Idempotency Check: Identical Checksum Already Ingested
      const existingExact = await client.query(`
        SELECT id FROM source_records 
        WHERE source_id = $1 AND external_key = $2 AND checksum_sha256 = $3
        LIMIT 1;
      `, [sourceId, rec.external_key, checksum]);

      if (existingExact.rows.length > 0) {
        // Idempotent: identical content, skip duplicate insertion
        skipped++;
        continue;
      }

      // 3d. Check for Source Mutation (Same external_key, different checksum)
      const existingPrior = await client.query(`
        SELECT sr.id, sr.checksum_sha256, sr.raw_content, w.id as work_id, w.official_status
        FROM source_records sr
        LEFT JOIN works w ON w.tender_id = $3
        WHERE sr.source_id = $1 AND sr.external_key = $2
        ORDER BY sr.retrieved_at DESC
        LIMIT 1;
      `, [sourceId, rec.external_key, rec.tender_id]);

      let sourceRecordId: string;

      if (existingPrior.rows.length > 0) {
        // Source Mutation: Preserve historical older record, append new source record version
        const priorRecord = existingPrior.rows[0];
        const newSrRes = await client.query(`
          INSERT INTO source_records (
            source_id, external_key, source_uri, raw_content, checksum_sha256, parse_version, retrieved_at
          ) VALUES ($1, $2, $3, $4::jsonb, $5, 'v1.2.0-pmgsy', NOW())
          RETURNING id;
        `, [sourceId, rec.external_key, rec.source_uri, rawJsonStr, checksum]);
        sourceRecordId = newSrRes.rows[0].id;

        // Update works record with evolved official status
        if (priorRecord.work_id) {
          const oldStatus = priorRecord.official_status;
          await client.query(`
            UPDATE works SET
              official_status = $1,
              actual_completion_date = $2,
              contract_value_inr = $3,
              source_record_id = $4
            WHERE id = $5;
          `, [
            rec.official_status,
            rec.actual_completion_date || null,
            rec.contract_value_inr,
            sourceRecordId,
            priorRecord.work_id
          ]);

          // Emit civic audit event for the status transition
          await client.query(`
            INSERT INTO events (
              entity_type, entity_id, event_type, old_state, new_state, source_record_id, reason
            ) VALUES (
              'work',
              $1,
              'work_status_updated',
              $2::jsonb,
              $3::jsonb,
              $4,
              'Official government status transition detected from PMGSY OMMAS refresh'
            );
          `, [
            priorRecord.work_id,
            JSON.stringify({
              official_status: oldStatus,
              checksum: priorRecord.checksum_sha256
            }),
            JSON.stringify({
              official_status: rec.official_status,
              checksum,
              actual_completion_date: rec.actual_completion_date
            }),
            sourceRecordId
          ]);
        }

        updated++;
      } else {
        // 3e. New Record Ingestion: Insert source_record
        const srRes = await client.query(`
          INSERT INTO source_records (
            source_id, external_key, source_uri, raw_content, checksum_sha256, parse_version, retrieved_at
          ) VALUES ($1, $2, $3, $4::jsonb, $5, 'v1.2.0-pmgsy', NOW())
          RETURNING id;
        `, [sourceId, rec.external_key, rec.source_uri, rawJsonStr, checksum]);
        sourceRecordId = srRes.rows[0].id;

        // Upsert contractor
        const contractorNorm = rec.contractor.normalized_name;
        let contractorId: string;
        const existingContractor = await client.query(
          `SELECT id FROM contractors WHERE normalized_name = $1 LIMIT 1;`,
          [contractorNorm]
        );

        if (existingContractor.rows.length > 0) {
          contractorId = existingContractor.rows[0].id;
          await client.query(`
            UPDATE contractors SET
              vendor_identifier = COALESCE($1, vendor_identifier),
              cin = COALESCE($2, cin),
              gstin = COALESCE($3, gstin)
            WHERE id = $4;
          `, [rec.contractor.vendor_identifier, rec.contractor.cin, rec.contractor.gstin, contractorId]);
        } else {
          const conInsert = await client.query(`
            INSERT INTO contractors (legal_name, normalized_name, vendor_identifier, cin, gstin)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
          `, [
            rec.contractor.legal_name,
            contractorNorm,
            rec.contractor.vendor_identifier,
            rec.contractor.cin,
            rec.contractor.gstin
          ]);
          contractorId = conInsert.rows[0].id;
        }

        // Upsert work
        let workId: string;
        const existingWork = await client.query(
          `SELECT id, official_status FROM works WHERE tender_id = $1 LIMIT 1;`,
          [rec.tender_id]
        );

        if (existingWork.rows.length > 0) {
          workId = existingWork.rows[0].id;
          await client.query(`
            UPDATE works SET
              official_status = $1,
              contract_value_inr = $2,
              actual_completion_date = $3,
              source_record_id = $4
            WHERE id = $5;
          `, [
            rec.official_status,
            rec.contract_value_inr,
            rec.actual_completion_date || null,
            sourceRecordId,
            workId
          ]);
        } else {
          const workInsert = await client.query(`
            INSERT INTO works (
              tender_id, contract_id, package_name, authority_name, work_type,
              official_status, contract_value_inr, start_date, target_completion_date,
              actual_completion_date, defect_liability_end_date, source_record_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id;
          `, [
            rec.tender_id,
            rec.contract_id,
            rec.package_name,
            rec.publisher,
            rec.work_type,
            rec.official_status,
            rec.contract_value_inr,
            rec.start_date,
            rec.target_completion_date,
            rec.actual_completion_date || null,
            rec.defect_liability_end_date,
            sourceRecordId
          ]);
          workId = workInsert.rows[0].id;
        }

        // Link work to contractor
        const existingWc = await client.query(
          `SELECT work_id FROM work_contractors WHERE work_id = $1 AND contractor_id = $2;`,
          [workId, contractorId]
        );
        if (existingWc.rows.length === 0) {
          await client.query(`
            INSERT INTO work_contractors (work_id, contractor_id, role, confidence, source_record_id)
            VALUES ($1, $2, 'primary_contractor', 'verified_contract', $3);
          `, [workId, contractorId, sourceRecordId]);
        }

        // Precision Road Matching
        const matchResult = await linkWorkSegmentsWithPrecision(
          client,
          workId,
          {
            tender_id: rec.tender_id,
            package_name: rec.package_name,
            district: rec.district,
            authority_name: rec.publisher,
            road_name_hint: rec.road_name_hint,
            road_ref: rec.road_ref,
            chainage_start_km: rec.chainage_start_km,
            chainage_end_km: rec.chainage_end_km,
            coordinates: rec.coordinates || null,
            geometry_geojson: rec.geometry_geojson || null,
          },
          sourceRecordId
        );

        matchedRoads.push(matchResult);

        // Emit audit event
        await client.query(`
          INSERT INTO events (
            entity_type, entity_id, event_type, new_state, source_record_id, reason
          ) VALUES (
            'work',
            $1,
            'work_registered',
            $2::jsonb,
            $3,
            'Initial public works contract indexed from PMGSY OMMAS'
          );
        `, [
          workId,
          JSON.stringify({
            tender_id: rec.tender_id,
            contractor: rec.contractor.legal_name,
            contract_value_inr: rec.contract_value_inr,
            official_status: rec.official_status,
            matching_confidence: matchResult.confidence,
            matched_road: matchResult.road_name
          }),
          sourceRecordId
        ]);

        inserted++;
      }
    } catch (recErr: any) {
      errors.push(`Record ${rec.external_key}: ${recErr.message}`);
      failedRecords.push({
        external_key: rec.external_key,
        error: recErr.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // 4. Update Ingestion Runs Audit Ledger
  if (runId) {
    try {
      await client.query(`
        UPDATE ingestion_runs SET
          run_status = $1,
          records_inserted = $2,
          records_updated = $3,
          records_skipped = $4,
          failed_records = $5::jsonb,
          completed_at = NOW()
        WHERE id = $6;
      `, [
        errors.length > 0 ? (inserted > 0 || updated > 0 ? 'completed' : 'failed') : 'completed',
        inserted,
        updated,
        skipped,
        JSON.stringify(failedRecords),
        runId
      ]);
    } catch (updateErr: any) {
      console.warn(`[Ingestion Run Update Warning] ${updateErr.message}`);
    }
  }

  return {
    job: 'pmgsy_ommas_ingestor',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    total_discovered: recordsDiscovered,
    new_inserted: inserted,
    updated,
    unchanged_skipped: skipped,
    r2_archived: r2Count,
    errors,
    runId,
    matchedRoads
  };
}
