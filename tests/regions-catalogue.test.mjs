import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAllCities,
  getCityById,
  searchCities,
  getCitiesByMetro,
  resolveCityId,
} from '../src/lib/city-catalogue.ts';

import {
  GET as getRegions,
  OPTIONS as optionsRegions,
} from '../src/app/api/v1/regions/route.ts';

import {
  GET as getRegionManifest,
  OPTIONS as optionsRegionManifest,
} from '../src/app/api/v1/regions/[id]/manifest/route.ts';

test('1. City Catalogue: All 36 cities are present with complete metadata', async () => {
  const cities = getAllCities();
  assert.equal(cities.length, 36, 'Catalogue must contain exactly 36 scoped cities');

  const EXPECTED_SLUGS = [
    'bengaluru', 'hyderabad', 'chennai', 'coimbatore', 'kochi', 'thiruvananthapuram',
    'mumbai', 'pune', 'pimpri-chinchwad', 'ahmedabad', 'surat', 'jaipur',
    'nagpur', 'nashik', 'navi-mumbai', 'thane', 'delhi', 'gurugram',
    'noida', 'greater-noida', 'ghaziabad', 'faridabad', 'kolkata', 'lucknow',
    'kanpur', 'indore', 'bhopal', 'chandigarh', 'patna', 'bhubaneswar',
    'visakhapatnam', 'vijayawada', 'guwahati', 'ranchi', 'raipur', 'madurai',
  ];

  const slugs = cities.map((c) => c.id);
  for (const expected of EXPECTED_SLUGS) {
    assert.ok(slugs.includes(expected), `City '${expected}' must be present in catalogue`);
  }

  for (const city of cities) {
    assert.ok(city.id, 'City must have non-empty id');
    assert.ok(city.name, `${city.id} must have non-empty name`);
    assert.ok(city.local_name, `${city.id} must have official local script name`);
    assert.ok(city.state, `${city.id} must have state name`);
    assert.ok(city.structure_summary, `${city.id} must have structure_summary`);
    assert.ok(city.notice, `${city.id} must have an honest notice`);

    // Coordinate validation [lon, lat]
    assert.ok(Array.isArray(city.center) && city.center.length === 2, `${city.id} center must be [lon, lat]`);
    const [lon, lat] = city.center;
    assert.ok(lon >= 68 && lon <= 98, `${city.id} center lon ${lon} must be in India bounds`);
    assert.ok(lat >= 8 && lat <= 36, `${city.id} center lat ${lat} must be in India bounds`);

    // Bounds validation [west, south, east, north]
    assert.ok(Array.isArray(city.bounds) && city.bounds.length === 4, `${city.id} bounds must be [w, s, e, n]`);
    const [west, south, east, north] = city.bounds;
    assert.ok(west < east, `${city.id} west (${west}) must be less than east (${east})`);
    assert.ok(south < north, `${city.id} south (${south}) must be less than north (${north})`);
    assert.ok(west <= lon && lon <= east, `${city.id} center lon must be within west-east bounds`);
    assert.ok(south <= lat && lat <= north, `${city.id} center lat must be within south-north bounds`);

    // Aliases
    assert.ok(Array.isArray(city.aliases) && city.aliases.length > 0, `${city.id} must have aliases`);

    // Capabilities validation
    assert.ok(city.capabilities, `${city.id} must have capabilities`);
    const { navigation, road_coverage, jurisdiction, responsibility, ingestion } = city.capabilities;
    assert.ok(['verified', 'pending', 'marker_only'].includes(navigation), `Invalid navigation capability for ${city.id}`);
    assert.ok(['indexed', 'partial', 'pending'].includes(road_coverage), `Invalid road_coverage capability for ${city.id}`);
    assert.ok(['verified', 'pending', 'none'].includes(jurisdiction), `Invalid jurisdiction capability for ${city.id}`);
    assert.ok(['documented', 'in_review', 'pending'].includes(responsibility), `Invalid responsibility capability for ${city.id}`);
    assert.ok(['active', 'paused', 'pending'].includes(ingestion), `Invalid ingestion capability for ${city.id}`);
  }
});

