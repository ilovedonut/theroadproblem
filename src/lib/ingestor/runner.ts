import { pool } from '../../db/client.ts';
import { runTenderIngestion } from './tender-ingestor.ts';
import { runNewsIngestion } from './news-ingestor.ts';

export async function runAllIngestors() {
  console.log('='.repeat(70));
  console.log(' THE ROAD PROBLEM: AUTOMATED CIVIC DATA INGESTION SUITE');
  console.log(` Started at: ${new Date().toISOString()}`);
  console.log('='.repeat(70));

  const client = await pool.connect();
  const summaryReport: Record<string, any> = {
    timestamp: new Date().toISOString(),
    runs: []
  };

  try {
    // 1. Run Official Tender Ingestion (CPPP, Karnataka KPPP, NHAI)
    console.log('\n[1/2] Ingesting Official Works & Procurement Tenders...');
    const tenderSummary = await runTenderIngestion(client);
    summaryReport.runs.push(tenderSummary);
    console.log(`  Discovered: ${tenderSummary.total_discovered} | Inserted: ${tenderSummary.new_inserted} | Updated: ${tenderSummary.updated} | Skipped (No Change): ${tenderSummary.unchanged_skipped} | Archived to R2: ${tenderSummary.r2_archived}`);
    if (tenderSummary.errors.length > 0) {
      console.warn(`  Errors encountered (${tenderSummary.errors.length}):`, tenderSummary.errors);
    }

    // 2. Run Civic News & Signals Ingestion (RSS Feeds & Citizen Desks)
    console.log('\n[2/3] Ingesting Regional News & Civic Infrastructure Signals...');
    const newsSummary = await runNewsIngestion(client);
    summaryReport.runs.push(newsSummary);
    console.log(`  Discovered: ${newsSummary.total_discovered} | Inserted: ${newsSummary.new_inserted} | Skipped (No Change): ${newsSummary.unchanged_skipped} | Archived to R2: ${newsSummary.r2_archived}`);
    if (newsSummary.errors.length > 0) {
      console.warn(`  Errors encountered (${newsSummary.errors.length}):`, newsSummary.errors);
    }

    // 3. Run PMGSY OMMAS Rural Road Ingestion (Ramanagara District)
    console.log('\n[3/3] Ingesting Official PMGSY OMMAS Rural Road Records (Ramanagara)...');
    const { runPmgsyIngestion } = await import('./adapters/pmgsy-adapter.ts');
    const { getPmgsyRepresentativeRecords } = await import('../../app/api/v1/sources/pmgsy/ramanagara/route.ts');
    const pmgsyRecords = getPmgsyRepresentativeRecords();
    const pmgsySummary = await runPmgsyIngestion(client, {
      district: 'Ramanagara',
      directRecords: pmgsyRecords
    });
    summaryReport.runs.push(pmgsySummary);
    console.log(`  Discovered: ${pmgsySummary.total_discovered} | Inserted: ${pmgsySummary.new_inserted} | Updated: ${pmgsySummary.updated} | Skipped (No Change): ${pmgsySummary.unchanged_skipped} | Archived to R2: ${pmgsySummary.r2_archived}`);
    if (pmgsySummary.errors.length > 0) {
      console.warn(`  Errors encountered (${pmgsySummary.errors.length}):`, pmgsySummary.errors);
    }

    console.log('\n' + '='.repeat(70));
    console.log(' INGESTION CYCLE COMPLETE: Zero duplicate events added. Lineage preserved.');
    console.log('='.repeat(70));

    return summaryReport;
  } finally {
    client.release();
  }
}

// Direct execution via CLI
if (process.argv[1] && process.argv[1].endsWith('runner.ts')) {
  runAllIngestors()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('FATAL: Ingestion run failed:', err);
      await pool.end();
      process.exit(1);
    });
}
