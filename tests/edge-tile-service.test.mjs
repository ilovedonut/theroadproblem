import '../scripts/test-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../src/db/client.ts';
import { GET as getManifest, OPTIONS as optionsManifest } from '../src/app/api/v1/roads/[id]/manifest/route.ts';
import { GET as getTile, OPTIONS as optionsTile } from '../src/app/api/v1/roads/[id]/[version]/[z]/[x]/[y]/route.ts';
import { GET as getMapSummary } from '../src/app/api/v1/map/summary/route.ts';
import { GET as getRegionSummary } from '../src/app/api/v1/regions/[id]/summary/route.ts';

test.describe('Edge Road Tile Service Suite', () => {
  // Clean up database pool connections after all tests finish
  test.after(async () => {
    try {
      await pool.end();
    } catch {
      // Ignore if pool already closed
    }
  });

  test('1. GET /api/v1/roads/bengaluru/manifest - City Manifest Verification', async () => {
    const req = new Request('http://localhost/api/v1/roads/bengaluru/manifest', {
      method: 'GET',
    });

    const res = await getManifest(req, {
      params: Promise.resolve({ city: 'bengaluru' }),
    });

    assert.equal(res.status, 200, 'Manifest must return HTTP 200');
    assert.equal(
      res.headers.get('cache-control'),
      'public, max-age=300, stale-while-revalidate=60',
      'Must have Cache-Control header'
    );
    assert.equal(
      res.headers.get('access-control-allow-origin'),
      '*',
      'Must have Access-Control-Allow-Origin: *'
    );

    const body = await res.json();
    assert.equal(body.city, 'bengaluru');
    assert.equal(body.status, 'indexed');
    assert.equal(body.active_version, '20261016');
    assert.equal(
      body.tile_template,
      '/api/v1/roads/bengaluru/20261016/{z}/{x}/{y}.mvt'
    );
    assert.equal(
      body.tileset_url,
      '/api/v1/roads/bengaluru/20261016/{z}/{x}/{y}.mvt'
    );
    assert.deepEqual(body.bounds, [77.475902, 12.817922, 77.738359, 13.153546]);
    assert.equal(body.min_zoom, 10);
    assert.equal(body.max_zoom, 16);
    assert.equal(body.source_date, '2026-10-16T00:00:00.000Z');
    assert.equal(body.format, 'mvt');
  });

  test('2. Manifest OPTIONS & Unsupported City', async () => {
    // OPTIONS preflight
    const optRes = await optionsManifest();
    assert.equal(optRes.status, 204);
    assert.equal(optRes.headers.get('access-control-allow-origin'), '*');

    // Unsupported city
    const req = new Request('http://localhost/api/v1/roads/atlantis/manifest');
    const res = await getManifest(req, {
      params: Promise.resolve({ city: 'atlantis' }),
    });
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');

    // Unindexed city (Chennai) returns status: 'pending', tileset_url: null
    const chennaiReq = new Request('http://localhost/api/v1/roads/chennai/manifest');
    const chennaiRes = await getManifest(chennaiReq, {
      params: Promise.resolve({ city: 'chennai' }),
    });
    assert.equal(chennaiRes.status, 200);
    const chennaiBody = await chennaiRes.json();
    assert.equal(chennaiBody.city, 'chennai');
    assert.equal(chennaiBody.status, 'pending');
    assert.equal(chennaiBody.tileset_url, null);
    assert.equal(chennaiBody.tile_template, null);
  });

  test('3. GET /api/v1/roads/bengaluru/20261016/14/11723/7596 - Sample Bengaluru Road Tile', async () => {
    const req = new Request(
      'http://localhost/api/v1/roads/bengaluru/20261016/14/11723/7596',
      { method: 'GET' }
    );

    const res = await getTile(req, {
      params: Promise.resolve({
        city: 'bengaluru',
        version: '20261016',
        z: '14',
        x: '11723',
        y: '7596',
      }),
    });

    assert.equal(res.status, 200, 'Tile must return HTTP 200');
    assert.equal(
      res.headers.get('content-type'),
      'application/vnd.mapbox-vector-tile',
      'Content-Type must be application/vnd.mapbox-vector-tile'
    );
    assert.equal(
      res.headers.get('cache-control'),
      'public, max-age=31536000, immutable',
      'Cache-Control must be immutable'
    );
    assert.equal(
      res.headers.get('etag'),
      '"w/bengaluru-20261016-14-11723-7596"',
      'ETag must match format'
    );
    assert.equal(
      res.headers.get('access-control-allow-origin'),
      '*',
      'Access-Control-Allow-Origin must be *'
    );

    const buffer = await res.arrayBuffer();
    assert.ok(buffer.byteLength > 0, 'Tile buffer must not be empty');
  });

  test('4. Tile Route - .mvt URL Extension & 304 If-None-Match Caching', async () => {
    // 4a. With .mvt suffix
    const reqWithExt = new Request(
      'http://localhost/api/v1/roads/bengaluru/20261016/14/11723/7596.mvt'
    );
    const resWithExt = await getTile(reqWithExt, {
      params: Promise.resolve({
        city: 'bengaluru',
        version: '20261016',
        z: '14',
        x: '11723',
        y: '7596.mvt',
      }),
    });
    assert.equal(resWithExt.status, 200);
    assert.equal(
      resWithExt.headers.get('etag'),
      '"w/bengaluru-20261016-14-11723-7596"'
    );

    // 4b. If-None-Match cache validation
    const cachedReq = new Request(
      'http://localhost/api/v1/roads/bengaluru/20261016/14/11723/7596',
      {
        headers: {
          'if-none-match': '"w/bengaluru-20261016-14-11723-7596"',
        },
      }
    );
    const cachedRes = await getTile(cachedReq, {
      params: Promise.resolve({
        city: 'bengaluru',
        version: '20261016',
        z: '14',
        x: '11723',
        y: '7596',
      }),
    });
    assert.equal(cachedRes.status, 304, 'ETag match must return 304 Not Modified');
  });

  test('5. Invalid Coordinates & Validation (Returning 400)', async () => {
    const invalidCases = [
      { z: 'abc', x: '11723', y: '7596', label: 'non-numeric z' },
      { z: '14', x: 'xyz', y: '7596', label: 'non-numeric x' },
      { z: '14', x: '11723', y: 'bad', label: 'non-numeric y' },
      { z: '9', x: '200', y: '200', label: 'zoom below 10' },
      { z: '19', x: '200', y: '200', label: 'zoom above 18' },
      { z: '14', x: '-1', y: '7596', label: 'negative coordinate' },
      { z: '14', x: '999999', y: '7596', label: 'x out of bounds for zoom' },
      { z: '14', x: '11723', y: '999999', label: 'y out of bounds for zoom' },
    ];

    for (const testCase of invalidCases) {
      const req = new Request(
        `http://localhost/api/v1/roads/bengaluru/20261016/${testCase.z}/${testCase.x}/${testCase.y}`
      );
      const res = await getTile(req, {
        params: Promise.resolve({
          city: 'bengaluru',
          version: '20261016',
          z: testCase.z,
          x: testCase.x,
          y: testCase.y,
        }),
      });

      assert.equal(
        res.status,
        400,
        `Expected 400 for ${testCase.label}, received ${res.status}`
      );
      assert.equal(
        res.headers.get('access-control-allow-origin'),
        '*',
        'Error responses must also include CORS header'
      );
    }
  });

  test('6. Pre-rendered Disk Tile Lookup Priority', async () => {
    const testTilePath = path.resolve(
      process.cwd(),
      'output',
      'tiles',
      'bengaluru',
      '14',
      '9999',
      '9999.mvt'
    );

    // Create dummy pre-rendered tile on disk
    fs.mkdirSync(path.dirname(testTilePath), { recursive: true });
    const dummyMvtContent = Buffer.from('MVT_TEST_DISK_PAYLOAD_BINARY');
    fs.writeFileSync(testTilePath, dummyMvtContent);

    try {
      const req = new Request(
        'http://localhost/api/v1/roads/bengaluru/20261016/14/9999/9999'
      );
      const res = await getTile(req, {
        params: Promise.resolve({
          city: 'bengaluru',
          version: '20261016',
          z: '14',
          x: '9999',
          y: '9999',
        }),
      });

      assert.equal(res.status, 200);
      assert.equal(
        res.headers.get('content-type'),
        'application/vnd.mapbox-vector-tile'
      );
      const data = Buffer.from(await res.arrayBuffer());
      assert.deepEqual(data, dummyMvtContent, 'Must read from disk tile');
    } finally {
      // Clean up test tile
      if (fs.existsSync(testTilePath)) {
        fs.unlinkSync(testTilePath);
      }
      const dir = path.dirname(testTilePath);
      try {
        fs.rmdirSync(dir);
      } catch {}
    }
  });

  test('7. Cloudflare R2 Bucket Lookup Priority', async () => {
    const dummyR2Mvt = Buffer.from('MVT_TEST_R2_PAYLOAD_BINARY');
    const exactArrayBuffer = dummyR2Mvt.buffer.slice(
      dummyR2Mvt.byteOffset,
      dummyR2Mvt.byteOffset + dummyR2Mvt.byteLength
    );
    const mockContext = {
      env: {
        PUBLIC_DERIVATIVES_BUCKET: {
          get: async (key) => {
            if (key === 'roads/bengaluru/20261016/14/8888/8888.mvt') {
              return {
                arrayBuffer: async () => exactArrayBuffer,
              };
            }
            return null;
          },
        },
      },
    };

    const ctxSym = Symbol.for('__cloudflare-context__');
    const prevContext = globalThis[ctxSym];
    globalThis[ctxSym] = mockContext;

    try {
      const req = new Request(
        'http://localhost/api/v1/roads/bengaluru/20261016/14/8888/8888'
      );
      const res = await getTile(req, {
        params: Promise.resolve({
          city: 'bengaluru',
          version: '20261016',
          z: '14',
          x: '8888',
          y: '8888',
        }),
      });

      assert.equal(res.status, 200);
      assert.equal(
        res.headers.get('content-type'),
        'application/vnd.mapbox-vector-tile'
      );
      const data = Buffer.from(await res.arrayBuffer());
      assert.deepEqual(data, dummyR2Mvt, 'Must read from R2 bucket binding');
    } finally {
      globalThis[ctxSym] = prevContext;
    }
  });

  test('8. Empty Tile Returns 204 No Content', async () => {
    // Coordinate with 0 features in PostGIS (e.g. z=14, x=0, y=0 in the Arctic)
    const req = new Request(
      'http://localhost/api/v1/roads/bengaluru/20261016/14/0/0'
    );
    const res = await getTile(req, {
      params: Promise.resolve({
        city: 'bengaluru',
        version: '20261016',
        z: '14',
        x: '0',
        y: '0',
      }),
    });

    assert.equal(res.status, 204, 'Zero-feature tile must return 204 No Content');
    assert.equal(
      res.headers.get('cache-control'),
      'public, max-age=31536000, immutable'
    );
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });

  test('9. Tile OPTIONS Preflight', async () => {
    const res = await optionsTile();
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.ok(res.headers.get('access-control-allow-methods').includes('GET'));
  });

  test('10. Priority 1 - public/tiles/roads/... disk lookup priority', async () => {
    const publicTilePath = path.resolve(
      process.cwd(),
      'public',
      'tiles',
      'roads',
      'bengaluru',
      '20261016',
      '14',
      '9997',
      '9997.mvt'
    );

    fs.mkdirSync(path.dirname(publicTilePath), { recursive: true });
    const dummyPublicMvt = Buffer.from('MVT_TEST_PUBLIC_TILES_PAYLOAD');
    fs.writeFileSync(publicTilePath, dummyPublicMvt);

    try {
      const req = new Request('http://localhost/api/v1/roads/bengaluru/20261016/14/9997/9997');
      const res = await getTile(req, {
        params: Promise.resolve({
          city: 'bengaluru',
          version: '20261016',
          z: '14',
          x: '9997',
          y: '9997',
        }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/vnd.mapbox-vector-tile');
      assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      const data = Buffer.from(await res.arrayBuffer());
      assert.deepEqual(data, dummyPublicMvt, 'Must read from public/tiles/roads priority 1');
    } finally {
      if (fs.existsSync(publicTilePath)) {
        fs.unlinkSync(publicTilePath);
      }
      try {
        fs.rmdirSync(path.dirname(publicTilePath));
      } catch {}
    }
  });

  test('11. Unindexed City Tile Request Returns 204 No Content', async () => {
    const req = new Request('http://localhost/api/v1/roads/chennai/20261016/14/11723/7596');
    const res = await getTile(req, {
      params: Promise.resolve({
        city: 'chennai',
        version: '20261016',
        z: '14',
        x: '11723',
        y: '7596',
      }),
    });

    assert.equal(res.status, 204, 'Unindexed city must return 204 without inventing geometry');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });

  test('12. Area Summary - Prepared Named-Area Precomputed Snapshot', async () => {
    // 12a. /api/v1/map/summary?city=bengaluru
    const mapSummaryReq = new Request('http://localhost/api/v1/map/summary?city=bengaluru');
    const mapSummaryRes = await getMapSummary(mapSummaryReq);
    assert.equal(mapSummaryRes.status, 200);
    const mapSummaryData = await mapSummaryRes.json();
    assert.equal(mapSummaryData.snapshot_id, 'snap_bengaluru_20261016');
    assert.equal(mapSummaryData.scope, 'Bengaluru Urban · Administrative district');
    assert.equal(mapSummaryData.source_basis, 'named_area_snapshot');
    assert.equal(mapSummaryData.is_dynamic_viewport, false);
    assert.equal(mapSummaryData.coverage_state, 'inside_indexed_coverage');
    assert.equal(mapSummaryData.roads_indexed, true);
    assert.ok(mapSummaryData.roads > 0);

    // 12b. /api/v1/regions/bengaluru/summary
    const regSummaryReq = new Request('http://localhost/api/v1/regions/bengaluru/summary');
    const regSummaryRes = await getRegionSummary(regSummaryReq, { params: Promise.resolve({ id: 'bengaluru' }) });
    assert.equal(regSummaryRes.status, 200);
    const regSummaryData = await regSummaryRes.json();
    assert.equal(regSummaryData.snapshot_id, 'snap_bengaluru_20261016');
    assert.equal(regSummaryData.scope, 'Bengaluru Urban · Administrative district');
    assert.equal(regSummaryData.source_basis, 'named_area_snapshot');
    assert.equal(regSummaryData.is_dynamic_viewport, false);
    assert.equal(regSummaryData.roads_indexed, true);

    // 12c. /api/v1/map/summary?city=chennai (Unindexed City)
    const chennaiSummaryReq = new Request('http://localhost/api/v1/map/summary?city=chennai');
    const chennaiSummaryRes = await getMapSummary(chennaiSummaryReq);
    assert.equal(chennaiSummaryRes.status, 200);
    const chennaiSummaryData = await chennaiSummaryRes.json();
    assert.equal(chennaiSummaryData.snapshot_id, 'snap_chennai_20261016');
    assert.equal(chennaiSummaryData.roads_indexed, false);
    assert.equal(chennaiSummaryData.coverage_state, 'pending');
    assert.equal(chennaiSummaryData.is_dynamic_viewport, false);
  });
});