test('2. City Catalogue: Lookup, search, and metro collections work accurately', async () => {
  // Direct ID lookup
  const blr = getCityById('bengaluru');
  assert.ok(blr);
  assert.equal(blr.name, 'Bengaluru');
  assert.equal(blr.capabilities.road_coverage, 'indexed');

  // Alias lookup
  const blrByAlias = getCityById('Bangalore');
  assert.ok(blrByAlias);
  assert.equal(blrByAlias.id, 'bengaluru');

  const ggByAlias = getCityById('gurgaon');
  assert.ok(ggByAlias);
  assert.equal(ggByAlias.id, 'gurugram');

  const bombay = getCityById('bombay');
  assert.ok(bombay);
  assert.equal(bombay.id, 'mumbai');

  const madras = getCityById('madras');
  assert.ok(madras);
  assert.equal(madras.id, 'chennai');

  // Search
  const chennaiSearch = searchCities('Chennai');
  assert.ok(chennaiSearch.length >= 1);
  assert.equal(chennaiSearch[0].id, 'chennai');

  const tamilSearch = searchCities('Tamil Nadu');
  assert.equal(tamilSearch.length, 3, 'Must find 3 Tamil Nadu cities (Chennai, Coimbatore, Madurai)');

  // Metro groups
  const ncrCities = getCitiesByMetro('NCR');
  assert.equal(ncrCities.length, 6, 'NCR must contain 6 cities');
  const ncrIds = ncrCities.map((c) => c.id).sort();
  assert.deepEqual(ncrIds, ['delhi', 'faridabad', 'ghaziabad', 'greater-noida', 'gurugram', 'noida'].sort());

  const mmrCities = getCitiesByMetro('MMR');
  assert.equal(mmrCities.length, 3, 'MMR must contain 3 cities');
  const mmrIds = mmrCities.map((c) => c.id).sort();
  assert.deepEqual(mmrIds, ['mumbai', 'navi-mumbai', 'thane'].sort());

  const tricityCities = getCitiesByMetro('Tricity');
  assert.equal(tricityCities.length, 1, 'Tricity must contain Chandigarh');
  assert.equal(tricityCities[0].id, 'chandigarh');
});

test('3. API GET /api/v1/regions: Returns 200, proper cache/cors headers, and 36 cities', async () => {
  const req = new Request('http://localhost/api/v1/regions');
  const res = await getRegions(req);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=3600, stale-while-revalidate=300');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');

  const data = await res.json();
  assert.ok(Array.isArray(data), 'Response must be an array of cities');
  assert.equal(data.length, 36, 'Must return all 36 cities');

  // Test metro query parameter
  const ncrReq = new Request('http://localhost/api/v1/regions?metro=NCR');
  const ncrRes = await getRegions(ncrReq);
  const ncrData = await ncrRes.json();
  assert.equal(ncrData.length, 6);

  // Test query parameter
  const searchReq = new Request('http://localhost/api/v1/regions?query=bengaluru');
  const searchRes = await getRegions(searchReq);
  const searchData = await searchRes.json();
  assert.equal(searchData.length, 1);
  assert.equal(searchData[0].id, 'bengaluru');

  // Test OPTIONS preflight
  const optRes = await optionsRegions();
  assert.equal(optRes.status, 204);
  assert.equal(optRes.headers.get('Access-Control-Allow-Origin'), '*');
});

test('4. API GET /api/v1/regions/[id]/manifest: Bengaluru manifest matches specification', async () => {
  const req = new Request('http://localhost/api/v1/regions/bengaluru/manifest');
  const res = await getRegionManifest(req, { params: { id: 'bengaluru' } });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=300, stale-while-revalidate=60');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');

  const manifest = await res.json();
  assert.equal(manifest.schema_version, '1.0.0');
  assert.equal(manifest.region_id, 'bengaluru');
  assert.equal(manifest.publication_id, 'pub_bengaluru_20261016_v1');
  assert.equal(manifest.active_version, '2026.10.16');
  assert.equal(manifest.format, 'mvt');

  // Footprint
  assert.ok(manifest.discovery_footprint);
  assert.deepEqual(manifest.discovery_footprint.label_anchor, [77.5946, 12.9716]);
  assert.ok(manifest.discovery_footprint.bounds);

  // Jurisdiction schemes (GBA 5 corporations + BBMP legacy)
  assert.ok(Array.isArray(manifest.jurisdiction_schemes));
  assert.ok(manifest.jurisdiction_schemes.length >= 2);
  const gbaScheme = manifest.jurisdiction_schemes.find((s) => s.scheme_id === 'gba_corporations_2025');
  assert.ok(gbaScheme);
  assert.equal(gbaScheme.units_count, 5);

  // Road release
  assert.equal(manifest.road_release.status, 'indexed');
  assert.equal(manifest.road_release.scope, 'bengaluru_urban_administrative_district');
  assert.equal(manifest.road_release.format, 'mvt');

  // Membership release
  assert.equal(manifest.membership_release.status, 'verified');

  // Capabilities
  assert.equal(manifest.capabilities.navigation, 'verified');
  assert.equal(manifest.capabilities.road_coverage, 'indexed');
});

