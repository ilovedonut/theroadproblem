import { NextRequest, NextResponse } from 'next/server.js';
import fs from 'node:fs';
import path from 'node:path';
import { withTransaction } from '../../../../../../../../../db/client.ts';
import { getCityById } from '../../../../../../../../../lib/city-catalogue.ts';

interface RouteContext {
  params: Promise<{
    id?: string;
    city?: string;
    version: string;
    z: string;
    x: string;
    y: string;
  }>;
}

/**
 * Helper to safely resolve Cloudflare R2 bucket binding if running on the edge.
 */
async function getR2Bucket(): Promise<any | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx?.env as Record<string, any> | undefined;
    if (env?.PUBLIC_DERIVATIVES_BUCKET) {
      return env.PUBLIC_DERIVATIVES_BUCKET;
    }
  } catch {
    // Not running inside Cloudflare worker environment
  }

  // Check global / worker bindings fallback
  const globalEnv =
    (globalThis as any).env ||
    (globalThis as any)[Symbol.for('__cloudflare-context__')]?.env;
  if (globalEnv?.PUBLIC_DERIVATIVES_BUCKET) {
    return globalEnv.PUBLIC_DERIVATIVES_BUCKET;
  }

  return null;
}

/**
 * Zoom hierarchy SQL filter:
 * - Zoom 10-11: Major highways only and official corridors.
 * - Zoom 12-13: Secondary, tertiary, and collectors.
 * - Zoom 14+: All active motor carriageways.
 */
function getZoomHierarchyFilter(z: number): string {
  if (z <= 11) {
    const majorClasses =
      "'motorway','trunk','primary','secondary','tertiary','motorway_link','trunk_link','primary_link','secondary_link'";
    return `AND (COALESCE(rs.road_class, r.road_class) IN (${majorClasses}) OR r.is_official_corridor = true)`;
  } else if (z <= 13) {
    const collectorClasses =
      "'motorway','trunk','primary','secondary','tertiary','motorway_link','trunk_link','primary_link','secondary_link','tertiary_link','unclassified','road'";
    return `AND (COALESCE(rs.road_class, r.road_class) IN (${collectorClasses}) OR r.is_official_corridor = true)`;
  } else {
    // Zoom 14+: All active motor carriageways
    return ``;
  }
}

/**
 * Generate a single MVT tile directly using PostGIS native functions:
 * ST_TileEnvelope and ST_AsMVT with ST_AsMVTGeom, bounded with a 5-second statement timeout.
 */
async function buildRoadTile(z: number, x: number, y: number): Promise<Buffer> {
  const zoomFilter = getZoomHierarchyFilter(z);
  const sql = `
    WITH bounds AS (
      SELECT
        ST_TileEnvelope($1, $2, $3) AS geom_3857,
        ST_Transform(ST_TileEnvelope($1, $2, $3), 4326) AS geom_4326
    ),
    tile_features AS (
      SELECT
        rs.id,
        rs.road_id,
        r.name,
        r.ref,
        COALESCE(rs.road_class, r.road_class) AS road_class,
        r.authority_name,
        rs.chainage_from,
        rs.chainage_to,
        ST_AsMVTGeom(
          ST_Transform(rs.geom, 3857),
          b.geom_3857,
          4096,
          64,
          true
        ) AS geom
      FROM road_segments rs
      LEFT JOIN roads r ON rs.road_id = r.id
      CROSS JOIN bounds b
      WHERE rs.is_active = true
        AND (rs.usage_category IS NULL OR rs.usage_category IN ('public_motor', 'restricted_motor'))
        AND rs.geom && b.geom_4326
        AND ST_Intersects(rs.geom, b.geom_4326)
        ${zoomFilter}
    )
    SELECT ST_AsMVT(tile_features, 'roads', 4096, 'geom') AS mvt
    FROM tile_features
    WHERE geom IS NOT NULL
  `;

  return withTransaction(async (client) => {
    await client.query("SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = '5000'; SET LOCAL lock_timeout = '2000'");
    const res = await client.query(sql, [z, x, y]);
    const mvt = res.rows[0]?.mvt;
    return Buffer.isBuffer(mvt) ? mvt : Buffer.alloc(0);
  });
}

