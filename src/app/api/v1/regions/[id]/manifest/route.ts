import { NextRequest, NextResponse } from 'next/server.js';
import { getCityById, resolveCityId } from '../../../../../../lib/city-catalogue.ts';
import type { CityEntry } from '../../../../../../lib/city-catalogue.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MANIFEST_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
  ...CORS_HEADERS,
};

function getCityJurisdictionSchemes(city: CityEntry) {
  switch (city.id) {
    case 'bengaluru':
      return [
        {
          scheme_id: 'gba_corporations_2025',
          name: 'Greater Bengaluru Authority (GBA) Five Corporations',
          type: 'municipal_corporation',
          status: 'pending_reconciliation',
          units_count: 5,
          levels: ['authority', 'corporation', 'zone', 'ward'],
          legal_date: '2025-09-30',
          source: 'https://gba.karnataka.gov.in/KnowYourNewCorporation/index.html',
          corporations: ['Central', 'North', 'South', 'East', 'West'],
        },
        {
          scheme_id: 'bbmp_historic_198',
          name: 'Bruhat Bengaluru Mahanagara Palike (Legacy 8 Zones / 198 Wards)',
          type: 'historic_municipal',
          status: 'legacy_reference',
          units_count: 198,
          levels: ['corporation', 'zone', 'ward'],
          legal_date: '2020-10-03',
          source: 'https://bbmp.gov.in/',
        },
      ];

    case 'chennai':
      return [
        {
          scheme_id: 'gcc_administrative_2022',
          name: 'Greater Chennai Corporation (GCC)',
          type: 'municipal_corporation',
          status: 'verified',
          units_count: 200,
          levels: ['region', 'zone', 'ward'],
          legal_date: '2022-01-17',
          source_service:
            'https://gisgcc.chennaicorporation.gov.in/server/rest/services/GCCPublic/GCC_AdminBoundary/MapServer',
          layers: {
            regions: { layer_id: 6, count: 3, names: ['North', 'Central', 'South'] },
            zones: { layer_id: 5, count: 15 },
            wards: { layer_id: 4, count: 200 },
          },
        },
      ];

    case 'mumbai':
      return [
        {
          scheme_id: 'bmc_administrative_wards',
          name: 'Brihanmumbai Municipal Corporation (BMC)',
          type: 'municipal_corporation',
          status: 'baseline_identified',
          units_count: 24,
          levels: ['corporation', 'administrative_ward'],
          legal_date: '2023-01-01',
          source: 'https://portal.mcgm.gov.in/',
          wards: [
            'A', 'B', 'C', 'D', 'E', 'F North', 'F South', 'G North', 'G South',
            'H East', 'H West', 'K East', 'K West', 'L', 'M East', 'M West',
            'N', 'P North', 'P South', 'R North', 'R Central', 'R South', 'S', 'T'
          ],
        },
      ];

    case 'delhi':
      return [
        {
          scheme_id: 'mcd_zones_wards_2022',
          name: 'Municipal Corporation of Delhi (MCD)',
          type: 'municipal_corporation',
          status: 'delimited_2022',
          units_count: 250,
          levels: ['corporation', 'zone', 'ward'],
          legal_date: '2022-10-17',
          source: 'https://mcdonline.nic.in/',
          zones_count: 12,
        },
        {
          scheme_id: 'ndmc_civil',
          name: 'New Delhi Municipal Council (NDMC)',
          type: 'special_municipal',
          status: 'active',
          units_count: 1,
          levels: ['council', 'civil_division'],
          legal_date: '2020-01-01',
          source: 'https://ndmc.gov.in/',
        },
        {
          scheme_id: 'delhi_cantonment',
          name: 'Delhi Cantonment Board',
          type: 'cantonment_board',
          status: 'active',
          units_count: 8,
          levels: ['cantonment', 'ward'],
          legal_date: '2020-01-01',
          source: 'https://delhi.cantt.gov.in/',
        },
      ];

    case 'noida':
      return [
        {
          scheme_id: 'noida_authority_sectors',
          name: 'New Okhla Industrial Development Authority (NOIDA)',
          type: 'development_authority',
          status: 'baseline_identified',
          levels: ['authority', 'work_circle', 'sector'],
          legal_date: '2020-01-01',
          source: 'https://umd.nic.in/noida/',
        },
      ];

    default:
      return [
        {
          scheme_id: `${city.id}_primary_scheme`,
          name: `${city.name} Local Administrative Structure`,
          type: 'municipal_corporation',
          status:
            city.capabilities.jurisdiction === 'verified'
              ? 'verified'
              : 'pending_acquisition',
          structure_summary: city.structure_summary,
          legal_date: '2026-10-16',
        },
      ];
  }
}

function buildRegionManifest(city: CityEntry) {
  const isBengaluru = city.id === 'bengaluru';

  return {
    schema_version: '1.0.0',
    region_id: city.id,
    publication_id: `pub_${city.id}_20261016_v1`,
    active_version: '2026.10.16',
    discovery_footprint: {
      label_anchor: city.center,
      bounds: city.bounds,
      scope: city.structure_summary,
      geometry_version: '2026.10.16',
      provenance: {
        source: 'Official Gazette / Municipal GIS / LGD',
        crs: 'EPSG:4326',
        license: 'Open Government Data / Municipal Boundary Review',
      },
    },
    jurisdiction_schemes: getCityJurisdictionSchemes(city),
    road_release: isBengaluru
      ? {
          release_id: 'bengaluru_urban_osm_20261015',
          status: 'indexed',
          scope: 'bengaluru_urban_administrative_district',
          source: 'OpenStreetMap complete motor-road extract',
          osm_relation_id: 2020589,
          crs: 'EPSG:4326',
          tileset_url: '/api/v1/map/tiles/roads/bengaluru/{z}/{x}/{y}.pbf',
          format: 'mvt',
          min_zoom: 6,
          max_zoom: 16,
        }
      : {
          release_id: null,
          status: 'pending',
          scope: 'none',
          source: null,
          tileset_url: null,
          format: 'mvt',
          notice: city.notice,
        },
    membership_release: isBengaluru
      ? {
          release_id: 'mem_bengaluru_urban_20261015',
          status: 'verified',
          road_release_id: 'bengaluru_urban_osm_20261015',
          boundary_release_id: 'bengaluru_urban_district_2020589',
          computed_at: '2026-10-15T00:00:00Z',
        }
      : {
          release_id: null,
          status: 'pending',
          road_release_id: null,
          boundary_release_id: null,
          computed_at: null,
        },
    summary_reference: {
      snapshot_id: `snap_${city.id}_20261016`,
      as_of: '2026-10-16T00:00:00Z',
      endpoint: `/api/v1/map/summary?city=${city.id}`,
      coverage_state:
        city.capabilities.road_coverage === 'indexed'
          ? 'inside_indexed_coverage'
          : 'pending',
    },
    capabilities: city.capabilities,
    format: 'mvt',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(
  req: NextRequest | Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await context?.params;
    const rawId = resolvedParams?.id;

    if (!rawId) {
      return NextResponse.json(
        { error: 'Region ID parameter is required' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const city = getCityById(rawId);
    if (!city) {
      return NextResponse.json(
        {
          error: `Region '${rawId}' not found in catalogue`,
          requested_id: rawId,
        },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const manifest = buildRegionManifest(city);

    return NextResponse.json(manifest, {
      status: 200,
      headers: MANIFEST_CACHE_HEADERS,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to generate region manifest' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
