import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl ? req.nextUrl.searchParams : new URL(req.url).searchParams;
  const q = (searchParams.get('q') || '').trim();
  if (q.length < 2 || q.length > 120) return NextResponse.json({ error: 'Enter between 2 and 120 characters.' }, { status: 400 });
  const terms = q.split(/\s+/).slice(0, 8).map(t => `%${t.replace(/[\\%_]/g, '\\$&')}%`);
  try {
    const result = await query(`WITH entries AS (
      SELECT 'road' AS kind,
        r.id::text AS id,
        CASE
          WHEN COALESCE(r.has_official_name, NOT (r.name LIKE 'Unnamed%')) = FALSE
               AND NOT (r.name ILIKE 'Unnamed%')
            THEN 'Unnamed ' || COALESCE(r.road_class, 'road') || ' (' || r.name || ')'
          ELSE r.name
        END AS title,
        concat_ws(' · ',
          CASE WHEN COALESCE(r.has_official_name, NOT (r.name LIKE 'Unnamed%')) = FALSE THEN 'Unnamed road' END,
          r.ref,
          NULLIF(array_to_string(COALESCE(r.aliases, '{}'), ', '), ''),
          r.road_class,
          r.district,
          r.state,
          NULLIF(r.authority_name, 'Local Public Authority'),
          r.source_feature_id
        ) AS detail,
        '/roads/'||r.id AS href,
        NULL::text AS source_url,
        concat_ws(' ',
          r.name,
          r.display_name,
          r.ref,
          array_to_string(COALESCE(r.aliases, '{}'), ' '),
          r.road_class,
          r.district,
          r.state,
          r.authority_name,
          r.source_feature_id,
          (SELECT string_agg(concat_ws(' ',
            rs.osm_tags->>'alt_name',
            rs.osm_tags->>'old_name',
            rs.osm_tags->>'official_name',
            rs.osm_tags->>'loc_name',
            rs.osm_tags->>'addr:street',
            rs.osm_tags->>'addr:suburb',
            rs.osm_tags->>'ref'
          ), ' ') FROM road_segments rs WHERE rs.road_id = r.id AND rs.is_active = TRUE)
        ) AS searchable
      FROM roads r
      UNION ALL
      SELECT 'project',w.id::text,COALESCE(w.package_name,w.tender_id,'Road project'),
        concat_ws(' · ',w.tender_id,w.contract_id,w.authority_name,w.official_status,
          CASE WHEN w.contract_value_inr IS NOT NULL THEN 'Budget ₹'||w.contract_value_inr::text END),
        NULL,sr.source_uri,
        concat_ws(' ',w.package_name,w.tender_id,w.contract_id,w.authority_name,
          (SELECT string_agg(c.legal_name,' ') FROM work_contractors wc JOIN contractors c ON c.id=wc.contractor_id WHERE wc.work_id=w.id),
          (SELECT string_agg(concat_ws(' ',r.name,r.ref,r.district,r.state),' ') FROM work_segments ws JOIN road_segments rs ON rs.id=ws.road_segment_id JOIN roads r ON r.id=rs.road_id WHERE ws.work_id=w.id))
      FROM works w LEFT JOIN source_records sr ON sr.id=w.source_record_id
      UNION ALL
      SELECT 'source',sr.id::text,COALESCE(sr.raw_content->>'title',sr.raw_content->>'package_name',sr.external_key,ds.name),
        concat_ws(' · ',ds.name,ds.publisher,sr.external_key),NULL,sr.source_uri,
        concat_ws(' ',ds.name,ds.publisher,sr.external_key,sr.raw_content->>'title',sr.raw_content->>'package_name',sr.raw_content->>'road_name_hint',sr.raw_content->>'district',sr.raw_content->>'address',sr.raw_content->>'tender_id')
      FROM source_records sr JOIN data_sources ds ON ds.id=sr.source_id
      UNION ALL
      SELECT 'place',l.id::text,l.name,concat_ws(' · ',l.district,l.state),
        CASE WHEN l.center IS NOT NULL THEN '/?bbox='||(ST_X(l.center)-0.025)||','||(ST_Y(l.center)-0.025)||','||(ST_X(l.center)+0.025)||','||(ST_Y(l.center)+0.025) END,NULL,
        concat_ws(' ',l.name,l.name_hi,l.district,l.state)
      FROM localities l
      UNION ALL
      SELECT 'address',rs.id::text,
        concat_ws(' ',to_jsonb(rs)->'osm_tags'->>'addr:housenumber',to_jsonb(rs)->'osm_tags'->>'addr:street'),
        concat_ws(' · ',rs.district,rs.state),'/roads/'||rs.road_id,NULL,
        concat_ws(' ',to_jsonb(rs)->'osm_tags'->>'addr:housenumber',to_jsonb(rs)->'osm_tags'->>'addr:street',to_jsonb(rs)->'osm_tags'->>'addr:city',to_jsonb(rs)->'osm_tags'->>'addr:postcode',rs.district,rs.state)
      FROM road_segments rs WHERE rs.is_active AND to_jsonb(rs)->'osm_tags'->>'addr:street' IS NOT NULL
    ), matched AS (
      SELECT *,row_number() OVER(PARTITION BY kind ORDER BY CASE WHEN lower(title)=lower($2) THEN 0 WHEN lower(title) LIKE lower($2)||'%' THEN 1 ELSE 2 END,title,id) AS position
      FROM entries WHERE searchable ILIKE ALL($1::text[])
    ) SELECT kind,id,title,detail,href,source_url FROM matched WHERE position<=12 ORDER BY kind,position`, [terms,q]);
    const results = result.rows.map(r => ({
      ...r,
      is_unnamed: r.kind === 'road' && (/^Unnamed/i.test(r.title || '') || /Unnamed road/i.test(r.detail || '')),
      source_url: /^https?:\/\//i.test(r.source_url || '') ? r.source_url : null,
      href: r.href || `/search?q=${encodeURIComponent(q)}&focus=${r.kind}:${r.id}`
    }));
    return NextResponse.json({ q, results, limit_per_type: 12 });
  } catch (e) {
    console.error('Public search failed',e);
    return NextResponse.json({ error: 'Search could not load. Please retry.' }, { status: 503 });
  }
}
