import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const district = searchParams.get('district');
  const state = searchParams.get('state');

  try {
    let sql = `
      SELECT 
        r.id, r.name, r.ref, r.road_class, r.authority_name, r.state, r.district,
        count(DISTINCT rs.id) as segments_count,
        count(DISTINCT i.id) as active_incidents_count,
        COALESCE(SUM(rs.length_m), 0) as total_length_m
      FROM roads r
      LEFT JOIN road_segments rs ON r.id = rs.road_id AND rs.is_active = TRUE
      LEFT JOIN incidents i ON i.road_segment_id = rs.id AND i.lifecycle_status = 'active'
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (r.name ILIKE $${params.length} OR r.ref ILIKE $${params.length})`;
    }
    if (district) {
      params.push(district);
      sql += ` AND r.district = $${params.length}`;
    }
    if (state) {
      params.push(state);
      sql += ` AND r.state = $${params.length}`;
    }

    sql += ` GROUP BY r.id ORDER BY active_incidents_count DESC, r.name ASC LIMIT 50;`;

    const res = await query(sql, params);
    return NextResponse.json({
      roads: res.rows,
      coverage: {
        layer: 'canonical_road_index',
        scope: 'pilot_districts_karnataka',
        is_nationwide_indexed: false,
        notice: 'Road snapping active in Karnataka pilot areas. Unmatched point fallback available outside.'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
