import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../src/db/client.ts';
import { importOsmRoads } from '../src/lib/osm/importer.ts';
import { loadVerifiedBengaluruBoundary } from '../src/lib/osm/boundary.ts';

function parseArgs(argv) {
  const opts = {
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    dryRun: false,
    includeNonMotor: false,
    includeConstructionProposed: false,
    isCompleteExtract: true,
    sourceFilePath: undefined,
    boundaryFilePath: undefined,
    checkpointOffset: 0,
    limit: undefined,
    outputReport: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--include-non-motor') opts.includeNonMotor = true;
    else if (arg === '--include-construction') opts.includeConstructionProposed = true;
    else if (arg === '--partial') opts.isCompleteExtract = false;
    else if (arg === '--input' && argv[i + 1]) opts.sourceFilePath = path.resolve(argv[++i]);
    else if (arg === '--boundary' && argv[i + 1]) opts.boundaryFilePath = path.resolve(argv[++i]);
    else if (arg === '--district' && argv[i + 1]) opts.district = argv[++i];
    else if (arg === '--state' && argv[i + 1]) opts.state = argv[++i];
    else if (arg === '--chunk-size' && argv[i + 1]) opts.chunkSize = parseInt(argv[++i], 10) || undefined;
    else if (arg === '--resume-offset' && argv[i + 1]) opts.checkpointOffset = parseInt(argv[++i], 10) || 0;
    else if (arg === '--resume-run' && argv[i + 1]) opts.resumeRunId = argv[++i];
    else if (arg === '--limit' && argv[i + 1]) opts.limit = parseInt(argv[++i], 10) || undefined;
    else if (arg === '--output-report' && argv[i + 1]) opts.outputReport = path.resolve(argv[++i]);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const boundary =
    opts.district === 'Bengaluru Urban'
      ? loadVerifiedBengaluruBoundary(opts.boundaryFilePath)
      : undefined;

  console.log('='.repeat(78));
  console.log(
    ` THE ROAD PROBLEM: REPEATABLE OSM ROAD INDEXER ${opts.dryRun ? '[DRY RUN]' : '[LIVE IMPORT]'}`
  );
  console.log('='.repeat(78));
  if (boundary) {
    console.log(`  Coverage Scope:      ${boundary.boundary_name} (${boundary.boundary_type})`);
    console.log(`  OSM Relation ID:     ${boundary.osm_relation_id}`);
    console.log(`  Boundary Version:    ${boundary.boundary_version}`);
    console.log(`  Boundary SHA-256:    ${boundary.checksum_sha256}`);
    console.log(`  CRS / Area:          ${boundary.crs} • ${boundary.area_sq_km} km²`);
  }

  // CLI imports can run during database maintenance; keep the target and TLS
  // verification unchanged while allowing a bounded connection handshake.
  pool.options.connectionTimeoutMillis = 30000;
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout='120s'");
    await client.query("SET lock_timeout='10s'");
    const summary = await importOsmRoads(client, {
      district: opts.district,
      state: opts.state,
      sourceFilePath: opts.sourceFilePath,
      boundary,
      includeNonMotor: opts.includeNonMotor,
      includeConstructionProposed: opts.includeConstructionProposed,
      isCompleteExtract: opts.isCompleteExtract,
      dryRun: opts.dryRun,
      checkpointOffset: opts.checkpointOffset,
      resumeRunId: opts.resumeRunId,
      chunkSize: opts.chunkSize,
      limit: opts.limit,
    });

    console.log('\n[OSM Road Index Summary]');
    console.log(`  Run ID:                   ${summary.runId}`);
    console.log(`  Mode:                     ${summary.dry_run ? 'DRY RUN (No DB Writes)' : 'COMMITTED'}`);
    console.log(`  District:                 ${summary.district}`);
    console.log(`  Boundary Version:         ${summary.boundary_version}`);
    console.log(`  Parser Version:           ${summary.parser_version}`);
    console.log(`  Input SHA-256:            ${summary.source_checksum}`);
    console.log(`  Total Elements Evaluated: ${summary.total_elements}`);
    console.log(`  Eligible Ways Inside:     ${summary.valid_ways}`);
    console.log(`  New Segments Inserted:    ${summary.new_inserted}`);
    console.log(`  Updated Segment Versions: ${summary.updated_versions}`);
    console.log(`  Unchanged Ways Skipped:   ${summary.unchanged_skipped}`);
    console.log(`  Rejected Elements:        ${summary.rejected_count}`);
    console.log(`  Deactivated Segments:     ${summary.deactivated_count}`);
    console.log(`  Work Assocs to Review:    ${summary.review_routed_count}`);
    console.log(`  Renamed Roads Preserved:  ${summary.renamed_count}`);
    console.log(`  Boundary-Crossing Ways:   ${summary.boundary_crossing_ways}`);
    console.log(`  Length Inside Boundary:   ${(summary.within_boundary_length_m / 1000).toFixed(2)} km`);
    console.log(`  Motor-Road Length Inside: ${(summary.motor_road_length_m / 1000).toFixed(2)} km`);
    console.log(`  Rejection Breakdown:      ${JSON.stringify(summary.rejection_breakdown)}`);
    console.log(`  Category Breakdown:       ${JSON.stringify(summary.category_breakdown)}`);
    console.log(`  Access Breakdown:         ${JSON.stringify(summary.access_breakdown)}`);
    console.log(`  Storage Archive Key:      ${summary.storage_archived_key}`);

    if (opts.outputReport) {
      fs.mkdirSync(path.dirname(opts.outputReport), { recursive: true });
      fs.writeFileSync(opts.outputReport, JSON.stringify(summary, null, 2), 'utf8');
      console.log(`  Report Written To:        ${opts.outputReport}`);
    }

    if (summary.errors.length > 0) {
      console.warn(`  Encountered Errors:`, summary.errors);
    }

    console.log(
      `\n✓ ${opts.dryRun ? 'Dry-run analysis' : 'Ingestion cycle'} completed successfully.`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('FATAL: OSM Road Import failed:', err);
  process.exit(1);
});