test('5. API GET /api/v1/regions/[id]/manifest: Chennai, Mumbai, Delhi, and Noida manifests', async () => {
  // Chennai
  const chennaiReq = new Request('http://localhost/api/v1/regions/chennai/manifest');
  const chennaiRes = await getRegionManifest(chennaiReq, { params: { id: 'chennai' } });
  assert.equal(chennaiRes.status, 200);
  const chennaiManifest = await chennaiRes.json();
  assert.equal(chennaiManifest.region_id, 'chennai');
  assert.equal(chennaiManifest.capabilities.jurisdiction, 'verified');
  assert.equal(chennaiManifest.capabilities.road_coverage, 'pending');
  assert.equal(chennaiManifest.road_release.status, 'pending');
  const gccScheme = chennaiManifest.jurisdiction_schemes.find((s) => s.scheme_id === 'gcc_administrative_2022');
  assert.ok(gccScheme);
  assert.equal(gccScheme.units_count, 200);

  // Mumbai
  const mumbaiReq = new Request('http://localhost/api/v1/regions/mumbai/manifest');
  const mumbaiRes = await getRegionManifest(mumbaiReq, { params: { id: 'mumbai' } });
  assert.equal(mumbaiRes.status, 200);
  const mumbaiManifest = await mumbaiRes.json();
  assert.equal(mumbaiManifest.region_id, 'mumbai');
  const bmcScheme = mumbaiManifest.jurisdiction_schemes.find((s) => s.scheme_id === 'bmc_administrative_wards');
  assert.ok(bmcScheme);
  assert.equal(bmcScheme.units_count, 24);

  // Delhi
  const delhiReq = new Request('http://localhost/api/v1/regions/delhi/manifest');
  const delhiRes = await getRegionManifest(delhiReq, { params: { id: 'delhi' } });
  assert.equal(delhiRes.status, 200);
  const delhiManifest = await delhiRes.json();
  assert.equal(delhiManifest.region_id, 'delhi');
  const mcdScheme = delhiManifest.jurisdiction_schemes.find((s) => s.scheme_id === 'mcd_zones_wards_2022');
  assert.ok(mcdScheme);
  assert.equal(mcdScheme.units_count, 250);

  // Noida
  const noidaReq = new Request('http://localhost/api/v1/regions/noida/manifest');
  const noidaRes = await getRegionManifest(noidaReq, { params: { id: 'noida' } });
  assert.equal(noidaRes.status, 200);
  const noidaManifest = await noidaRes.json();
  assert.equal(noidaManifest.region_id, 'noida');
  const noidaScheme = noidaManifest.jurisdiction_schemes.find((s) => s.scheme_id === 'noida_authority_sectors');
  assert.ok(noidaScheme);
});

test('6. API GET /api/v1/regions/[id]/manifest: Alias normalization and 404 handling', async () => {
  // Alias bangalore -> bengaluru
  const blrReq = new Request('http://localhost/api/v1/regions/bangalore/manifest');
  const blrRes = await getRegionManifest(blrReq, { params: { id: 'bangalore' } });
  assert.equal(blrRes.status, 200);
  const blrManifest = await blrRes.json();
  assert.equal(blrManifest.region_id, 'bengaluru');

  // Alias gurgaon -> gurugram
  const ggReq = new Request('http://localhost/api/v1/regions/gurgaon/manifest');
  const ggRes = await getRegionManifest(ggReq, { params: { id: 'gurgaon' } });
  assert.equal(ggRes.status, 200);
  const ggManifest = await ggRes.json();
  assert.equal(ggManifest.region_id, 'gurugram');

  // Alias bombay -> mumbai
  const bomReq = new Request('http://localhost/api/v1/regions/bombay/manifest');
  const bomRes = await getRegionManifest(bomReq, { params: { id: 'bombay' } });
  assert.equal(bomRes.status, 200);
  const bomManifest = await bomRes.json();
  assert.equal(bomManifest.region_id, 'mumbai');

  // Alias madras -> chennai
  const madrasReq = new Request('http://localhost/api/v1/regions/madras/manifest');
  const madrasRes = await getRegionManifest(madrasReq, { params: { id: 'madras' } });
  assert.equal(madrasRes.status, 200);
  const madrasManifest = await madrasRes.json();
  assert.equal(madrasManifest.region_id, 'chennai');

  // 404 for unknown city
  const unknownReq = new Request('http://localhost/api/v1/regions/atlantis/manifest');
  const unknownRes = await getRegionManifest(unknownReq, { params: { id: 'atlantis' } });
  assert.equal(unknownRes.status, 404);
  const unknownData = await unknownRes.json();
  assert.ok(unknownData.error);

  const invalidReq = new Request('http://localhost/api/v1/regions/non-existent-city/manifest');
  const invalidRes = await getRegionManifest(invalidReq, { params: { id: 'non-existent-city' } });
  assert.equal(invalidRes.status, 404);

  // OPTIONS preflight
  const optRes = await optionsRegionManifest();
  assert.equal(optRes.status, 204);
  assert.equal(optRes.headers.get('Access-Control-Allow-Origin'), '*');
});
