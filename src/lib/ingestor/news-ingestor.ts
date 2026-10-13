import crypto from 'node:crypto';
import pg from 'pg';
import type { ParsedCivicSignal, IngestRunSummary } from './types.ts';
import { putStorageObject } from '../storage.ts';

/**
 * Curated news articles and civic signals linked to monitored Bangalore road corridors.
 * In production, fetched from RSS feeds (Deccan Herald, The Hindu) and civic social desks.
 */
export const CIVIC_SIGNALS_SEED: ParsedCivicSignal[] = [
  {
    source_name: "Deccan Herald Civic Beat",
    external_key: "DH-CIVIC-2026-0312",
    source_uri: "https://deccanherald.com/city/top-bengaluru-stories/orr-resurfaced-stretch-dug-up-bwssb",
    title: "BWSSB Pipeline Excavation Cuts Through Newly Laid Lane on Outer Ring Road",
    details: "Cauvery Stage V pipeline connection trench dug across newly surfaced carriage lane near Bellandur junction. Commuters face severe delays.",
    signal_type: "news_media",
    road_name: "Outer Ring Road (ORR / NH-44)",
    lat: 12.9348,
    lon: 77.6712,
    published_at: "2026-03-12T08:30:00Z",
    verified: false,
    status: "publisher_reported",
    disclaimer: "Publisher reported article. Does not certify ground truth condition without physical audit."
  },
  {
    source_name: "Reddit r/bangalore Civic Watch",
    external_key: "REDDIT-BLR-ORR-2026-0418",
    source_uri: "https://reddit.com/r/bangalore/comments/orr_excavation_audit",
    title: "ORR near Ecospace has been dug up for the 3rd time in 6 months despite ₹48 Cr tender",
    details: "Megathread documenting recurrent trenching between Silk Board and Iblur. Multiple dashcam clips confirm exposed rebar and unbarricaded pits.",
    signal_type: "reddit_community",
    road_name: "Outer Ring Road (ORR / NH-44)",
    lat: 12.9262,
    lon: 77.6845,
    published_at: "2026-04-18T14:15:00Z",
    verified: false,
    status: "publisher_reported",
    disclaimer: "Community forum discussion thread. Uncorroborated social commentary."
  },
  {
    source_name: "Twitter / X @BLRTrafficWatch",
    external_key: "TW-BLR-HOSUR-2026-0502",
    source_uri: "https://x.com/BLRTrafficWatch/status/17892301923",
    title: "Unbarricaded excavation pit causing bottleneck on Hosur Road Surface Service Lane",
    details: "Visual evidence tagged to @BBMPCOMM. Surface lane reduced to single file near Bommanahalli junction.",
    signal_type: "twitter_signal",
    road_name: "Hosur Road (Surface Service Carriageway)",
    lat: 12.8870,
    lon: 77.6430,
    published_at: "2026-05-02T09:40:00Z",
    verified: false,
    status: "publisher_reported",
    disclaimer: "Social post report. Denotes public claim, not verified engineering ground condition."
  },
  {
    source_name: "The Hindu Bengaluru",
    external_key: "TH-BLR-MG-2026-0220",
    source_uri: "https://thehindu.com/news/cities/bangalore/mg-road-corridor-audit",
    title: "BBMP initiates ₹12 Cr Smart City white-topping audit on MG Road",
    details: "Inspections reveal utility duct covers intact along Anil Kumble Circle stretch. Pavement condition index rated satisfactory.",
    signal_type: "news_media",
    road_name: "Mahatma Gandhi Road (MG Road)",
    lat: 12.9748,
    lon: 77.6074,
    published_at: "2026-02-20T11:00:00Z",
    verified: false,
    status: "publisher_reported",
    disclaimer: "Journalistic report on municipal audit."
  },
  {
    source_name: "Prajavani Ramanagara District Beat",
    external_key: "PV-RAM-KANAK-2026-0514",
    source_uri: "https://prajavani.net/district/ramanagara/kanakapura-rural-road-monsoon-drainage",
    title: "Pre-Monsoon Culvert Clearance Underway on Kanakapura-Sangama Rural Road",
    details: "KRRDA engineers inspect 18.5 km stretch following community representations on agricultural runoff. Pavement reported in warranty period.",
    signal_type: "news_media",
    road_name: "Ramanagara Kanakapura Rural Road (MDR-104)",
    lat: 12.5450,
    lon: 77.4210,
    published_at: "2026-05-14T07:15:00Z",
    verified: false,
    status: "publisher_reported",
    disclaimer: "Regional press report. Does not certify structural engineering rating."
  },
  {
    source_name: "Citizen Traffic Forum Bengaluru",
    external_key: "CITIZEN-HOSUR-SURF-2026-0601",
    source_uri: "https://x.com/BLRTrafficWatch/status/1792019941",
    title: "Fresh Utility Digging Barricade Noticed on Hosur Road Service Lane near Singasandra",
    details: "Telecom duct excavation ongoing along western service carriageway. Cautionary reflector drums placed by contractor.",
    signal_type: "twitter_signal",
    road_name: "Hosur Road (Surface Service Carriageway)",
    lat: 12.8790,
    lon: 77.6480,
    published_at: "2026-06-01T16:20:00Z",
    verified: false,
    status: "publisher_reported",
    disclaimer: "Citizen social feed observation. Unaudited public submission."
  }
];