export async function GET(req: NextRequest, context: RouteContext) {
  const resolved = await context.params;
  const city = resolved.id || resolved.city || '';
  const { version, z, x, y } = resolved;

  // 1. Parameter extraction and validation
  if (!city || !version || typeof city !== 'string' || typeof version !== 'string') {
    return NextResponse.json(
      { error: 'City and version must be valid non-empty strings' },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  // Support both raw numeric coordinate or coordinate with .mvt extension
  const yClean = y?.endsWith('.mvt') ? y.slice(0, -4) : y;

  if (
    !/^\d+$/.test(z || '') ||
    !/^\d+$/.test(x || '') ||
    !/^\d+$/.test(yClean || '')
  ) {
    return NextResponse.json(
      { error: 'Tile coordinates z, x, and y must be positive integers' },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  const zInt = parseInt(z, 10);
  const xInt = parseInt(x, 10);
  const yInt = parseInt(yClean, 10);

  // Validate zoom range (10 - 18)
  if (zInt < 10 || zInt > 18) {
    return NextResponse.json(
      { error: `Zoom level ${zInt} out of range. Supported range is 10 to 18.` },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  // Validate tile coordinate bounds at zoom level z
  const maxTile = Math.pow(2, zInt);
  if (xInt < 0 || xInt >= maxTile || yInt < 0 || yInt >= maxTile) {
    return NextResponse.json(
      { error: `Tile coordinates (${xInt}, ${yInt}) out of bounds for zoom level ${zInt}` },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  const normalizedCity = city.toLowerCase().trim();
  const etag = `"w/${normalizedCity}-${version}-${zInt}-${xInt}-${yInt}"`;

  // Check client If-None-Match cache header
  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `W/${etag.slice(1)}`)) {
    return new Response(null, {
      status: 304,
      headers: {
        'ETag': etag,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Lookup Priority 1: Check public/tiles/roads/${city}/${version}/${zInt}/${xInt}/${yInt}.mvt
  try {
    const publicDiskPath = path.resolve(
      process.cwd(),
      'public',
      'tiles',
      'roads',
      normalizedCity,
      version,
      String(zInt),
      String(xInt),
      `${yInt}.mvt`
    );

    if (fs.existsSync(publicDiskPath)) {
      const publicBuffer = fs.readFileSync(publicDiskPath);
      if (!publicBuffer || publicBuffer.length === 0) {
        return new Response(null, {
          status: 204,
          headers: {
            'Cache-Control': 'public, max-age=31536000, immutable',
            'ETag': etag,
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      return new Response(new Uint8Array(publicBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.mapbox-vector-tile',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'ETag': etag,
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  } catch (err) {
    // Proceed to Priority 2
  }

  // Lookup Priority 2: Check output/tiles/${city}/${zInt}/${xInt}/${yInt}.mvt
  try {
    const outputDiskPath = path.resolve(
      process.cwd(),
      'output',
      'tiles',
      normalizedCity,
      String(zInt),
      String(xInt),
      `${yInt}.mvt`
    );

    if (fs.existsSync(outputDiskPath)) {
      const diskBuffer = fs.readFileSync(outputDiskPath);
      if (!diskBuffer || diskBuffer.length === 0) {
        return new Response(null, {
          status: 204,
          headers: {
            'Cache-Control': 'public, max-age=31536000, immutable',
            'ETag': etag,
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      return new Response(new Uint8Array(diskBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.mapbox-vector-tile',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'ETag': etag,
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  } catch (err) {
    // Proceed to Priority 3
  }

  // Lookup Priority 3: Check Cloudflare R2 bucket (PUBLIC_DERIVATIVES_BUCKET)
  try {
    const r2Bucket = await getR2Bucket();
    if (r2Bucket) {
      const r2Key = `roads/${normalizedCity}/${version}/${zInt}/${xInt}/${yInt}.mvt`;
      const obj = await r2Bucket.get(r2Key);
      if (obj) {
        const arrayBuf = await obj.arrayBuffer();
        const r2Buffer = Buffer.from(arrayBuf);
        if (!r2Buffer || r2Buffer.length === 0) {
          return new Response(null, {
            status: 204,
            headers: {
              'Cache-Control': 'public, max-age=31536000, immutable',
              'ETag': etag,
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        return new Response(new Uint8Array(r2Buffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.mapbox-vector-tile',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'ETag': etag,
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }
  } catch (err) {
    // Proceed to Priority 4
  }

  // Lookup Priority 4: PostGIS dynamic fallback using buildRoadTile with zoom hierarchy & 5s timeout
  // Only attempt dynamic PostGIS generation for indexed cities (bengaluru).
  // NEVER fall back to Bengaluru or invent geometry for an unindexed city!
  const cityEntry = getCityById(normalizedCity);
  const isIndexedCity = normalizedCity === 'bengaluru' || (cityEntry && cityEntry.capabilities.road_coverage === 'indexed');

  if (!isIndexedCity) {
    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'ETag': etag,
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    const mvt = await buildRoadTile(zInt, xInt, yInt);

    if (!mvt || mvt.length === 0) {
      return new Response(null, {
        status: 204,
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
          'ETag': etag,
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(new Uint8Array(mvt), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.mapbox-vector-tile',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'ETag': etag,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (dbErr: any) {
    console.error('Dynamic tile generation error:', dbErr);
    return NextResponse.json(
      { error: 'Failed to generate vector tile', details: dbErr?.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
    },
  });
}
