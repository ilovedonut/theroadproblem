import { NextRequest, NextResponse } from 'next/server.js';
import { getCityById, resolveCityId } from '../../../../../../lib/city-catalogue.ts';

interface RouteContext {
  params: Promise<{ id?: string; city?: string }>;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MANIFEST_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
  ...CORS_HEADERS,
};

export async function GET(req: NextRequest, context: RouteContext) {
  const resolved = await context.params;
  const rawCity = resolved.id || resolved.city || '';
  if (!rawCity) {
    return NextResponse.json(
      { error: 'City identifier is required' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const cityEntry = getCityById(rawCity);

  if (!cityEntry) {
    return NextResponse.json(
      { error: `City '${rawCity}' is not supported or indexed yet.` },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  const isIndexed = cityEntry.id === 'bengaluru' || cityEntry.capabilities.road_coverage === 'indexed';

  if (isIndexed) {
    const manifest = {
      city: cityEntry.id,
      region_id: cityEntry.id,
      status: 'indexed',
      active_version: '20261016',
      tile_template: `/api/v1/roads/${cityEntry.id}/20261016/{z}/{x}/{y}.mvt`,
      tileset_url: `/api/v1/roads/${cityEntry.id}/20261016/{z}/{x}/{y}.mvt`,
      bounds: [77.475902, 12.817922, 77.738359, 13.153546] as [number, number, number, number],
      min_zoom: 10,
      max_zoom: 16,
      source_date: '2026-10-16T00:00:00.000Z',
      format: 'mvt',
    };

    return NextResponse.json(manifest, {
      status: 200,
      headers: MANIFEST_CACHE_HEADERS,
    });
  }

  // Unindexed city: explicitly status 'pending', tileset_url null.
  // NEVER fall back to Bengaluru or invent geometry for an unindexed city!
  const unindexedManifest = {
    city: cityEntry.id,
    region_id: cityEntry.id,
    status: 'pending',
    active_version: '20261016',
    tile_template: null,
    tileset_url: null,
    bounds: cityEntry.bounds,
    min_zoom: 10,
    max_zoom: 16,
    source_date: '2026-10-16T00:00:00.000Z',
    format: 'mvt',
    notice: cityEntry.notice,
  };

  return NextResponse.json(unindexedManifest, {
    status: 200,
    headers: MANIFEST_CACHE_HEADERS,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
