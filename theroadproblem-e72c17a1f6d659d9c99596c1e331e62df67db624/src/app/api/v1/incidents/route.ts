import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bbox = searchParams.get('bbox'); // minLon,minLat,maxLon,maxLat
  const category = searchParams.get('category');
  const status = searchParams.get('status') || 'active';

  try {
    let sql = `
      SELECT 
        i.id, i.road_segment_id, i.category, i.lifecycle_status, i.verification_state,
        i.first_observed_at, i.last_observed_at, i.predecessor_incident_id,
        ST_X(i.centroid) as lon, ST_Y(i.centroid) as lat,
        r.name as road_name, r.ref as road_ref,
        count(rep.id) as reports_count
      FROM incidents i
      LEFT JOIN road_segments rs ON i.road_segment_id = rs.id
      LEFT JOIN roads r ON rs.road_id = r.id
      LEFT JOIN reports rep ON rep.incident_id = i.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status !== 'all') {
      params.push(status);
      sql += ` AND i.lifecycle_status = $${params.length}`;
    }

    if (category && category !== 'all') {
      params.push(category);
      sql += ` AND i.category = $${params.length}`;
    }

    if (bbox) {
      const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
      if (![minLon, minLat, maxLon, maxLat].some(isNaN)) {
        params.push(minLon, minLat, maxLon, maxLat);
        sql += ` AND i.centroid && ST_MakeEnvelope($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length}, 4326)`;
      }
    }

    sql += ` GROUP BY i.id, r.name, r.ref ORDER BY i.last_observed_at DESC LIMIT 100;`;

    const res = await query(sql, params);
    return NextResponse.json({
      incidents: res.rows,
      count: res.rows.length,
      bounded_query: !!bbox,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
