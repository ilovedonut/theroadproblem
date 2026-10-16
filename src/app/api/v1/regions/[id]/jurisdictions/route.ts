import { NextRequest, NextResponse } from 'next/server.js';
import fs from 'node:fs';
import path from 'node:path';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const regionId = (id || '').toLowerCase().trim();

    // Prevent directory traversal or invalid characters
    if (!regionId || !/^[a-z0-9_-]+$/.test(regionId)) {
      return NextResponse.json(
        { error: 'Invalid region ID format' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const { searchParams } = new URL(req.url);
    const scheme = searchParams.get('scheme')?.toLowerCase().trim();

    if (!scheme) {
      return NextResponse.json(
        { error: "Query parameter 'scheme' is required (e.g. ?scheme=regions, ?scheme=zones, ?scheme=wards)" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    if (!/^[a-z0-9_-]+$/.test(scheme)) {
      return NextResponse.json(
        { error: 'Invalid scheme name format' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const filePath = path.resolve(process.cwd(), 'output/jurisdictions', regionId, `${scheme}.geojson`);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        {
          error: `Jurisdiction scheme '${scheme}' for region '${regionId}' not found`,
          region: regionId,
          scheme,
        },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const rawContent = fs.readFileSync(filePath, 'utf8');
    const geoJson = JSON.parse(rawContent);

    // Return 404 if scheme or city status is pending / delimitation_pending
    if (
      geoJson.status === 'pending' ||
      geoJson.status === 'delimitation_pending' ||
      geoJson.delimitation_status === 'pending' ||
      geoJson.pending === true
    ) {
      return NextResponse.json(
        {
          error: `Jurisdiction scheme '${scheme}' for region '${regionId}' is pending delimitation`,
          region: regionId,
          scheme,
          status: 'pending',
          notice: geoJson.notice || 'Delimitation pending official notification.',
        },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(geoJson, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/geo+json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=300',
      },
    });
  } catch (error: any) {
    console.error('Error serving jurisdiction boundary:', error);
    return NextResponse.json(
      { error: 'Internal server error reading jurisdiction boundaries' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
