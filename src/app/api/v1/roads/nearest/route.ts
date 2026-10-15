import { NextRequest, NextResponse } from 'next/server.js';
import { query } from '../../../../../db/client.ts';
import { generateInformativeLabel } from '../../../../../lib/osm/importer.ts';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lon = parseFloat(searchParams.get('lon') || '');
  const lat = parseFloat(searchParams.get('lat') || '');
  const radius = Math.min(Math.max(parseFloat(searchParams.get('radius') || '150'), 25), 300);
  const includeNonMotor = searchParams.get('include_non_motor') === 'true';

  if (isNaN(lon) || isNaN(lat)) {
    return NextResponse.json({ error: 'Valid lon and lat coordinates are required' }, { status: 400 });
  }

  try {
    // 1. Administrative Boundary Coverage Check (Real Polygon Membership)
    const boundRes = await query(`
      SELECT district, state, osm_relation_id,
             COALESCE(boundary_type, 'administrative_district') AS boundary_type,
             COALESCE(boundary_version, 'osm-rel-2020589-v1') AS boundary_version
      FROM district_boundaries
      WHERE ST_Contains(boundary_geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      LIMIT 1;
    `, [lon, lat]);

    const inDistrict = boundRes.rows.length > 0;
    const districtName = inDistrict ? boundRes.rows[0].district : null;
    const boundaryMeta = inDistrict ? boundRes.rows[0] : null;

    if (!inDistrict) {
      return NextResponse.json({
        in_coverage: false,
        coverage_area: null,
        coverage_status: 'outside_pilot_coverage',
        coverage_state: 'outside_supported_area',
        query_point: { lon, lat },
        search_radius_m: radius,
        candidates: [],
        has_match: false,
        is_ambiguous: false,
        fallback_available: true,
        attribution: '© OpenStreetMap contributors (ODbL 1.0)',
        message: 'This location is outside the currently indexed boundary (Bengaluru Urban administrative district). Unmatched point reporting is fully supported.'
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        }
      });
    }

    // 2. Imported Coverage Sector / District-Complete Verification
    const sectorRes = await query(`
      SELECT sector_key, sector_name
      FROM imported_coverage_sectors
      WHERE district = $1
        AND status = 'completed'
        AND ST_Contains(bounds_geom, ST_SetSRID(ST_MakePoint($2, $3), 4326))
      ORDER BY CASE WHEN sector_key = 'bengaluru_urban_full' THEN 1 ELSE 0 END ASC
      LIMIT 1;
    `, [districtName, lon, lat]);

    let inIndexedSector = sectorRes.rows.length > 0;
    let sectorKey = inIndexedSector ? sectorRes.rows[0].sector_key : null;
    let sectorName = inIndexedSector ? sectorRes.rows[0].sector_name : null;

    if (!inIndexedSector) {
      // Check if a complete district boundary import is active in osm_imports
      const fullImportRes = await query(`
        SELECT id, boundary_version, completed_at
        FROM osm_imports
        WHERE district = $1 AND status = 'completed' AND coverage_status = 'complete_district'
        ORDER BY completed_at DESC NULLS LAST
        LIMIT 1;
      `, [districtName]);

      if (fullImportRes.rows.length > 0) {
        inIndexedSector = true;
        sectorKey = 'bengaluru_urban_full';
        sectorName = `${districtName} Administrative District`;
      }
    }

    if (!inIndexedSector) {
      return NextResponse.json({
        in_coverage: false,
        coverage_area: districtName,
        coverage_status: 'unindexed_sector',
        coverage_state: 'unindexed_sector',
        sector_key: null,
        sector_name: null,
        query_point: { lon, lat },
        search_radius_m: radius,
        candidates: [],
        has_match: false,
        is_ambiguous: false,
        fallback_available: true,
        attribution: '© OpenStreetMap contributors (ODbL 1.0)',
        message: `This location is within ${districtName}, but this sector has not yet been indexed by the data pipeline. Unmatched point reporting is fully supported.`
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        }
      });
    }

    // 3. Query Candidate Segments with Window Partition by Carriageway/Layer
    // Uses the functional geography index (idx_road_segments_geog_active)
    // Excludes non-motor routes and construction/proposed unless explicitly requested
    const res = await query(`
      WITH ranked_candidates AS (
        SELECT 
          rs.id as segment_id,
          rs.road_id,
          r.name as road_name,
          COALESCE(r.has_official_name, NOT (r.name LIKE 'Unnamed%')) as has_official_name,
          r.ref as road_ref,
          COALESCE(rs.road_class, r.road_class) as road_class,
          r.authority_name,
          rs.district,
          COALESCE(rs.layer, 0) as layer,
          rs.bridge,
          rs.tunnel,
          rs.service,
          COALESCE(rs.is_service, FALSE) as is_service,
          COALESCE(rs.access, 'unknown') as access,
          COALESCE(rs.access_status, 'unknown') as access_status,
          COALESCE(rs.usage_category, 'public_motor') as usage_category,
          rs.osm_way_id,
          rs.osm_tags,
          ROUND(ST_Distance(rs.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)::numeric, 1) as distance_m,
          ST_AsGeoJSON(rs.geom) as geom_geojson,
          ROW_NUMBER() OVER (
            PARTITION BY rs.road_id, COALESCE(rs.layer, 0), COALESCE(rs.is_service, FALSE)
            ORDER BY ST_Distance(rs.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) ASC
          ) as rank_per_carriageway
        FROM road_segments rs
        JOIN roads r ON r.id = rs.road_id
        WHERE rs.is_active = TRUE
          AND (
            $4::boolean = TRUE
            OR COALESCE(rs.usage_category, 'public_motor') IN ('public_motor', 'restricted_motor')
          )
          AND ST_DWithin(rs.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
      )
      SELECT *
      FROM ranked_candidates
      WHERE rank_per_carriageway = 1
      ORDER BY distance_m ASC
      LIMIT 8;
    `, [lon, lat, radius, includeNonMotor]);

    // Format rich metadata and human-readable distinguishing labels
    const candidates = res.rows.map((row: any) => {
      const isElevated =
        (row.layer !== null && row.layer > 0) ||
        (row.bridge && row.bridge !== 'no') ||
        (row.road_name && /elevated|flyover|viaduct/i.test(row.road_name));
      const isTunnel = row.layer < 0 || (row.tunnel && row.tunnel !== 'no');
      const isService =
        row.is_service ||
        row.road_class === 'service' ||
        (row.road_name && /service/i.test(row.road_name));
      const isUnnamed = !row.has_official_name || !row.road_name || row.road_name.startsWith('Unnamed');

      let gradeLevel = 'surface';
      let gradeLabel = 'Surface Street';
      if (isElevated) {
        gradeLevel = 'elevated';
        gradeLabel = row.layer > 1 ? `Elevated Flyover (Layer ${row.layer})` : 'Elevated Flyover / Viaduct';
      } else if (isTunnel) {
        gradeLevel = 'underground';
        gradeLabel = 'Underpass / Tunnel';
      } else if (isService) {
        gradeLevel = 'service';
        gradeLabel = row.service ? `Service Road (${row.service.replace(/_/g, ' ')})` : 'Surface Service Lane';
      }

      let displayLabel = row.road_name;
      if (isUnnamed) {
        displayLabel = generateInformativeLabel(row.osm_tags || {
          highway: row.road_class,
          service: row.service,
          bridge: row.bridge,
          tunnel: row.tunnel,
          layer: String(row.layer)
        }, { residentialNoun: 'road' });
      } else {
        if (isElevated && !displayLabel.toLowerCase().includes('elevated')) {
          displayLabel += ' [Elevated]';
        } else if (isService && !displayLabel.toLowerCase().includes('service')) {
          displayLabel += ' [Service Road]';
        }
      }

      let parsedGeom: any = null;
      try {
        parsedGeom = JSON.parse(row.geom_geojson);
      } catch {}

      return {
        segment_id: row.segment_id,
        road_id: row.road_id,
        road_name: row.road_name,
        is_unnamed: isUnnamed,
        road_ref: row.road_ref,
        road_class: row.road_class,
        usage_category: row.usage_category,
        access: row.access,
        access_status: row.access_status,
        authority_name: row.authority_name,
        district: row.district,
        distance_m: Number(row.distance_m),
        layer: row.layer,
        grade_level: gradeLevel,
        grade_label: gradeLabel,
        is_elevated: isElevated,
        is_service: isService,
        display_label: displayLabel,
        osm_way_id: row.osm_way_id ? Number(row.osm_way_id) : null,
        geom_geojson: row.geom_geojson,
        geometry: parsedGeom
      };
    });

    const hasMatch = candidates.length > 0;
    const isAmbiguous =
      candidates.length > 1 &&
      (Math.abs(candidates[1].distance_m - candidates[0].distance_m) <= 20 ||
        candidates.some((c: any) => c.is_elevated) && candidates.some((c: any) => !c.is_elevated));

    const coverageStatus = hasMatch ? 'indexed_active' : 'indexed_sector_no_nearby_road';
    const coverageState = hasMatch ? 'inside_indexed_coverage' : 'inside_area_no_road_match';
    const message = hasMatch
      ? `Found ${candidates.length} distinct carriageway candidate(s) within ${radius}m in ${sectorName}.${isAmbiguous ? ' Multiple carriageways or cross-streets are close to this pin—please select the exact affected carriageway.' : ''}`
      : `No indexed road segment found within ${radius}m of this pin in ${sectorName}. Unmatched point reporting is available.`;

    return NextResponse.json({
      in_coverage: true,
      coverage_area: districtName,
      coverage_boundary: boundaryMeta,
      coverage_status: coverageStatus,
      coverage_state: coverageState,
      sector_key: sectorKey,
      sector_name: sectorName,
      query_point: { lon, lat },
      search_radius_m: radius,
      candidates,
      has_match: hasMatch,
      is_ambiguous: isAmbiguous,
      auto_selected_segment_id: null, // Never auto-select; user explicitly chooses candidate or leaves unmatched
      fallback_available: true,
      attribution: '© OpenStreetMap contributors (ODbL 1.0)',
      message
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    });

  } catch (err: any) {
    console.error('Error in nearest road lookup:', err);
    return NextResponse.json({
      error: err.message,
      in_coverage: false,
      coverage_status: 'index_unavailable',
      coverage_state: 'index_unavailable',
      fallback_available: true
    }, { status: 503 });
  }
}
