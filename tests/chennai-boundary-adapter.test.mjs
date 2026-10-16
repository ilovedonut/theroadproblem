import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ingestChennaiBoundaries,
  validateFeatures,
  CHENNAI_ARCGIS_BASE_URL,
} from '../scripts/adapters/chennai-gcc-adapter.mjs';
import { GET, OPTIONS } from '../src/app/api/v1/regions/[id]/jurisdictions/route.ts';

function computeSha256(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

test('Chennai GCC Boundary Adapter: Ingestion and Artifact Generation', async () => {
  const result = await ingestChennaiBoundaries({ dryRun: false, allowOfflineFallback: true });
  assert.ok(result.success, 'Ingestion should succeed');

  const outputDir = path.resolve('output/jurisdictions/chennai');
  assert.ok(fs.existsSync(path.join(outputDir, 'regions.geojson')), 'regions.geojson must exist');
  assert.ok(fs.existsSync(path.join(outputDir, 'zones.geojson')), 'zones.geojson must exist');
  assert.ok(fs.existsSync(path.join(outputDir, 'wards.geojson')), 'wards.geojson must exist');
  assert.ok(fs.existsSync(path.join(outputDir, 'audit.json')), 'audit.json must exist');
});

test('Chennai GCC Boundary Adapter: Region Boundaries (Count === 3: North, Central, South)', () => {
  const filePath = path.resolve('output/jurisdictions/chennai/regions.geojson');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  assert.equal(data.type, 'FeatureCollection', 'Must be a GeoJSON FeatureCollection');
  assert.equal(data.features.length, 3, 'Region count must be exactly 3');

  const regionNames = data.features.map((f) => f.properties.region || f.properties.name);
  assert.ok(
    regionNames.some((n) => /north/i.test(n)),
    'Should contain North region'
  );
  assert.ok(
    regionNames.some((n) => /central/i.test(n)),
    'Should contain Central region'
  );
  assert.ok(
    regionNames.some((n) => /south/i.test(n)),
    'Should contain South region'
  );

  // Validate geometry
  assert.doesNotThrow(() => validateFeatures('regions', data.features, 3));
});

test('Chennai GCC Boundary Adapter: Zone Boundaries (Count === 15: Zones 01 to 15)', () => {
  const filePath = path.resolve('output/jurisdictions/chennai/zones.geojson');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  assert.equal(data.type, 'FeatureCollection', 'Must be a GeoJSON FeatureCollection');
  assert.equal(data.features.length, 15, 'Zone count must be exactly 15');

  const zoneNums = data.features
    .map((f) => parseInt(f.properties.zone_number ?? f.properties.zone, 10))
    .sort((a, b) => a - b);

  assert.equal(zoneNums.length, 15);
  for (let z = 1; z <= 15; z++) {
    assert.ok(zoneNums.includes(z), `Zone ${z} must be present`);
  }

  // Validate geometry
  assert.doesNotThrow(() => validateFeatures('zones', data.features, 15));
});

test('Chennai GCC Boundary Adapter: Ward Boundaries (Count === 200: Wards 1 to 200)', () => {
  const filePath = path.resolve('output/jurisdictions/chennai/wards.geojson');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  assert.equal(data.type, 'FeatureCollection', 'Must be a GeoJSON FeatureCollection');
  assert.equal(data.features.length, 200, 'Ward count must be exactly 200');

  const wardNums = data.features
    .map((f) => parseInt(f.properties.ward_number ?? f.properties.ward, 10))
    .sort((a, b) => a - b);

  assert.equal(wardNums.length, 200);
  assert.equal(wardNums[0], 1, 'First ward number must be 1');
  assert.equal(wardNums[wardNums.length - 1], 200, 'Last ward number must be 200');

  // Validate geometry
  assert.doesNotThrow(() => validateFeatures('wards', data.features, 200));
});

test('Chennai GCC Boundary Adapter: EPSG:4326 Geometry Validity within Chennai Bounds', () => {
  const CHENNAI_BBOX = {
    minLon: 80.0,
    maxLon: 80.5,
    minLat: 12.7,
    maxLat: 13.5,
  };

  const layers = ['regions.geojson', 'zones.geojson', 'wards.geojson'];

  for (const fileName of layers) {
    const filePath = path.resolve('output/jurisdictions/chennai', fileName);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    for (const feature of data.features) {
      assert.ok(feature.geometry, `Feature must have geometry in ${fileName}`);
      assert.ok(
        ['Polygon', 'MultiPolygon'].includes(feature.geometry.type),
        `Geometry type must be Polygon or MultiPolygon in ${fileName}`
      );

      const rings =
        feature.geometry.type === 'Polygon'
          ? feature.geometry.coordinates
          : feature.geometry.coordinates.flat(1);

      for (const ring of rings) {
        assert.ok(ring.length >= 4, 'Linear ring must have at least 4 coordinates');
        const first = ring[0];
        const last = ring[ring.length - 1];
        assert.equal(first[0], last[0], 'Linear ring must be closed (lon)');
        assert.equal(first[1], last[1], 'Linear ring must be closed (lat)');

        for (const [lon, lat] of ring) {
          assert.equal(typeof lon, 'number', 'Longitude must be a number');
          assert.equal(typeof lat, 'number', 'Latitude must be a number');
          assert.ok(!Number.isNaN(lon) && !Number.isNaN(lat), 'Coordinates must not be NaN');
          assert.ok(
            lon >= CHENNAI_BBOX.minLon && lon <= CHENNAI_BBOX.maxLon,
            `Longitude ${lon} within Chennai bounds`
          );
          assert.ok(
            lat >= CHENNAI_BBOX.minLat && lat <= CHENNAI_BBOX.maxLat,
            `Latitude ${lat} within Chennai bounds`
          );
        }
      }
    }
  }
});

test('Chennai GCC Boundary Adapter: Audit Log & Checksum Lineage', () => {
  const auditPath = path.resolve('output/jurisdictions/chennai/audit.json');
  assert.ok(fs.existsSync(auditPath), 'audit.json must exist');

  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  assert.equal(audit.sourceUrl, CHENNAI_ARCGIS_BASE_URL, 'Source URL must match official ArcGIS server');
  assert.ok(audit.license, 'License statement must be present');
  assert.ok(audit.retrievedAt, 'retrievedAt timestamp must be present');
  assert.equal(audit.totalFeatures, 218, 'Total features in audit must equal 3 + 15 + 200 = 218');

  // Verify file hashes match audit records
  for (const [key, layerMeta] of Object.entries(audit.layers)) {
    const filePath = path.resolve('output/jurisdictions/chennai', layerMeta.fileName);
    const computedHash = computeSha256(filePath);
    assert.equal(
      layerMeta.sha256,
      computedHash,
      `SHA-256 for ${key} must match recorded audit checksum`
    );
  }
});

test('Chennai GCC Boundary Adapter: Dry-Run and Cache Fallback Resilience', async () => {
  const dryResult = await ingestChennaiBoundaries({ dryRun: true, allowOfflineFallback: true });
  assert.ok(dryResult.success, 'Dry run must succeed using cache or live feed');
  assert.equal(dryResult.dryRun, true, 'dryRun flag must be true');
});

test('API Route: GET /api/v1/regions/[id]/jurisdictions', async () => {
  // 1. Chennai regions
  const reqRegions = new Request('http://localhost:3000/api/v1/regions/chennai/jurisdictions?scheme=regions');
  const resRegions = await GET(reqRegions, { params: Promise.resolve({ id: 'chennai' }) });
  assert.equal(resRegions.status, 200);
  assert.ok(resRegions.headers.get('cache-control')?.includes('max-age=3600'));
  const bodyRegions = await resRegions.json();
  assert.equal(bodyRegions.features.length, 3);

  // 2. Chennai zones
  const reqZones = new Request('http://localhost:3000/api/v1/regions/chennai/jurisdictions?scheme=zones');
  const resZones = await GET(reqZones, { params: Promise.resolve({ id: 'chennai' }) });
  assert.equal(resZones.status, 200);
  const bodyZones = await resZones.json();
  assert.equal(bodyZones.features.length, 15);

  // 3. Chennai wards
  const reqWards = new Request('http://localhost:3000/api/v1/regions/chennai/jurisdictions?scheme=wards');
  const resWards = await GET(reqWards, { params: Promise.resolve({ id: 'chennai' }) });
  assert.equal(resWards.status, 200);
  const bodyWards = await resWards.json();
  assert.equal(bodyWards.features.length, 200);

  // 4. Missing scheme -> 404
  const reqNoScheme = new Request('http://localhost:3000/api/v1/regions/chennai/jurisdictions');
  const resNoScheme = await GET(reqNoScheme, { params: Promise.resolve({ id: 'chennai' }) });
  assert.equal(resNoScheme.status, 404);

  // 5. Unknown scheme -> 404
  const reqUnknown = new Request('http://localhost:3000/api/v1/regions/chennai/jurisdictions?scheme=nonexistent');
  const resUnknown = await GET(reqUnknown, { params: Promise.resolve({ id: 'chennai' }) });
  assert.equal(resUnknown.status, 404);

  // 6. Delimitation pending (Bengaluru) -> 404
  const reqPending = new Request('http://localhost:3000/api/v1/regions/bengaluru/jurisdictions?scheme=corporations');
  const resPending = await GET(reqPending, { params: Promise.resolve({ id: 'bengaluru' }) });
  assert.equal(resPending.status, 404);
  const bodyPending = await resPending.json();
  assert.equal(bodyPending.status, 'pending');

  // 7. OPTIONS preflight -> 204
  const resOptions = await OPTIONS();
  assert.equal(resOptions.status, 204);
  assert.equal(resOptions.headers.get('access-control-allow-origin'), '*');
});
