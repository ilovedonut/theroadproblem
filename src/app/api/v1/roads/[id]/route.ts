import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // 1. Road metadata
    const roadRes = await query(`
      SELECT r.*, ds.name as source_name, ds.license as source_license
      FROM roads r
      LEFT JOIN data_sources ds ON r.source_id = ds.id
      WHERE r.id = $1;
    `, [id]);

    if (roadRes.rows.length === 0) {
      return NextResponse.json({ error: 'Road not found' }, { status: 404 });
    }
    const road = roadRes.rows[0];

    // 2. Road segments
    const segRes = await query(`
      SELECT rs.id, rs.chainage_from, rs.chainage_to, rs.length_m, rs.version, rs.is_active,
             ST_AsGeoJSON(rs.geom) as geom_geojson
      FROM road_segments rs
      WHERE rs.road_id = $1 AND rs.is_active = TRUE
      ORDER BY rs.chainage_from ASC;
    `, [id]);

    // 3. Active incidents
    const incRes = await query(`
      SELECT 
        i.id, i.category, i.lifecycle_status, i.verification_state,
        i.first_observed_at, i.last_observed_at, i.predecessor_incident_id,
        ST_X(i.centroid) as lon, ST_Y(i.centroid) as lat,
        count(r.id) as reports_count,
        count(c.id) as corroborations_count
      FROM incidents i
      JOIN road_segments rs ON i.road_segment_id = rs.id
      LEFT JOIN reports r ON r.incident_id = i.id
      LEFT JOIN corroborations c ON c.incident_id = i.id
      WHERE rs.road_id = $1 AND i.lifecycle_status = 'active'
      GROUP BY i.id
      ORDER BY i.last_observed_at DESC;
    `, [id]);

    // 4. Official public works & linked contractors
    const worksRes = await query(`
      SELECT 
        w.id as work_id, w.package_name, w.authority_name, w.tender_id, w.contract_id,
        w.work_type, w.official_status, w.start_date, w.target_completion_date,
        w.actual_completion_date, w.contract_value_inr, w.defect_liability_end_date,
        c.legal_name as contractor_name, c.cin, c.gstin, wc.role as contractor_role,
        wc.confidence as match_confidence,
        sr.source_uri, sr.checksum_sha256, sr.retrieved_at as source_retrieved_at,
        ds.publisher, ds.license
      FROM works w
      JOIN work_segments ws ON w.id = ws.work_id
      JOIN road_segments rs ON ws.road_segment_id = rs.id
      JOIN work_contractors wc ON w.id = wc.work_id
      JOIN contractors c ON wc.contractor_id = c.id
      JOIN source_records sr ON w.source_record_id = sr.id
      JOIN data_sources ds ON sr.source_id = ds.id
      WHERE rs.road_id = $1
      GROUP BY w.id, c.legal_name, c.cin, c.gstin, wc.role, wc.confidence, sr.source_uri, sr.checksum_sha256, sr.retrieved_at, ds.publisher, ds.license;
    `, [id]);

    // 5. Timeline events
    const eventsRes = await query(`
      SELECT e.id, e.entity_type, e.entity_id, e.event_type, e.effective_at, e.reason,
             e.old_state, e.new_state
      FROM events e
      WHERE e.entity_id IN (
        SELECT rs.id FROM road_segments rs WHERE rs.road_id = $1
        UNION
        SELECT i.id FROM incidents i JOIN road_segments rs ON i.road_segment_id = rs.id WHERE rs.road_id = $1
      )
      ORDER BY e.effective_at DESC
      LIMIT 25;
    `, [id]);

    // Check coexistence flag: has completed work but also active community damage
    const hasCompletedWork = worksRes.rows.some((w: any) => w.official_status === 'officially_completed' || w.official_status === 'maintenance');
    const hasActiveDamage = incRes.rows.some((i: any) => ['pothole', 'dug_open', 'damaged_surface'].includes(i.category));
    const isCoexistenceCase = hasCompletedWork && hasActiveDamage;

    return NextResponse.json({
      road,
      segments: segRes.rows,
      active_incidents: incRes.rows,
      official_works: worksRes.rows,
      timeline: eventsRes.rows,
      coexistence_alert: isCoexistenceCase ? {
        alert: true,
        message: 'Official work marked completed, but subsequent community observations report carriageway damage.',
        official_completed_works: worksRes.rows.filter((w: any) => w.official_status === 'officially_completed'),
        active_incidents: incRes.rows
      } : { alert: false }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
