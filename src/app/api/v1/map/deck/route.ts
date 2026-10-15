import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const dbInfo = await query('SELECT inet_server_addr(), current_database(), current_user');
    console.log('Deck DB Info:', dbInfo.rows[0]);
    // 1. Fetch roads with segments GeoJSON, associated official works, and active ground incidents
    const roadsQuery = `
      SELECT 
        r.id,
        r.name,
        r.ref,
        r.road_class,
        r.authority_name,
        r.state,
        r.district,
        COALESCE(SUM(rs.length_m), 0) as total_length_m,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'segment_id', rs.id,
          'chainage_from', rs.chainage_from,
          'chainage_to', rs.chainage_to,
          'length_m', rs.length_m,
          'geojson', ST_AsGeoJSON(rs.geom)::json
        )) FILTER (WHERE rs.id IS NOT NULL), '[]'::json) as segments,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'work_id', w.id,
          'package_name', w.package_name,
          'authority_name', w.authority_name,
          'tender_id', w.tender_id,
          'contract_id', w.contract_id,
          'official_status', w.official_status,
          'contract_value_inr', w.contract_value_inr,
          'contractor_name', c.legal_name,
          'cin', c.cin,
          'gstin', c.gstin,
          'start_date', w.start_date,
          'target_completion_date', w.target_completion_date,
          'actual_completion_date', w.actual_completion_date,
          'defect_liability_end_date', w.defect_liability_end_date
        )) FILTER (WHERE w.id IS NOT NULL), '[]'::json) as works,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'incident_id', i.id,
          'category', i.category,
          'lifecycle_status', i.lifecycle_status,
          'verification_state', i.verification_state,
          'last_observed_at', i.last_observed_at,
          'lat', ST_Y(i.centroid),
          'lon', ST_X(i.centroid)
        )) FILTER (WHERE i.id IS NOT NULL), '[]'::json) as incidents
      FROM roads r
      LEFT JOIN road_segments rs ON r.id = rs.road_id AND rs.is_active = TRUE
      LEFT JOIN work_segments ws ON rs.id = ws.road_segment_id
      LEFT JOIN works w ON ws.work_id = w.id
      LEFT JOIN work_contractors wc ON w.id = wc.work_id
      LEFT JOIN contractors c ON wc.contractor_id = c.id
      LEFT JOIN incidents i ON rs.id = i.road_segment_id AND i.lifecycle_status = 'active'
      WHERE r.name NOT LIKE 'Test %'
      GROUP BY r.id
      ORDER BY r.name ASC;
    `;

    const roadsRes = await query(roadsQuery);

    // 2. Query live intelligence stream from database source_records
    const sourceRecordsRes = await query(`
      SELECT 
        sr.id,
        sr.external_key,
        sr.source_uri,
        sr.raw_content,
        sr.retrieved_at,
        ds.name as source_name,
        ds.publisher
      FROM source_records sr
      JOIN data_sources ds ON sr.source_id = ds.id
      WHERE sr.raw_content ? 'lat' AND sr.raw_content ? 'lon'
      ORDER BY sr.retrieved_at DESC
      LIMIT 50;
    `);

    let multiSourceSignals: any[] = [];

    if (sourceRecordsRes.rows.length > 0) {
      multiSourceSignals = sourceRecordsRes.rows.map((row: any) => {
        const raw = row.raw_content || {};
        const dateVal = raw.published_at || raw.start_date || row.retrieved_at;
        const dateStr = dateVal instanceof Date 
          ? dateVal.toISOString().substring(0, 10) 
          : typeof dateVal === 'string' 
            ? dateVal.substring(0, 10) 
            : '';
        const isOfficial = !raw.signal_type || raw.signal_type === 'official_portal';
        return {
          id: row.id,
          type: raw.signal_type || 'official_portal',
          source: row.source_name || 'Public Data Registry',
          title: raw.title || raw.package_name || `Source Record: ${row.external_key}`,
          date: dateStr,
          road_name: raw.road_name || raw.road_name_hint || 'Monitored Corridor',
          lat: Number(raw.lat),
          lon: Number(raw.lon),
          details: raw.details || (raw.work_type ? `${raw.work_type} (Status: ${raw.official_status || 'recorded'})` : `Tender/Source Record ${row.external_key}`),
          verified: false, // Invariant: news/social/external imports never assert verified ground condition
          status: isOfficial ? 'official_procurement_record' : 'publisher_reported',
          source_url: row.source_uri,
          disclaimer: isOfficial
            ? 'Administrative procurement entry. Denotes official budget/contract allocation, not verified physical road condition.'
            : 'Publisher/social reported claim. Does not certify ground truth condition without physical audit.',
          is_demo: false
        };
      });
    }

    // Compute summary metrics for the telemetry deck
    const totalRoads = roadsRes.rows.length;
    let totalLengthKm = 0;
    let totalSpendInr = 0;
    let activeWorksCount = 0;

    for (const r of roadsRes.rows) {
      totalLengthKm += parseFloat(r.total_length_m || '0') / 1000;
      if (Array.isArray(r.works)) {
        for (const w of r.works) {
          if (w.work_id) {
            activeWorksCount++;
            if (w.contract_value_inr) {
              totalSpendInr += parseFloat(w.contract_value_inr);
            }
          }
        }
      }
    }

    const totalSpendCr = (totalSpendInr / 10000000).toFixed(2);

    return NextResponse.json({
      summary: {
        total_roads_indexed: totalRoads,
        total_length_km: totalLengthKm.toFixed(1),
        total_spend_tracked_cr: totalSpendCr,
        active_works_count: activeWorksCount,
        multi_source_signals_count: multiSourceSignals.length,
        timestamp: new Date().toISOString()
      },
      roads: roadsRes.rows,
      signals: multiSourceSignals
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (err: any) {
    console.error('Error in deck route:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
