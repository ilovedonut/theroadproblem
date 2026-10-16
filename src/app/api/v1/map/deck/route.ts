import { NextRequest, NextResponse } from 'next/server.js';
import { query, withTransaction } from '../../../../../db/client.ts';
import { parseMapBounds } from '../../../../../lib/map-bounds.ts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Viewport-bounded, zoom-simplified, join-safe Map Deck Telemetry Endpoint.
 *
 * Enhancements:
 * 1. Prevents join-multiplication of road segment lengths and work budgets when a road
 *    has multiple segments, incidents, works, or contractors.
 * 2. Supports spatial bounding-box (`bbox=west,south,east,north`), `zoom`, `limit`,
 *    and `selected_road_id` so the browser never receives the entire city's full-resolution
 *    network on every load while preserving selected-road inspection across map movements.
 * 3. Applies zoom-dependent geometry simplification (`ST_SimplifyPreserveTopology`)
 *    and highway hierarchy filtering at lower zoom levels.
 * 4. Reports truthful, distinct counts:
 *    - `unique_source_ways`
 *    - `active_physical_segments`
 *    - `corridors_or_roads`
 *    - `motor_road_length_km` (clipped to the Bengaluru Urban boundary)
 *    - `coverage_boundary` & `last_successful_import`
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl ? req.nextUrl.searchParams : new URL(req.url).searchParams;
    const bboxParam = searchParams.get('bbox');
    const bounds = parseMapBounds(bboxParam);
    const zoomRaw = parseFloat(searchParams.get('zoom') || '');
    const zoom = Number.isFinite(zoomRaw) ? Math.min(Math.max(zoomRaw, 1), 20) : null;
    const limitRaw = parseInt(searchParams.get('limit') || '', 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 10), 2500) : 600;
    const selectedRoadId = searchParams.get('selected_road_id') || null;
    const cursor = searchParams.get('cursor');
    const includeIndexStats = searchParams.get('include_index_stats') !== 'false';
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if ((cursor && !uuid.test(cursor)) || (selectedRoadId && !uuid.test(selectedRoadId))) {
      return NextResponse.json({ error: 'Invalid road cursor or selection.' }, { status: 400 });
    }

    // Determine simplification tolerance (in degrees) based on zoom level
    let simplifyTolerance = 0;
    let majorClassesOnly = false;
    if (zoom !== null) {
      if (zoom < 11.5) {
        simplifyTolerance = 0.00045;
        majorClassesOnly = true;
      } else if (zoom < 13.5) {
        simplifyTolerance = 0.00012;
      }
    }

    // 1. Fetch bounded, join-safe road features
    // Notice that segments, works, and incidents are aggregated in independent subqueries/CTEs
    // so segment lengths and work budgets are NEVER multiplied by cross-joins!
    const params: any[] = [];
    if (bounds) {
      params.push(bounds[0], bounds[1], bounds[2], bounds[3]);
    }

    params.push(selectedRoadId);
    const selectedIdx = params.length;

    params.push(simplifyTolerance);
    const tolIdx = params.length;

    params.push(majorClassesOnly);
    const majorOnlyIdx = params.length;

    params.push(limit + 1);
    const limitIdx = params.length;
    params.push(cursor || null);
    const cursorIdx = params.length;

    const majorClasses = "'motorway','trunk','primary','secondary','tertiary','motorway_link','trunk_link','primary_link','secondary_link'";
    const roadsQuery = `
      WITH active_works_segs AS (
        SELECT DISTINCT road_segment_id FROM work_segments WHERE road_segment_id IS NOT NULL
      ),
      active_incidents_segs AS (
        SELECT DISTINCT road_segment_id FROM incidents WHERE lifecycle_status = 'active' AND road_segment_id IS NOT NULL
      ),
      ${majorClassesOnly ? `eligible_segment_ids AS MATERIALIZED (
        SELECT id FROM road_segments WHERE is_active AND road_class IN (${majorClasses})
        UNION SELECT rs.id FROM roads r JOIN road_segments rs ON rs.road_id=r.id
          WHERE r.is_official_corridor OR (rs.road_class IS NULL AND r.road_class IN (${majorClasses}))
        UNION SELECT road_segment_id FROM active_works_segs
        UNION SELECT road_segment_id FROM active_incidents_segs
        UNION SELECT id FROM road_segments WHERE road_id=$${selectedIdx}::uuid
      ),` : ''}
      candidate_segments AS MATERIALIZED (
        SELECT
          rs.id,
          rs.road_id,
          rs.chainage_from,
          rs.chainage_to,
          rs.length_m,
          COALESCE(rs.within_boundary_length_m, rs.length_m) AS within_boundary_length_m,
          rs.osm_way_id,
          COALESCE(rs.usage_category, 'public_motor') AS usage_category,
          COALESCE(rs.access_status, 'unknown') AS access_status,
          rs.road_class,
          rs.geom,
          (aws.road_segment_id IS NOT NULL) AS has_work,
          (ais.road_segment_id IS NOT NULL) AS has_incident
        FROM road_segments rs
        ${majorClassesOnly ? 'JOIN eligible_segment_ids eligible ON eligible.id=rs.id' : ''}
        JOIN roads r ON r.id = rs.road_id
        LEFT JOIN active_works_segs aws ON aws.road_segment_id = rs.id
        LEFT JOIN active_incidents_segs ais ON ais.road_segment_id = rs.id
        WHERE rs.is_active = TRUE
          AND r.name NOT LIKE 'Test %'
          ${bounds && !majorClassesOnly ? `AND (rs.geom && ST_MakeEnvelope($1,$2,$3,$4,4326) OR ($${selectedIdx}::uuid IS NOT NULL AND rs.road_id=$${selectedIdx}::uuid))` : ''}
          AND ($${cursorIdx}::uuid IS NULL OR rs.road_id > $${cursorIdx}::uuid)
          AND (rs.usage_category IS NULL OR rs.usage_category IN ('public_motor', 'restricted_motor'))
          AND (
            ((
              NOT $${majorOnlyIdx}::boolean
              OR COALESCE(rs.road_class, r.road_class) IN (
                'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
                'motorway_link', 'trunk_link', 'primary_link', 'secondary_link'
              )
              OR COALESCE(r.is_official_corridor, FALSE) = TRUE
              OR aws.road_segment_id IS NOT NULL
              OR ais.road_segment_id IS NOT NULL
            ))
            OR ($${selectedIdx}::uuid IS NOT NULL AND rs.road_id = $${selectedIdx}::uuid)
          )
      ),
      visible_segments AS MATERIALIZED (
        SELECT * FROM candidate_segments
        WHERE ${bounds ? `(geom && ST_MakeEnvelope($1,$2,$3,$4,4326) AND ST_Intersects(geom, ST_MakeEnvelope($1,$2,$3,$4,4326)))
          OR ($${selectedIdx}::uuid IS NOT NULL AND road_id=$${selectedIdx}::uuid)` : 'TRUE'}
      ),
      prioritized_roads AS (
        SELECT
          r.id,
          r.name,
          r.display_name,
          COALESCE(r.has_official_name, TRUE) AS has_official_name,
          r.ref,
          r.road_class,
          r.authority_name,
          r.state,
          r.district,
          COALESCE(r.usage_category, 'public_motor') AS usage_category,
          COALESCE(r.access_status, 'unknown') AS access_status,
          COALESCE(r.is_official_corridor, FALSE) AS is_official_corridor,
          SUM(vs.within_boundary_length_m) AS total_length_m,
          COUNT(vs.id) AS active_segments_count,
          COUNT(DISTINCT vs.osm_way_id) AS unique_ways_count,
          BOOL_OR(vs.has_incident) AS has_incident,
          BOOL_OR(vs.has_work) AS has_work
        FROM roads r
        JOIN visible_segments vs ON vs.road_id = r.id
        WHERE ($${cursorIdx}::uuid IS NULL OR r.id > $${cursorIdx}::uuid)
        GROUP BY r.id
        ORDER BY r.id ASC
        LIMIT $${limitIdx}
      ),
      page_segments AS (
        SELECT vs.road_id, json_agg(jsonb_build_object(
          'segment_id', vs.id, 'osm_way_id', vs.osm_way_id,
          'chainage_from', vs.chainage_from, 'chainage_to', vs.chainage_to,
          'length_m', vs.within_boundary_length_m, 'access_status', vs.access_status,
          'geojson', ST_AsGeoJSON(CASE WHEN $${tolIdx}::float8 > 0
            THEN ST_SimplifyPreserveTopology(vs.geom,$${tolIdx}::float8) ELSE vs.geom END)::json
        ) ORDER BY vs.chainage_from ASC NULLS LAST, vs.id ASC) AS segments
        FROM visible_segments vs JOIN prioritized_roads pr ON pr.id=vs.road_id
        GROUP BY vs.road_id
      )
      SELECT
        pr.id,
        pr.name,
        pr.display_name,
        pr.has_official_name,
        pr.ref,
        pr.road_class,
        pr.authority_name,
        pr.state,
        pr.district,
        pr.usage_category,
        pr.access_status,
        pr.total_length_m,
        pr.active_segments_count,
        pr.unique_ways_count,
        COALESCE(ps.segments, '[]'::json) AS segments,
        COALESCE((
          SELECT json_agg(DISTINCT jsonb_build_object(
            'work_id', w.id,
            'package_name', w.package_name,
            'authority_name', w.authority_name,
            'tender_id', w.tender_id,
            'contract_id', w.contract_id,
            'official_status', w.official_status,
            'contract_value_inr', w.contract_value_inr,
            'contractor_name', c.legal_name,
            'cin', c.cin,
            'gstin', c.gstin,
            'start_date', w.start_date,
            'target_completion_date', w.target_completion_date,
            'actual_completion_date', w.actual_completion_date,
            'defect_liability_end_date', w.defect_liability_end_date
          ))
          FROM road_segments rs_w
          JOIN work_segments ws ON ws.road_segment_id = rs_w.id
          JOIN works w ON w.id = ws.work_id
          LEFT JOIN work_contractors wc ON wc.work_id = w.id
          LEFT JOIN contractors c ON c.id = wc.contractor_id
          WHERE rs_w.road_id = pr.id AND rs_w.is_active = TRUE
        ), '[]'::json) AS works,
        COALESCE((
          SELECT json_agg(DISTINCT jsonb_build_object(
            'incident_id', i.id,
            'category', i.category,
            'lifecycle_status', i.lifecycle_status,
            'verification_state', i.verification_state,
            'last_observed_at', i.last_observed_at,
            'lat', ST_Y(i.centroid),
            'lon', ST_X(i.centroid)
          ))
          FROM road_segments rs_i
          JOIN incidents i ON i.road_segment_id = rs_i.id
          WHERE rs_i.road_id = pr.id
            AND rs_i.is_active = TRUE
            AND i.lifecycle_status = 'active'
        ), '[]'::json) AS incidents
      FROM prioritized_roads pr
      LEFT JOIN page_segments ps ON ps.road_id=pr.id
      ORDER BY pr.id ASC;
    `;

    const roadsRes = await withTransaction(async client => {
      // Abandoned viewport requests must not occupy an origin connection for
      // minutes. LOCAL settings cannot leak into another pooled request.
      await client.query("SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = '20000'; SET LOCAL lock_timeout = '2000'");
      return client.query(roadsQuery, params);
    });
    const returnedRoads = roadsRes.rows.slice(0, limit);
    const pagination = {
      has_more: roadsRes.rows.length > limit,
      next_cursor: roadsRes.rows.length > limit ? returnedRoads[returnedRoads.length - 1].id : null,
      returned: returnedRoads.length,
      detail: majorClassesOnly ? 'major_roads' : 'all_motor_roads',
    };
    // Continuations only need the next geometries. Repeating district-wide
    // statistics and source retrieval on every page delays full coverage.
    if (cursor) return NextResponse.json({ roads: returnedRoads, pagination }, {
      headers: { 'Cache-Control': 'no-store' },
    });

    // 2. Fetch truthful district-wide index metrics without join multiplication
    const indexStatsRes = includeIndexStats ? await query(`
      SELECT
        COUNT(DISTINCT rs.osm_way_id) FILTER (WHERE rs.osm_way_id IS NOT NULL) AS unique_source_ways,
        COUNT(rs.id) AS active_physical_segments,
        COUNT(DISTINCT rs.road_id) AS corridors_or_roads,
        COALESCE(SUM(COALESCE(rs.within_boundary_length_m, rs.length_m)) FILTER (
          WHERE COALESCE(rs.usage_category, 'public_motor') IN ('public_motor', 'restricted_motor')
        ), 0) AS motor_road_length_m,
        COUNT(rs.id) FILTER (WHERE COALESCE(rs.usage_category, 'public_motor') = 'non_motor') AS non_motor_segments
      FROM road_segments rs
      JOIN roads r ON r.id = rs.road_id
      WHERE rs.is_active = TRUE
        AND r.name NOT LIKE 'Test %';
    `) : { rows: [] };
    const statsRow = indexStatsRes.rows[0] || {};

    // 3. Fetch coverage boundary & last successful import metadata
    const boundaryRes = includeIndexStats ? await query(`
      SELECT district, state, osm_relation_id, source,
             COALESCE(boundary_type, 'administrative_district') AS boundary_type,
             COALESCE(boundary_version, 'osm-rel-2020589-v1') AS boundary_version,
             COALESCE(crs, 'EPSG:4326') AS crs,
             checksum_sha256,
             area_sq_km
      FROM district_boundaries
      WHERE district = 'Bengaluru Urban'
      LIMIT 1;
    `) : { rows: [] };

    const lastImportRes = includeIndexStats ? await query(`
      SELECT id, district, source_url, checksum_sha256, ways_count,
             inserted_count, updated_count, skipped_count,
             COALESCE(rejected_count, 0) AS rejected_count,
             COALESCE(within_boundary_length_m, 0) AS within_boundary_length_m,
             COALESCE(motor_road_length_m, 0) AS motor_road_length_m,
             coverage_status, status, completed_at,
             COALESCE(boundary_version, 'osm-rel-2020589-v1') AS boundary_version,
             COALESCE(parser_version, '2.0.0') AS parser_version
      FROM osm_imports
      WHERE district = 'Bengaluru Urban' AND status = 'completed'
      ORDER BY completed_at DESC NULLS LAST, started_at DESC
      LIMIT 1;
    `) : { rows: [] };

    // 4. Query live intelligence stream from database source_records
    const sourceRecordsRes = await query(`
      SELECT 
        sr.id,
        sr.external_key,
        sr.source_uri,
        sr.raw_content,
        sr.retrieved_at,
        ds.name as source_name,
        ds.publisher
      FROM source_records sr
      JOIN data_sources ds ON sr.source_id = ds.id
      WHERE sr.raw_content ? 'lat' AND sr.raw_content ? 'lon'
      ORDER BY sr.retrieved_at DESC
      LIMIT 50;
    `);

    let multiSourceSignals: any[] = [];
    if (sourceRecordsRes.rows.length > 0) {
      multiSourceSignals = sourceRecordsRes.rows.map((row: any) => {
        const raw = row.raw_content || {};
        const dateVal = raw.published_at || raw.start_date || row.retrieved_at;
        const dateStr =
          dateVal instanceof Date
            ? dateVal.toISOString().substring(0, 10)
            : typeof dateVal === 'string'
            ? dateVal.substring(0, 10)
            : '';
        const isOfficial = !raw.signal_type || raw.signal_type === 'official_portal';
        return {
          id: row.id,
          type: raw.signal_type || 'official_portal',
          source: row.source_name || 'Public Data Registry',
          title: raw.title || raw.package_name || `Source Record: ${row.external_key}`,
          date: dateStr,
          road_name: raw.road_name || raw.road_name_hint || 'Monitored Corridor',
          lat: Number(raw.lat),
          lon: Number(raw.lon),
          details:
            raw.details ||
            (raw.work_type
              ? `${raw.work_type} (Status: ${raw.official_status || 'recorded'})`
              : `Tender/Source Record ${row.external_key}`),
          verified: false,
          status: isOfficial ? 'official_procurement_record' : 'publisher_reported',
          source_url: row.source_uri,
          disclaimer: isOfficial
            ? 'Administrative procurement entry. Denotes official budget/contract allocation, not verified physical road condition.'
            : 'Publisher/social reported claim. Does not certify ground truth condition without physical audit.',
          is_demo: false,
        };
      });
    }

    // Deduplicate works across returned roads to prevent double counting
    const seenWorkIds = new Set<string>();
    let totalSpendInr = 0;
    let visibleLengthKm = 0;

    for (const r of returnedRoads) {
      visibleLengthKm += parseFloat(r.total_length_m || '0') / 1000;
      if (Array.isArray(r.works)) {
        for (const w of r.works) {
          if (w.work_id && !seenWorkIds.has(w.work_id)) {
            seenWorkIds.add(w.work_id);
            if (w.contract_value_inr) {
              totalSpendInr += parseFloat(w.contract_value_inr);
            }
          }
        }
      }
    }

    const totalSpendCr = (totalSpendInr / 10000000).toFixed(2);
    const totalMotorLengthKm = (
      parseFloat(statsRow.motor_road_length_m || '0') / 1000 || visibleLengthKm
    ).toFixed(1);
    const totalCorridors =
      parseInt(statsRow.corridors_or_roads || '0', 10) || roadsRes.rows.length;
    const activeSegments = parseInt(statsRow.active_physical_segments || '0', 10);
    const uniqueWays = parseInt(statsRow.unique_source_ways || '0', 10);

    return NextResponse.json(
      {
        summary: includeIndexStats ? {
          total_roads_indexed: totalCorridors,
          corridors_or_roads: totalCorridors,
          active_physical_segments: activeSegments,
          unique_source_ways: uniqueWays,
          non_motor_segments: parseInt(statsRow.non_motor_segments || '0', 10),
          total_length_km: totalMotorLengthKm,
          motor_road_length_km: totalMotorLengthKm,
          visible_roads_returned: returnedRoads.length,
          visible_length_km: visibleLengthKm.toFixed(1),
          length_unit_definition:
            'Geodesic length of active motor-road carriageways clipped to the Bengaluru Urban administrative district boundary (dual carriageways counted per physical way).',
          total_spend_tracked_cr: totalSpendCr,
          active_works_count: seenWorkIds.size,
          multi_source_signals_count: multiSourceSignals.length,
          coverage_boundary: boundaryRes.rows[0] || {
            district: 'Bengaluru Urban',
            state: 'Karnataka',
            boundary_type: 'administrative_district',
            osm_relation_id: 2020589,
            crs: 'EPSG:4326',
          },
          last_successful_import: lastImportRes.rows[0] || null,
          viewport: {
            bbox: bounds,
            zoom,
            limit,
            simplified: simplifyTolerance > 0,
          },
          timestamp: new Date().toISOString(),
        } : undefined,
        roads: returnedRoads,
        pagination,
        signals: multiSourceSignals,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (err: any) {
    console.error('Error in deck route:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
