import '../scripts/test-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pool } from '../src/db/client.ts';

test('R17 Disaster Recovery: Real pg_dump export and clean schema restore rehearsal', async (t) => {
  t.after(async () => {
    await pool.end();
  });

  const evidence = {
    test: 'R17: Disaster Recovery Database and Media Restore',
    timestamp: new Date().toISOString(),
    steps: []
  };

  const backupDir = path.resolve('docs/evidence/stage-09');
  fs.mkdirSync(backupDir, { recursive: true });
  const dumpFilePath = '/tmp/theroadproblem_rehearsal.sql';

  try {
    // 1. Execute real pg_dump of theroadproblem database in WSL2
    const dumpCmd = `wsl -d Ubuntu -- bash -c "sudo -u postgres pg_dump --schema=public theroadproblem > ${dumpFilePath}"`;
    execSync(dumpCmd, { stdio: 'pipe' });

    // Verify dump file was created and has non-zero size
    const dumpSizeCmd = `wsl -d Ubuntu -- bash -c "stat -c%s ${dumpFilePath}"`;
    const dumpSizeBytes = parseInt(execSync(dumpSizeCmd, { encoding: 'utf8' }).trim(), 10);
    assert.ok(dumpSizeBytes > 1000, `Dump file size (${dumpSizeBytes} bytes) must be substantial`);

    evidence.steps.push({
      step: '1_pg_dump_export',
      status: 'PASS',
      dump_file: dumpFilePath,
      size_bytes: dumpSizeBytes
    });

    // 2. Prepare Clean Isolated Recovery Database
    const recoveryDb = 'theroadproblem_recovery_rehearsal';
    execSync(`wsl -d Ubuntu -- bash -c "sudo -u postgres psql -c 'DROP DATABASE IF EXISTS ${recoveryDb};' && sudo -u postgres psql -c 'CREATE DATABASE ${recoveryDb};' && sudo -u postgres psql -d ${recoveryDb} -c 'CREATE EXTENSION IF NOT EXISTS postgis;'"`, { stdio: 'pipe' });

    evidence.steps.push({
      step: '2_clean_environment_provisioned',
      status: 'PASS',
      recovery_db: recoveryDb
    });

    // 3. Restore dump into clean isolated database
    const restoreCmd = `wsl -d Ubuntu -- bash -c "sudo -u postgres psql -d ${recoveryDb} < ${dumpFilePath}"`;
    execSync(restoreCmd, { stdio: 'pipe' });

    evidence.steps.push({
      step: '3_database_restored',
      status: 'PASS',
      target_db: recoveryDb
    });

    // 4. Assert integrity of restored data in clean database
    const verifySql = `
      SELECT 
        (SELECT count(*) FROM roads) as roads_count,
        (SELECT count(*) FROM road_segments) as segments_count,
        (SELECT count(*) FROM incidents) as incidents_count,
        (SELECT count(*) FROM reports) as reports_count,
        (SELECT count(*) FROM events) as events_count,
        (SELECT ST_GeometryType(geom) FROM road_segments LIMIT 1) as sample_geom_type;
    `;
    const checkOutput = execSync(`wsl -d Ubuntu -- bash -c "sudo -u postgres psql -d ${recoveryDb} -t -A -F ',' -c \\"${verifySql.replace(/\n/g, ' ')}\\""`, { encoding: 'utf8' }).trim();
    const [roadsCount, segmentsCount, incidentsCount, reportsCount, eventsCount, sampleGeomType] = checkOutput.split(',');

    assert.ok(parseInt(roadsCount, 10) > 0, 'Restored roads must exist');
    assert.ok(parseInt(segmentsCount, 10) > 0, 'Restored segments must exist');
    assert.ok(parseInt(incidentsCount, 10) > 0, 'Restored incidents must exist');
    assert.ok(sampleGeomType.includes('LineString'), 'Spatial geometry types intact');

    evidence.steps.push({
      step: '4_integrity_verified',
      status: 'PASS',
      restored_counts: {
        roads: parseInt(roadsCount, 10),
        segments: parseInt(segmentsCount, 10),
        incidents: parseInt(incidentsCount, 10),
        reports: parseInt(reportsCount, 10),
        events: parseInt(eventsCount, 10)
      },
      spatial_type: sampleGeomType
    });

    // 5. Clean up temporary recovery database and dump file
    execSync(`wsl -d Ubuntu -- bash -c "sudo -u postgres psql -c 'DROP DATABASE ${recoveryDb};' && rm -f ${dumpFilePath}"`, { stdio: 'pipe' });

    evidence.steps.push({
      step: '5_clean_teardown',
      status: 'PASS',
      temporary_environment_purged: true
    });

    // Save evidence
    fs.writeFileSync(path.join(backupDir, 'r17-restore.json'), JSON.stringify(evidence, null, 2));

  } catch (err) {
    throw err;
  }
});
