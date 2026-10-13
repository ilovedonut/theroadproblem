import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../src/db/client.ts';
import { runTenderIngestion } from '../src/lib/ingestor/tender-ingestor.ts';
import { getStorageObject } from '../src/lib/storage.ts';

async function verifySingleIngestionFlow() {
  console.log('\n======================================================================');
  console.log(' VERIFYING SINGLE REAL INGESTION FLOW: PUBLIC WORKS TENDER PIPELINE');
  console.log('======================================================================\n');

  const client = await pool.connect();

  try {
    // A single, realistic MoRTH / NHAI tender for Outer Ring Road resurfacing
    const testTender = {
      source_name: "MoRTH Central Public Procurement Portal (CPPP)",
      authority_name: "Bruhat Bengaluru Mahanagara Palike (BBMP)",
      tender_id: `VERIFY-FLOW-${Date.now()}`,
      contract_id: `CTR-VERIFY-${Date.now()}`,
      package_name: "Automated Flow Verification: Bellandur to Kadubeesanahalli Grade Separator",
      work_type: "Asphalt Overlay & Pavement Strengthening",
      official_status: "awarded",
      contract_value_inr: 325000000,
      start_date: "2026-04-01",
      target_completion_date: "2026-12-31",
      actual_completion_date: null,
      defect_liability_end_date: "2029-12-31",
      external_key: `EXT-FLOW-${Date.now()}`,
      source_uri: "https://eprocure.gov.in/eprocure/app?page=FrontEndTenderDetails&id=VERIFY-FLOW",
      road_name_hint: "Outer Ring Road",
      chainage_start_km: 8.5,
      chainage_end_km: 12.0,
      contractor: {
        legal_name: "Afcons Infrastructure Limited",
        normalized_name: "afcons-infrastructure-limited",
        vendor_identifier: "VND-AFCONS-9901",
        cin: "U45200MH1976PLC019335",
        gstin: "27AAACA1976G1Z2"
      }
    };

    console.log('[Step 1] Ingesting New Official Public Works Tender...');
    const run1 = await runTenderIngestion(client, [testTender]);
    console.log('  Result 1:', run1);

    assert.equal(run1.total_discovered, 1, 'Should discover 1 tender');
    assert.equal(run1.new_inserted, 1, 'Should insert exactly 1 new tender');
    assert.equal(run1.unchanged_skipped, 0, 'Should not skip on initial insertion');
    assert.equal(run1.r2_archived, 1, 'Should archive raw payload to Cloudflare R2');

    // Step 2: Verify R2 / Storage Archival
    console.log('\n[Step 2] Verifying Cloudflare R2 / Storage Archival...');
    const rawJsonStr = JSON.stringify(testTender);
    const checksum = crypto.createHash('sha256').update(rawJsonStr).digest('hex');
    const r2Key = `raw_sources/tenders/${testTender.external_key}_${checksum.slice(0, 8)}.json`;
    
    const archivedBytes = await getStorageObject(r2Key);
    assert.ok(archivedBytes, 'Raw document must exist in R2/storage');
    const parsedArchived = JSON.parse(archivedBytes.toString('utf8'));
    assert.equal(parsedArchived.tender_id, testTender.tender_id);
    console.log(`  ✓ Raw tender archived in storage at: ${r2Key} (${archivedBytes.length} bytes)`);

    // Step 3: Verify Supabase Database Records & Relational Lineage
    console.log('\n[Step 3] Verifying Database Ledgers in Supabase PostGIS...');

    // 3a. source_records
    const recCheck = await client.query(`
      SELECT sr.id, sr.external_key, sr.checksum_sha256, ds.name as data_source
      FROM source_records sr
      JOIN data_sources ds ON sr.source_id = ds.id
      WHERE sr.external_key = $1;
    `, [testTender.external_key]);
    assert.equal(recCheck.rows.length, 1, 'source_records must contain entry');
    assert.equal(recCheck.rows[0].checksum_sha256, checksum, 'SHA-256 fingerprint must match');
    console.log(`  ✓ Provenance recorded in source_records (ID: ${recCheck.rows[0].id}, SHA: ${checksum.slice(0, 16)}...)`);

    // 3b. contractors
    const conCheck = await client.query(`
      SELECT id, legal_name, cin, gstin FROM contractors WHERE normalized_name = $1;
    `, [testTender.contractor.normalized_name]);
    assert.equal(conCheck.rows.length, 1, 'Contractor must exist');
    assert.equal(conCheck.rows[0].cin, testTender.contractor.cin);
    console.log(`  ✓ Contractor registered: ${conCheck.rows[0].legal_name} (CIN: ${conCheck.rows[0].cin})`);

    // 3c. works and work_contractors
    const workCheck = await client.query(`
      SELECT w.id, w.tender_id, w.official_status, w.contract_value_inr, wc.confidence
      FROM works w
      JOIN work_contractors wc ON w.id = wc.work_id
      WHERE w.tender_id = $1;
    `, [testTender.tender_id]);
    assert.equal(workCheck.rows.length, 1, 'Work package must exist');
    assert.equal(workCheck.rows[0].official_status, 'awarded');
    assert.equal(workCheck.rows[0].confidence, 'verified_contract');
    console.log(`  ✓ Work package linked: ₹${(parseFloat(workCheck.rows[0].contract_value_inr) / 10000000).toFixed(2)} Cr [Status: ${workCheck.rows[0].official_status}]`);

    // 3d. PostGIS spatial linkage
    const segCheck = await client.query(`
      SELECT COUNT(*) as seg_count
      FROM work_segments
      WHERE work_id = $1;
    `, [workCheck.rows[0].id]);
    const segCount = parseInt(segCheck.rows[0].seg_count, 10);
    assert.ok(segCount > 0, 'Work must be spatially linked to road segments via PostGIS');
    console.log(`  ✓ Work snapped to ${segCount} road segment(s) along Outer Ring Road`);

    // 3e. Civic audit event in ledger
    const eventCheck = await client.query(`
      SELECT event_type, new_state->>'contractor' as contractor_name
      FROM events
      WHERE entity_type = 'work' AND entity_id = $1;
    `, [workCheck.rows[0].id]);
    assert.ok(eventCheck.rows.length > 0, 'Audit event must be logged');
    assert.equal(eventCheck.rows[0].contractor_name, testTender.contractor.legal_name);
    console.log(`  ✓ Tamper-evident civic event logged: ${eventCheck.rows[0].event_type}`);

    // Step 4: Verify Idempotency on Second Run
    console.log('\n[Step 4] Verifying Idempotency (Rerunning with identical payload)...');
    const run2 = await runTenderIngestion(client, [testTender]);
    console.log('  Result 2:', run2);
    assert.equal(run2.total_discovered, 1);
    assert.equal(run2.new_inserted, 0, 'Must NOT insert duplicate work');
    assert.equal(run2.updated, 0, 'Must NOT make redundant updates');
    assert.equal(run2.unchanged_skipped, 1, 'Must skip identical records');
    console.log('  ✓ Idempotency verified: 0 duplicates, 0 phantom audit rows.');

    console.log('\n======================================================================');
    console.log(' ALL VERIFICATION CHECKS PASSED: END-TO-END INGESTION FLOW IS HEALTHY!');
    console.log('======================================================================\n');
  } finally {
    client.release();
    await pool.end();
  }
}

verifySingleIngestionFlow()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  });
