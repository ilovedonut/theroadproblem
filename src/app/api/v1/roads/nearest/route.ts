import { NextRequest, NextResponse } from 'next/server.js';
import { query } from '../../../../../db/client.ts';
import { generateInformativeLabel } from '../../../../../lib/osm/importer.ts';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lon = parseFloat(searchParams.get('lon') || '');
  const lat = parseFloat(searchParams.get('lat') || '');
  const radius = Math.min(Math.max(parseFloat(searchParams.get('radius') || '150'), 25), 300);

  if (isNaN(lon) || isNaN(lat)) {
    return NextResponse.json({ error: 'Valid lon and lat coordinates are required' }, { status: 400 });
  }

  try {
    // 1. Administrative Boundary Coverage Check (Real Polygon Membership)
    const boundRes = await query(`
      SELECT district, state
      FROM district_boundaries
      WHERE ST_Contains(boundary_geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      LIMIT 1;
    `, [lon, lat]);

    const inDistrict = boundRes.rows.length > 0;
    const districtName = inDistrict ? boundRes.rows[0].district : null;

    if (!inDistrict) {
      return NextResponse.json({
        in_coverage: false,
        coverage_area: null,
        coverage_status: 'outside_pilot_coverage',
        query_point: { lon, lat },
        search_radius_m: radius,
        candidates: [],
        has_match: false,
        fallback_available: true,
        attribution: '© OpenStreetMap contributors (ODbL 1.0)',
        message: 'This location is outside the currently indexed pilot boundary (Bengaluru Urban). Unmatched point reporting is fully supported.'
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        }
      });
    }

    // 2. Imported Coverage Sector Verification
    // Prevents overstating coverage simply because coordinates fall inside the district polygon
    const sectorRes = await query(`
      SELECT sector_key, sector_name
      FROM imported_coverage_sectors
      WHERE district = $1
        AND status = 'completed'
        AND ST_Contains(bounds_geom, ST_SetSRID(ST_MakePoint($2, $3), 4326))
      LIMIT 1;
    `, [districtName, lon, lat]);

    const inIndexedSector = sectorRes.rows.length > 0;
    const sectorKey = inIndexedSector ? sectorRes.rows[0].sector_key : null;
    const sectorName = inIndexedSector ? sectorRes.rows[0].sector_name : null;

    if (!inIndexedSector) {
      return NextResponse.json({
        in_coverage: false,
        coverage_area: districtName,
        coverage_status: 'unindexed_sector',
        sector_key: null,
        sector_name: null,
        query_point: { lon, lat },
        search_radius_m: radius,
        candidates: [],
        has_match: false,
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
    const res = await query(`
      WITH ranked_candidates AS (
        SELECT 
          rs.id as segment_id,
          rs.road_id,
          r.name as road_name,
          r.ref as road_ref,
          COALESCE(rs.road_class, r.road_class) as road_class,
          r.authority_name,
          rs.district,
          COALESCE(rs.layer, 0) as layer,
          rs.bridge,
          rs.tunnel,
          rs.service,
          COALESCE(rs.is_service, FALSE) as is_service,
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
          AND ST_DWithin(rs.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
      )
      SELECT *
      FROM ranked_candidates
      WHERE rank_per_carriageway = 1
      ORDER BY distance_m ASC
      LIMIT 8;
    `, [lon, lat, radius]);

    // Format rich metadata and human-readable distinguishing labels
    const candidates = res.rows.map((row: any) => {
      const isElevated = row.layer > 0 || (row.bridge && row.bridge !== 'no');
      const isTunnel = row.layer < 0 || (row.tunnel && row.tunnel !== 'no');
      const isService = row.is_service || row.road_class === 'service';

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
      if (!displayLabel || displayLabel.startsWith('Unnamed')) {
        displayLabel = generateInformativeLabel(row.osm_tags || {
          highway: row.road_class,
          service: row.service,
          bridge: row.bridge,
          tunnel: row.tunnel,
          layer: String(row.layer)
        });
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
        road_ref: row.road_ref,
        road_class: row.road_class,
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
    const coverageStatus = hasMatch ? 'indexed_active' : 'indexed_sector_no_nearby_road';
    const message = hasMatch
      ? `Found ${candidates.length} distinct carriageway candidate(s) within ${radius}m in ${sectorName}.`
      : `No indexed road segment found within ${radius}m of this pin in ${sectorName}. Unmatched point reporting is available.`;

    return NextResponse.json({
      in_coverage: true,
      coverage_area: districtName,
      coverage_status: coverageStatus,
      sector_key: sectorKey,
      sector_name: sectorName,
      query_point: { lon, lat },
      search_radius_m: radius,
      candidates,
      has_match: hasMatch,
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
