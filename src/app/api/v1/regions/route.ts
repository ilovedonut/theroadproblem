import { NextRequest, NextResponse } from 'next/server.js';
import {
  getAllCities,
  getCitiesByMetro,
  searchCities,
} from '../../../../lib/city-catalogue.ts';
import type { CityEntry } from '../../../../lib/city-catalogue.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=300',
  ...CORS_HEADERS,
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(req: NextRequest | Request) {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get('query') || url.searchParams.get('q');
    const metro = url.searchParams.get('metro');

    let results: CityEntry[] = getAllCities();

    if (metro && metro.trim()) {
      results = getCitiesByMetro(metro.trim());
    }

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      results = results.filter((city) => {
        return (
          city.id.toLowerCase().includes(q) ||
          city.name.toLowerCase().includes(q) ||
          city.local_name.toLowerCase().includes(q) ||
          city.state.toLowerCase().includes(q) ||
          city.aliases.some((a) => a.toLowerCase().includes(q)) ||
          (city.metro_group && city.metro_group.toLowerCase().includes(q)) ||
          city.structure_summary.toLowerCase().includes(q)
        );
      });
    }

    return NextResponse.json(results, {
      status: 200,
      headers: CACHE_HEADERS,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to retrieve regions catalogue' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