export async function runNewsIngestion(
  client: pg.PoolClient,
  signals: ParsedCivicSignal[] = CIVIC_SIGNALS_SEED
): Promise<IngestRunSummary> {
  const startedAt = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let r2Count = 0;
  const errors: string[] = [];

  for (const s of signals) {
    try {
      const rawJsonStr = JSON.stringify(s);
      const checksum = crypto.createHash('sha256').update(rawJsonStr).digest('hex');

      // 1. Archive raw news/signal article to Cloudflare R2
      const r2Key = `raw_sources/news/${s.external_key}_${checksum.slice(0, 8)}.json`;
      try {
        await putStorageObject(r2Key, Buffer.from(rawJsonStr, 'utf8'), 'application/json');
        r2Count++;
      } catch (r2Err: any) {
        console.warn(`[R2 Archival Non-fatal] ${r2Err.message}`);
      }

      // 2. Data source registration
      const dsRes = await client.query(
        `SELECT id FROM data_sources WHERE name = $1 LIMIT 1;`,
        [s.source_name]
      );
      let sourceId = dsRes.rows[0]?.id;
      if (!sourceId) {
        const newDs = await client.query(`
          INSERT INTO data_sources (name, publisher, base_uri, license, retrieval_method, update_frequency, terms_reviewed_at)
          VALUES ($1, $1, $2, 'Public Fair Use / Civic Reporting', 'rss_feed', 'daily', NOW())
          RETURNING id;
        `, [s.source_name, s.source_uri]);
        sourceId = newDs.rows[0].id;
      }

      // 3. Deduplication check via SHA-256
      const existingRec = await client.query(`
        SELECT id FROM source_records 
        WHERE source_id = $1 AND external_key = $2 AND checksum_sha256 = $3
        LIMIT 1;
      `, [sourceId, s.external_key, checksum]);

      if (existingRec.rows.length > 0) {
        skipped++;
        continue;
      }

      // 4. Record immutable source record
      await client.query(`
        INSERT INTO source_records (
          source_id, external_key, source_uri, raw_content, checksum_sha256, parse_version, retrieved_at
        ) VALUES ($1, $2, $3, $4::jsonb, $5, 'v1.1.0-news', NOW())
        RETURNING id;
      `, [sourceId, s.external_key, s.source_uri, rawJsonStr, checksum]);

      inserted++;
    } catch (err: any) {
      errors.push(`Signal ${s.external_key}: ${err.message}`);
    }
  }

  return {
    job: 'news_ingestor',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    total_discovered: signals.length,
    new_inserted: inserted,
    updated: updated,
    unchanged_skipped: skipped,
    r2_archived: r2Count,
    errors,
  };
}
