import { NextRequest, NextResponse } from 'next/server.js';
import fs from 'node:fs';
import path from 'node:path';
import { query } from '../../../../../../../../../db/client.ts';

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

  // 2a. Check if pre-rendered tile file exists on disk
  try {
    const diskPath = path.resolve(
      process.cwd(),
      'output',
      'tiles',
      normalizedCity,
      String(zInt),
      String(xInt),
      `${yInt}.mvt`
    );

    if (fs.existsSync(diskPath)) {
      const diskBuffer = fs.readFileSync(diskPath);
      if (!diskBuffer || diskBuffer.length === 0) {
        return new Response(null, {
          status: 204,
          headers: {
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      return new Response(diskBuffer, {
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
    // Disk read error or not present in local filesystem; proceed to R2 / PostGIS
  }

  // 2b. Check Cloudflare R2 bucket: PUBLIC_DERIVATIVES_BUCKET
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
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        return new Response(r2Buffer, {
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
    // R2 lookup failed; proceed to PostGIS fallback
  }

  // 2c. Fallback for development/on-demand: Query PostGIS dynamically using ST_AsMVT
  try {
    const tileSql = `
      WITH bounds AS (
        SELECT ST_TileEnvelope($1, $2, $3) AS geom_3857,
               ST_Transform(ST_TileEnvelope($1, $2, $3), 4326) AS geom_4326
      ),
      mvtdata AS (
        SELECT
          rs.id,
          rs.road_id,
          r.name,
          r.ref,
          r.road_class,
          rs.chainage_from,
          rs.chainage_to,
          ST_AsMVTGeom(
            ST_Transform(rs.geom, 3857),
            b.geom_3857,
            4096,
            64,
            true
          ) AS geom
        FROM bounds b
        JOIN road_segments rs ON rs.is_active = true AND rs.geom && b.geom_4326
        LEFT JOIN roads r ON rs.road_id = r.id
        WHERE ST_Intersects(rs.geom, b.geom_4326)
      )
      SELECT ST_AsMVT(mvtdata, 'roads', 4096, 'geom') AS mvt FROM mvtdata;
    `;

    const res = await query(tileSql, [zInt, xInt, yInt]);
    const mvt = res.rows[0]?.mvt;

    if (!mvt || mvt.length === 0) {
      return new Response(null, {
        status: 204,
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(mvt, {
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
