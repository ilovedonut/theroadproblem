import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // 1. Incident details
    const incRes = await query(`
      SELECT 
        i.*,
        ST_X(i.centroid) as lon, ST_Y(i.centroid) as lat,
        r.id as road_id, r.name as road_name, r.ref as road_ref, r.authority_name,
        rs.district, rs.state
      FROM incidents i
      LEFT JOIN road_segments rs ON i.road_segment_id = rs.id
      LEFT JOIN roads r ON rs.road_id = r.id
      WHERE i.id = $1;
    `, [id]);

    if (incRes.rows.length === 0) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }
    const incident = incRes.rows[0];

    // 2. Observations / Reports (only published reports to general public)
    const repRes = await query(`
      SELECT 
        rep.id, rep.category, rep.observed_status, rep.description, rep.observed_at,
        rep.created_at, rep.snap_distance_m,
        u.display_name as reporter_name, u.is_anonymous_public,
        COALESCE(
          json_agg(
            json_build_object(
              'id', rm.id,
              'derivative_key', rm.storage_key_derivative,
              'mime_type', rm.mime_type,
              'review_status', rm.review_status
            )
          ) FILTER (WHERE rm.id IS NOT NULL AND rm.review_status = 'approved'), '[]'
        ) as approved_media
      FROM reports rep
      JOIN users u ON rep.reporter_id = u.id
      LEFT JOIN report_media rm ON rm.report_id = rep.id
      WHERE rep.incident_id = $1 AND rep.publication_status = 'published'
      GROUP BY rep.id, u.display_name, u.is_anonymous_public
      ORDER BY rep.observed_at DESC;
    `, [id]);

    // 3. Corroborations
    const corrobRes = await query(`
      SELECT 
        c.id, c.observation_time, c.verdict, c.comment, c.created_at,
        u.display_name as actor_name
      FROM corroborations c
      JOIN users u ON c.actor_id = u.id
      WHERE c.incident_id = $1
      ORDER BY c.observation_time DESC;
    `, [id]);

    // 4. Predecessor incident details if recurrent
    let predecessor = null;
    if (incident.predecessor_incident_id) {
      const predRes = await query(`
        SELECT id, category, lifecycle_status, first_observed_at, resolved_at
        FROM incidents WHERE id = $1;
      `, [incident.predecessor_incident_id]);
      if (predRes.rows.length > 0) {
        predecessor = predRes.rows[0];
      }
    }

    return NextResponse.json({
      incident,
      reports: repRes.rows,
      corroborations: corrobRes.rows,
      predecessor,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
