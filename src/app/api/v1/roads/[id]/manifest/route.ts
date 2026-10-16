import { NextRequest, NextResponse } from 'next/server.js';

interface RouteContext {
  params: Promise<{ id?: string; city?: string }>;
}

const CITY_METADATA: Record<
  string,
  {
    city: string;
    active_version: string;
    tile_template: string;
    bounds: [number, number, number, number];
    min_zoom: number;
    max_zoom: number;
    source_date: string;
    format: string;
  }
> = {
  bengaluru: {
    city: 'bengaluru',
    active_version: '20261016',
    tile_template: '/api/v1/roads/bengaluru/20261016/{z}/{x}/{y}.mvt',
    bounds: [77.475902, 12.817922, 77.738359, 13.153546],
    min_zoom: 10,
    max_zoom: 16,
    source_date: '2026-10-16T00:00:00.000Z',
    format: 'mvt',
  },
  bangalore: {
    city: 'bengaluru',
    active_version: '20261016',
    tile_template: '/api/v1/roads/bengaluru/20261016/{z}/{x}/{y}.mvt',
    bounds: [77.475902, 12.817922, 77.738359, 13.153546],
    min_zoom: 10,
    max_zoom: 16,
    source_date: '2026-10-16T00:00:00.000Z',
    format: 'mvt',
  },
};

export async function GET(req: NextRequest, context: RouteContext) {
  const resolved = await context.params;
  const city = resolved.id || resolved.city || '';
  const normalizedCity = city.toLowerCase().trim();

  const metadata = CITY_METADATA[normalizedCity];

  if (!metadata) {
    return NextResponse.json(
      { error: `City '${city}' is not supported or indexed yet.` },
      {
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  return NextResponse.json(metadata, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
