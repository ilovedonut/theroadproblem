import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const district = searchParams.get('district');
  const state = searchParams.get('state');
  const includeNonMotor = searchParams.get('include_non_motor') === 'true';

  try {
    let sql = `
      SELECT 
        r.id,
        r.name,
        COALESCE(r.display_name, r.name) AS display_name,
        COALESCE(r.has_official_name, NOT (r.name LIKE 'Unnamed%')) AS has_official_name,
        COALESCE(r.aliases, '{}') AS aliases,
        r.ref,
        r.road_class,
        COALESCE(r.usage_category, 'public_motor') AS usage_category,
        COALESCE(r.access_status, 'unknown') AS access_status,
        r.authority_name,
        r.state,
        r.district,
        COALESCE(seg_stats.segments_count, 0) AS segments_count,
        COALESCE(seg_stats.unique_ways_count, 0) AS unique_ways_count,
        COALESCE(inc_stats.active_incidents_count, 0) AS active_incidents_count,
        COALESCE(seg_stats.total_length_m, 0) AS total_length_m
      FROM roads r
      LEFT JOIN LATERAL (
        SELECT
          COUNT(rs.id) AS segments_count,
          COUNT(DISTINCT rs.osm_way_id) AS unique_ways_count,
          COALESCE(SUM(COALESCE(rs.within_boundary_length_m, rs.length_m)), 0) AS total_length_m
        FROM road_segments rs
        WHERE rs.road_id = r.id AND rs.is_active = TRUE
      ) seg_stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT i.id) AS active_incidents_count
        FROM road_segments rs2
        JOIN incidents i ON i.road_segment_id = rs2.id
        WHERE rs2.road_id = r.id
          AND rs2.is_active = TRUE
          AND i.lifecycle_status = 'active'
      ) inc_stats ON TRUE
      WHERE 1=1
    `;
    const params: any[] = [];

    if (!includeNonMotor) {
      sql += ` AND COALESCE(r.usage_category, 'public_motor') IN ('public_motor', 'restricted_motor')`;
    }
    if (search) {
      params.push(`%${search}%`);
      const pIdx = params.length;
      sql += ` AND (
        r.name ILIKE $${pIdx}
        OR r.ref ILIKE $${pIdx}
        OR EXISTS (SELECT 1 FROM unnest(COALESCE(r.aliases, '{}')) AS a WHERE a ILIKE $${pIdx})
      )`;
    }
    if (district) {
      params.push(district);
      sql += ` AND r.district = $${params.length}`;
    }
    if (state) {
      params.push(state);
      sql += ` AND r.state = $${params.length}`;
    }

    sql += ` ORDER BY active_incidents_count DESC, r.name ASC LIMIT 50;`;

    const res = await query(sql, params);
    return NextResponse.json({
      roads: res.rows,
      coverage: {
        layer: 'canonical_road_index',
        scope: 'bengaluru_urban_administrative_district',
        boundary_name: 'Bengaluru Urban',
        boundary_type: 'administrative_district',
        osm_relation_id: 2020589,
        crs: 'EPSG:4326',
        is_nationwide_indexed: false,
        notice: 'Indexed motor-road coverage active within the verified Bengaluru Urban administrative district boundary (OSM Relation 2020589). Unmatched point reporting available everywhere.'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
