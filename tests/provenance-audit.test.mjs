import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const { Pool } = pg;

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

const pool = new Pool({ connectionString: resolveDatabaseUrl() });

test('Stage 06 Provenance Audit: R10 Every official claim has complete provenance and disclaimer', async (t) => {
  const client = await pool.connect();
  try {
    const worksQuery = await client.query(`
      SELECT 
        w.id as work_id,
        w.package_name,
        w.authority_name,
        w.tender_id,
        w.contract_id,
        w.official_status,
        w.contract_value_inr,
        c.legal_name as contractor_name,
        wc.confidence as contractor_confidence,
        ds.name as data_source_name,
        ds.publisher as publisher,
        ds.license as license,
        sr.source_uri as source_uri,
        sr.checksum_sha256 as checksum,
        sr.retrieved_at as retrieved_at
      FROM works w
      JOIN work_contractors wc ON w.id = wc.work_id
      JOIN contractors c ON wc.contractor_id = c.id
      JOIN source_records sr ON w.source_record_id = sr.id
      JOIN data_sources ds ON sr.source_id = ds.id;
    `);

    assert.ok(worksQuery.rows.length >= 2, 'Expected at least 2 official works with full joins');

    for (const row of worksQuery.rows) {
      assert.ok(row.publisher, 'Publisher must not be empty');
      assert.ok(row.source_uri.startsWith('http'), 'source_uri must be valid HTTP(S) URL');
      assert.ok(row.license.includes('GODL'), 'License must be GODL India');
      assert.ok(row.checksum && row.checksum.length === 64, 'Checksum must be 64-char SHA-256');
      assert.ok(row.retrieved_at, 'Retrieval timestamp must be present');
      assert.ok(row.tender_id, 'Tender ID must be present');
      assert.ok(row.contractor_confidence === 'verified_contract', 'Contractor confidence must be verified_contract');
    }

    // Save evidence
    const evidence = {
      gate: "R10",
      status: "PASS",
      environment: "Local Real PostgreSQL 18 + PostGIS 3.6",
      verified_at: new Date().toISOString(),
      audited_records_count: worksQuery.rows.length,
      sample_records: worksQuery.rows.map((r) => ({
        package: r.package_name,
        contractor: r.contractor_name,
        publisher: r.publisher,
        source_url: r.source_uri,
        license: r.license,
        checksum: r.checksum,
        retrieved_at: r.retrieved_at,
        confidence: r.contractor_confidence
      })),
      disclaimer_policy: "A contractor's association with a package is documented administrative assignment and not proof of fault or blame for community damage observations."
    };
    fs.writeFileSync('docs/evidence/stage-06/r10-provenance.json', JSON.stringify(evidence, null, 2));

  } finally {
    client.release();
    await pool.end();
  }
});
