import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lon = parseFloat(searchParams.get('lon') || '');
  const lat = parseFloat(searchParams.get('lat') || '');
  const radius = parseFloat(searchParams.get('radius') || '100');

  if (isNaN(lon) || isNaN(lat)) {
    return NextResponse.json({ error: 'Valid lon and lat coordinates are required' }, { status: 400 });
  }

  try {
    const res = await query(`
      SELECT 
        rs.id as segment_id,
        rs.road_id,
        r.name as road_name,
        r.ref as road_ref,
        r.road_class,
        r.authority_name,
        rs.district,
        ROUND(ST_Distance(rs.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)::numeric, 2) as distance_m,
        ST_AsGeoJSON(rs.geom) as geom_geojson
      FROM road_segments rs
      JOIN roads r ON r.id = rs.road_id
      WHERE rs.is_active = TRUE
        AND ST_DWithin(rs.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
      ORDER BY distance_m ASC
      LIMIT 5;
    `, [lon, lat, radius]);

    return NextResponse.json({
      candidates: res.rows,
      has_match: res.rows.length > 0,
      query_point: { lon, lat },
      search_radius_m: radius,
      fallback_available: true,
      message: res.rows.length === 0 ? 'No canonical road found within radius. Unmatched point reporting available.' : 'Candidates ranked by metre distance.'
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
