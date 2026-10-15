import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // 1. Road metadata — also supports durable resolution if `id` is a historical/active road_segment_id
    let resolvedRoadId = id;
    let resolvedFromSegmentId: string | null = null;
    let resolvedChildSegmentIds: string[] = [];

    let roadRes = await query(`
      SELECT r.*, ds.name as source_name, ds.license as source_license
      FROM roads r
      LEFT JOIN data_sources ds ON r.source_id = ds.id
      WHERE r.id = $1;
    `, [resolvedRoadId]);

    if (roadRes.rows.length === 0) {
      // Check if `id` is a road_segment_id (active or historical deactivated segment)
      const segLookup = await query(`
        SELECT rs.id, rs.road_id, rs.is_active,
               COALESCE((
                 SELECT array_agg(rsl.segment_id)
                 FROM road_segment_lineage rsl
                 WHERE rsl.parent_segment_id = rs.id
               ), '{}') AS child_segment_ids
        FROM road_segments rs
        WHERE rs.id = $1
        LIMIT 1;
      `, [id]);

      if (segLookup.rows.length > 0) {
        resolvedRoadId = segLookup.rows[0].road_id;
        resolvedFromSegmentId = segLookup.rows[0].id;
        resolvedChildSegmentIds = segLookup.rows[0].child_segment_ids || [];
        roadRes = await query(`
          SELECT r.*, ds.name as source_name, ds.license as source_license
          FROM roads r
          LEFT JOIN data_sources ds ON r.source_id = ds.id
          WHERE r.id = $1;
        `, [resolvedRoadId]);
      }
    }

    if (roadRes.rows.length === 0) {
      return NextResponse.json({ error: 'Road not found' }, { status: 404 });
    }
    const road = roadRes.rows[0];

    // 2. Road segments (active) + lineage history
    const segRes = await query(`
      SELECT rs.id, rs.osm_way_id, rs.osm_version, rs.chainage_from, rs.chainage_to,
             rs.length_m, COALESCE(rs.within_boundary_length_m, rs.length_m) as within_boundary_length_m,
             COALESCE(rs.crosses_boundary, FALSE) as crosses_boundary,
             COALESCE(rs.access, 'unknown') as access,
             COALESCE(rs.access_status, 'unknown') as access_status,
             COALESCE(rs.usage_category, 'public_motor') as usage_category,
             rs.layer, rs.bridge, rs.tunnel, rs.service, rs.is_service,
             rs.version, rs.is_active,
             ST_AsGeoJSON(rs.geom) as geom_geojson
      FROM road_segments rs
      WHERE rs.road_id = $1 AND rs.is_active = TRUE
      ORDER BY rs.chainage_from ASC NULLS LAST, rs.id ASC;
    `, [resolvedRoadId]);

    const lineageRes = await query(`
      SELECT rsl.id, rsl.segment_id, rsl.parent_segment_id, rsl.transition_type,
             rsl.reason, rsl.source_version, rsl.created_at
      FROM road_segment_lineage rsl
      JOIN road_segments rs ON rs.id = rsl.segment_id
      WHERE rs.road_id = $1
      ORDER BY rsl.created_at DESC
      LIMIT 50;
    `, [resolvedRoadId]);

    // 3. Active incidents (including incidents attached to historical parent segments of this road)
    const incRes = await query(`
      SELECT 
        i.id, i.road_segment_id, i.category, i.lifecycle_status, i.verification_state,
        i.first_observed_at, i.last_observed_at, i.predecessor_incident_id,
        ST_X(i.centroid) as lon, ST_Y(i.centroid) as lat,
        COUNT(DISTINCT r.id) as reports_count,
        COUNT(DISTINCT c.id) as corroborations_count
      FROM incidents i
      JOIN road_segments rs ON i.road_segment_id = rs.id
      LEFT JOIN reports r ON r.incident_id = i.id
      LEFT JOIN corroborations c ON c.incident_id = i.id
      WHERE rs.road_id = $1 AND i.lifecycle_status = 'active'
      GROUP BY i.id
      ORDER BY i.last_observed_at DESC;
    `, [resolvedRoadId]);

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
      LEFT JOIN work_contractors wc ON w.id = wc.work_id
      LEFT JOIN contractors c ON wc.contractor_id = c.id
      LEFT JOIN source_records sr ON w.source_record_id = sr.id
      LEFT JOIN data_sources ds ON sr.source_id = ds.id
      WHERE rs.road_id = $1
      GROUP BY w.id, c.legal_name, c.cin, c.gstin, wc.role, wc.confidence, sr.source_uri, sr.checksum_sha256, sr.retrieved_at, ds.publisher, ds.license;
    `, [resolvedRoadId]);

    // 5. Timeline events (including road rename events and segment/incident events)
    const eventsRes = await query(`
      SELECT e.id, e.entity_type, e.entity_id, e.event_type, e.effective_at, e.reason,
             e.old_state, e.new_state
      FROM events e
      WHERE e.entity_id = $1
         OR e.entity_id IN (
           SELECT rs.id FROM road_segments rs WHERE rs.road_id = $1
           UNION
           SELECT i.id FROM incidents i JOIN road_segments rs ON i.road_segment_id = rs.id WHERE rs.road_id = $1
         )
      ORDER BY e.effective_at DESC
      LIMIT 25;
    `, [resolvedRoadId]);

    const hasCompletedWork = worksRes.rows.some((w: any) => w.official_status === 'officially_completed' || w.official_status === 'maintenance');
    const hasActiveDamage = incRes.rows.some((i: any) => ['pothole', 'dug_open', 'damaged_surface'].includes(i.category));
    const isCoexistenceCase = hasCompletedWork && hasActiveDamage;

    return NextResponse.json({
      road,
      resolved_from_segment_id: resolvedFromSegmentId,
      resolved_child_segment_ids: resolvedChildSegmentIds,
      segments: segRes.rows,
      segment_lineage: lineageRes.rows,
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
