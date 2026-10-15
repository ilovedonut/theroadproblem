import { NextRequest, NextResponse } from "next/server";
import { query } from "@/db/client";
import { parseMapBounds } from "@/lib/map-bounds";

export async function GET(req: NextRequest) {
  const bounds = parseMapBounds(req.nextUrl.searchParams.get("bbox"));
  if (!bounds) return NextResponse.json({ error: "Choose a valid map area." }, { status: 400 });
  try {
    const result = await query(`
      WITH area AS (
        SELECT CASE WHEN $1::float8 < $3::float8
          THEN ST_MakeEnvelope($1,$2,$3,$4,4326)
          ELSE ST_Union(ST_MakeEnvelope($1,$2,180,$4,4326), ST_MakeEnvelope(-180,$2,$3,$4,4326)) END AS geom
      ), segments AS MATERIALIZED (
        SELECT rs.id,rs.road_id,rs.geom,
          ST_Length(ST_CollectionExtract(ST_Intersection(rs.geom,a.geom),2)::geography) AS visible_length
        FROM road_segments rs CROSS JOIN area a
        WHERE rs.is_active AND ST_Intersects(rs.geom,a.geom)
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
      ), authorities AS (
        SELECT DISTINCT r.authority_name AS name FROM roads r JOIN segments s ON s.road_id=r.id
        UNION SELECT authority_name FROM budgets
      )
      SELECT
        (SELECT COUNT(DISTINCT road_id) FROM segments) AS roads,
        (SELECT COALESCE(SUM(visible_length),0)/1000 FROM segments) AS road_km,
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
          AND COALESCE(to_jsonb(public_issues)->>'reopened_count','0')='0') AS repair_sample
    `, bounds);
    return NextResponse.json({ ...result.rows[0], bounds, calculated_at: new Date().toISOString(), actual_spend_inr: null }, { headers: { "Cache-Control": "public, max-age=15" } });
  } catch (e) {
    console.error("Map summary failed", e);
    return NextResponse.json({ error: "Area data could not load. Please retry." }, { status: 503 });
  }
}
