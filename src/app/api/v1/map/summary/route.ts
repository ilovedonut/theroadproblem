import { NextRequest, NextResponse } from 'next/server.js';
import { withTransaction } from '../../../../../db/client.ts';
import { parseMapBounds } from '../../../../../lib/map-bounds.ts';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl ? req.nextUrl.searchParams : new URL(req.url).searchParams;
  const bounds = parseMapBounds(searchParams.get("bbox"));
  if (!bounds) return NextResponse.json({ error: "Choose a valid map area." }, { status: 400 });
  try {
    const result = await withTransaction(async client => {
      await client.query("SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = '20000'; SET LOCAL lock_timeout = '2000'");
      return client.query(`
      WITH area AS (
        SELECT CASE WHEN $1::float8 < $3::float8
          THEN ST_MakeEnvelope($1,$2,$3,$4,4326)
          ELSE ST_Union(ST_MakeEnvelope($1,$2,180,$4,4326), ST_MakeEnvelope(-180,$2,$3,$4,4326)) END AS geom
      ), all_visible_segments AS MATERIALIZED (
        SELECT rs.id, rs.road_id, rs.osm_way_id,
          COALESCE(rs.usage_category, 'public_motor') AS usage_category,
          -- The area is a rectangle unless it crosses the antimeridian. Roads
          -- whose boxes fit inside it need no geometry intersection at all.
          ST_Length((CASE WHEN $1::float8 < $3::float8 AND rs.geom @ a.geom
            THEN rs.geom
            ELSE ST_CollectionExtract(ST_Intersection(rs.geom,a.geom),2)
          END)::geography) AS visible_length
        FROM road_segments rs CROSS JOIN area a
        WHERE rs.is_active AND ST_Intersects(rs.geom,a.geom)
      ), segments AS MATERIALIZED (
        SELECT * FROM all_visible_segments
        WHERE usage_category IN ('public_motor', 'restricted_motor')
      ), associations AS (
        SELECT DISTINCT ws.work_id,ws.road_segment_id FROM work_segments ws
        WHERE COALESCE(to_jsonb(ws)->>'review_status','approved')='approved'
      ), visible_works AS (
        SELECT a.work_id,SUM(s.visible_length) AS visible_length
        FROM associations a JOIN segments s ON s.id=a.road_segment_id
        GROUP BY a.work_id HAVING SUM(s.visible_length)>0
      ), work_lengths AS (
        SELECT a.work_id,SUM(ST_Length(rs.geom::geography)) AS total_length
        FROM associations a JOIN road_segments rs ON rs.id=a.road_segment_id AND rs.is_active
        WHERE a.work_id IN (SELECT work_id FROM visible_works) GROUP BY a.work_id
      ), budgets AS (
        SELECT w.id,w.authority_name,w.contract_value_inr,
          LEAST(1.0,v.visible_length/NULLIF(l.total_length,0))*w.contract_value_inr AS estimated_share
        FROM visible_works v JOIN works w ON w.id=v.work_id JOIN work_lengths l ON l.work_id=w.id
      ), public_issues AS (
        SELECT i.* FROM incidents i CROSS JOIN area a
        WHERE i.merged_into_incident_id IS NULL AND ST_Intersects(i.centroid,a.geom)
          AND EXISTS (SELECT 1 FROM reports r WHERE r.incident_id=i.id AND r.publication_status='published')
      ), responsible_roads AS MATERIALIZED (
        SELECT id,authority_name FROM roads
        WHERE authority_name IS NOT NULL AND authority_name <> 'Local Public Authority'
      ), authorities AS (
        SELECT DISTINCT r.authority_name AS name FROM responsible_roads r JOIN segments s ON s.road_id=r.id
        UNION SELECT authority_name FROM budgets
      ), boundary_overlap AS (
        SELECT db.district, db.osm_relation_id,
          COALESCE(db.boundary_type, 'administrative_district') AS boundary_type,
          COALESCE(db.boundary_version, 'osm-rel-2020589-v1') AS boundary_version,
          ST_Intersects(db.boundary_geom, a.geom) AS intersects_boundary
        FROM district_boundaries db CROSS JOIN area a
        WHERE db.district = 'Bengaluru Urban'
        LIMIT 1
      ), latest_import AS (
        SELECT id, completed_at, checksum_sha256, ways_count, coverage_status,
               COALESCE(boundary_version, 'osm-rel-2020589-v1') AS boundary_version
        FROM osm_imports
        WHERE district = 'Bengaluru Urban' AND status = 'completed'
        ORDER BY completed_at DESC NULLS LAST, started_at DESC
        LIMIT 1
      )
      SELECT
        (SELECT COUNT(DISTINCT road_id) FROM segments) AS roads,
        (SELECT COUNT(DISTINCT id) FROM segments) AS active_physical_segments,
        (SELECT COUNT(DISTINCT osm_way_id) FROM segments WHERE osm_way_id IS NOT NULL) AS unique_source_ways,
        (SELECT COUNT(DISTINCT id) FROM all_visible_segments WHERE usage_category = 'non_motor') AS non_motor_segments,
        (SELECT COALESCE(SUM(visible_length),0)/1000 FROM segments) AS road_km,
        (SELECT COALESCE(SUM(visible_length),0)/1000 FROM segments) AS motor_road_km,
        (SELECT COUNT(*) FROM budgets) AS projects,
        (SELECT COUNT(*) FROM budgets WHERE contract_value_inr IS NOT NULL) AS priced_projects,
        (SELECT SUM(contract_value_inr) FROM budgets) AS linked_budget_inr,
        (SELECT SUM(estimated_share) FROM budgets) AS estimated_area_budget_inr,
        (SELECT COUNT(DISTINCT wc.contractor_id) FROM work_contractors wc JOIN budgets b ON b.id=wc.work_id) AS contractors,
        (SELECT COALESCE(json_agg(name ORDER BY name),'[]'::json) FROM authorities WHERE name IS NOT NULL AND trim(name)<>'') AS authorities,
        (SELECT COUNT(*) FROM public_issues WHERE lifecycle_status<>'resolved') AS open_issues,
        (SELECT COUNT(DISTINCT rs.road_id) FROM public_issues i JOIN road_segments rs ON rs.id=i.road_segment_id WHERE i.lifecycle_status<>'resolved') AS affected_roads,
        (SELECT COUNT(*) FROM public_issues WHERE lifecycle_status<>'resolved' AND road_segment_id IS NULL) AS unmatched_issues,
        (SELECT AVG(EXTRACT(EPOCH FROM (resolved_at-first_observed_at))/86400)
          FROM public_issues WHERE lifecycle_status='resolved' AND resolved_at>=first_observed_at
            AND COALESCE(to_jsonb(public_issues)->>'reopened_count','0')='0') AS average_repair_days,
        (SELECT COUNT(*) FROM public_issues WHERE lifecycle_status='resolved' AND resolved_at>=first_observed_at
          AND COALESCE(to_jsonb(public_issues)->>'reopened_count','0')='0') AS repair_sample,
        (SELECT row_to_json(b) FROM boundary_overlap b) AS coverage_boundary,
        (SELECT row_to_json(li) FROM latest_import li) AS last_successful_import
    `, bounds);
    });
    const row = result.rows[0] || {};
    const inBoundary = row.coverage_boundary?.intersects_boundary ?? true;
    const coverageState = !inBoundary
      ? "outside_supported_area"
      : Number(row.active_physical_segments || 0) > 0
      ? "inside_indexed_coverage"
      : "inside_area_no_road_match";

    return NextResponse.json({
      ...row,
      coverage_state: coverageState,
      length_basis: "Separate physical motor-road carriageways clipped to view and coverage boundary (excludes footways/cycleways/tracks).",
      bounds,
      calculated_at: new Date().toISOString(),
      actual_spend_inr: null
    }, { headers: { "Cache-Control": "public, max-age=15" } });
  } catch (e) {
    console.error("Map summary failed", e);
    return NextResponse.json({
      error: "Area data could not load. Please retry.",
      coverage_state: "index_unavailable"
    }, { status: 503 });
  }
}
