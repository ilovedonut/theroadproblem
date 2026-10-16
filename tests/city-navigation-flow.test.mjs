import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Core imports
import {
  getAllCities,
  getCityById,
  getCitiesByMetro,
  searchCities,
  resolveCityId,
} from '../src/lib/city-catalogue.ts';

import {
  GET as getRegions,
  OPTIONS as optionsRegions,
} from '../src/app/api/v1/regions/route.ts';

import {
  GET as getManifest,
  OPTIONS as optionsManifest,
} from '../src/app/api/v1/regions/[id]/manifest/route.ts';

import {
  GET as getJurisdictions,
  OPTIONS as optionsJurisdictions,
} from '../src/app/api/v1/regions/[id]/jurisdictions/route.ts';

import {
  GET as getSummary,
  OPTIONS as optionsSummary,
} from '../src/app/api/v1/regions/[id]/summary/route.ts';

import { runCityNavigationVerification } from '../scripts/verify-city-navigation.mjs';

test('Gate 1: City Catalogue Completeness - all 36 cities, metadata, capability flags', async () => {
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
    assert.ok(city.local_name, `${city.id} must have local script name`);
    assert.ok(city.state, `${city.id} must have state`);
    assert.ok(city.structure_summary, `${city.id} must have structure_summary`);
    assert.ok(city.notice, `${city.id} must have an honest notice`);

    // Center [lon, lat]
    assert.ok(Array.isArray(city.center) && city.center.length === 2, `${city.id} center must be [lon, lat]`);
    const [lon, lat] = city.center;
    assert.ok(lon >= 68 && lon <= 98, `${city.id} lon ${lon} must be in India bounds`);
    assert.ok(lat >= 8 && lat <= 36, `${city.id} lat ${lat} must be in India bounds`);

    // Bounds [west, south, east, north]
    assert.ok(Array.isArray(city.bounds) && city.bounds.length === 4, `${city.id} bounds must be [w, s, e, n]`);
    const [w, s, e, n] = city.bounds;
    assert.ok(w < e, `${city.id} west (${w}) must be less than east (${e})`);
    assert.ok(s < n, `${city.id} south (${s}) must be less than north (${n})`);
    assert.ok(w <= lon && lon <= e, `${city.id} center lon must be within bounds`);
    assert.ok(s <= lat && lat <= n, `${city.id} center lat must be within bounds`);

    // Aliases
    assert.ok(Array.isArray(city.aliases) && city.aliases.length > 0, `${city.id} must have aliases`);

    // Capabilities
    assert.ok(city.capabilities, `${city.id} must declare capability flags`);
    assert.ok(['verified', 'pending', 'marker_only'].includes(city.capabilities.navigation));
    assert.ok(['indexed', 'partial', 'pending'].includes(city.capabilities.road_coverage));
    assert.ok(['verified', 'pending', 'none'].includes(city.capabilities.jurisdiction));
    assert.ok(['documented', 'in_review', 'pending'].includes(city.capabilities.responsibility));
    assert.ok(['active', 'paused', 'pending'].includes(city.capabilities.ingestion));
  }

  // Metro groupings
  const ncr = getCitiesByMetro('NCR');
  assert.equal(ncr.length, 6, 'NCR must have 6 cities');
  const mmr = getCitiesByMetro('MMR');
  assert.equal(mmr.length, 3, 'MMR must have 3 cities');
  const tricity = getCitiesByMetro('Tricity');
  assert.equal(tricity.length, 1, 'Tricity must have Chandigarh');
});

test('Gate 2: National Overview Scalability - loads 0 city road archives', async () => {
  const req = new Request('http://localhost/api/v1/regions');
  const res = await getRegions(req);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.ok(res.headers.get('Cache-Control')?.includes('public'));

  const data = await res.json();
  assert.equal(data.length, 36, 'Must return all 36 cities');

  const jsonStr = JSON.stringify(data);
  const sizeKb = jsonStr.length / 1024;
  assert.ok(sizeKb < 50, `National overview payload should be lightweight (<50KB), got ${sizeKb.toFixed(2)}KB`);

  // Ensure no detailed road geometry or tile references are leaked in national overview
  assert.equal(jsonStr.includes('"LineString"'), false, 'National overview must not contain LineString geometries');
  assert.equal(jsonStr.includes('"MultiLineString"'), false, 'National overview must not contain MultiLineString geometries');
  assert.equal(jsonStr.includes('.mvt'), false, 'National overview must not reference vector tile archives');
});

test('Gate 3: Deep Links and City Manifest Resolution for proof cities and aliases', async () => {
  const proofCities = ['bengaluru', 'chennai', 'mumbai', 'delhi', 'noida'];

  for (const id of proofCities) {
    const req = new Request(`http://localhost/api/v1/regions/${id}/manifest`);
    const res = await getManifest(req, { params: { id } });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('Cache-Control')?.includes('public'));

    const manifest = await res.json();
    assert.equal(manifest.region_id, id);
    assert.equal(manifest.schema_version, '1.0.0');
    assert.ok(manifest.discovery_footprint);
    assert.ok(Array.isArray(manifest.jurisdiction_schemes));
    assert.ok(manifest.road_release);
    assert.ok(manifest.membership_release);
    assert.ok(manifest.capabilities);
  }

  // Bengaluru specific manifest checks
  const blrReq = new Request('http://localhost/api/v1/regions/bengaluru/manifest');
  const blrRes = await getManifest(blrReq, { params: { id: 'bengaluru' } });
  const blrManifest = await blrRes.json();
  assert.equal(blrManifest.road_release.status, 'indexed');
  assert.equal(blrManifest.membership_release.status, 'verified');

  // Deep-link alias resolution
  const aliases = [
    { alias: 'bangalore', expected: 'bengaluru' },
    { alias: 'bombay', expected: 'mumbai' },
    { alias: 'madras', expected: 'chennai' },
    { alias: 'gurgaon', expected: 'gurugram' },
  ];

  for (const { alias, expected } of aliases) {
    const req = new Request(`http://localhost/api/v1/regions/${alias}/manifest`);
    const res = await getManifest(req, { params: { id: alias } });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.region_id, expected, `Alias '${alias}' must resolve to '${expected}'`);
  }
});

test('Gate 4: Chennai GCC Live Adapter: 3 regions, 15 zones, 200 wards', async () => {
  // Test via API route
  const reqRegions = new Request('http://localhost/api/v1/regions/chennai/jurisdictions?scheme=regions');
  const resRegions = await getJurisdictions(reqRegions, { params: Promise.resolve({ id: 'chennai' }) });
  assert.equal(resRegions.status, 200);
  const dataRegions = await resRegions.json();
  assert.equal(dataRegions.features.length, 3, 'Chennai must have exactly 3 regions');

  const reqZones = new Request('http://localhost/api/v1/regions/chennai/jurisdictions?scheme=zones');
  const resZones = await getJurisdictions(reqZones, { params: Promise.resolve({ id: 'chennai' }) });
  assert.equal(resZones.status, 200);
  const dataZones = await resZones.json();
  assert.equal(dataZones.features.length, 15, 'Chennai must have exactly 15 zones');

  const reqWards = new Request('http://localhost/api/v1/regions/chennai/jurisdictions?scheme=wards');
  const resWards = await getJurisdictions(reqWards, { params: Promise.resolve({ id: 'chennai' }) });
  assert.equal(resWards.status, 200);
  const dataWards = await resWards.json();
  assert.equal(dataWards.features.length, 200, 'Chennai must have exactly 200 wards');

  // Verify audit lineage
  const auditPath = path.resolve('output/jurisdictions/chennai/audit.json');
  assert.ok(fs.existsSync(auditPath));
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  assert.equal(audit.totalFeatures, 218);
  assert.ok(audit.sourceUrl.includes('gisgcc.chennaicorporation.gov.in'));
});

test('Gate 5: Multi-Authority Schemes: Mumbai (BMC 24 wards), Delhi (MCD 12 zones + NDMC), Noida (Sectors & Circles)', async () => {
  // Mumbai BMC 24 wards with separate prabhags
  const mumReq = new Request('http://localhost/api/v1/regions/mumbai/jurisdictions?scheme=wards');
  const mumRes = await getJurisdictions(mumReq, { params: Promise.resolve({ id: 'mumbai' }) });
  assert.equal(mumRes.status, 200);
  const mumData = await mumRes.json();
  assert.equal(mumData.features.length, 24, 'BMC must have exactly 24 administrative wards');
  assert.equal(mumData.prabhags_separate, true, 'Prabhags must be documented as separate');

  // Delhi MCD 12 zones + NDMC civil divisions (with reproduction restrictions noted)
  const delZonesReq = new Request('http://localhost/api/v1/regions/delhi/jurisdictions?scheme=zones');
  const delZonesRes = await getJurisdictions(delZonesReq, { params: Promise.resolve({ id: 'delhi' }) });
  assert.equal(delZonesRes.status, 200);
  const delZonesData = await delZonesRes.json();
  assert.equal(delZonesData.features.length, 12, 'MCD must have exactly 12 administrative zones');
  assert.equal(delZonesData.reproduction_restrictions, true, 'MCD reproduction restrictions must be flagged');

  const delDivReq = new Request('http://localhost/api/v1/regions/delhi/jurisdictions?scheme=divisions');
  const delDivRes = await getJurisdictions(delDivReq, { params: Promise.resolve({ id: 'delhi' }) });
  assert.equal(delDivRes.status, 200);
  const delDivData = await delDivRes.json();
  assert.equal(delDivData.features.length, 6, 'NDMC must have 6 civil divisions');

  // Noida Sectors and Work Circles (rejecting fake municipal wards)
  const noiSecReq = new Request('http://localhost/api/v1/regions/noida/jurisdictions?scheme=sectors');
  const noiSecRes = await getJurisdictions(noiSecReq, { params: Promise.resolve({ id: 'noida' }) });
  assert.equal(noiSecRes.status, 200);
  const noiSecData = await noiSecRes.json();
  assert.equal(noiSecData.has_municipal_wards, false, 'NOIDA must explicitly declare has_municipal_wards: false');
  assert.ok(noiSecData.rejection_notice, 'NOIDA must contain rejection notice for fake wards');

  const noiCircReq = new Request('http://localhost/api/v1/regions/noida/jurisdictions?scheme=work_circles');
  const noiCircRes = await getJurisdictions(noiCircReq, { params: Promise.resolve({ id: 'noida' }) });
  assert.equal(noiCircRes.status, 200);
  const noiCircData = await noiCircRes.json();
  assert.equal(noiCircData.features.length, 10, 'NOIDA must have 10 work circles');
});

test('Gate 6: Honest Availability States: Distinguishing unindexed roads from zero roads', async () => {
  const unindexedCities = ['chennai', 'mumbai', 'delhi', 'noida'];

  for (const cityId of unindexedCities) {
    const req = new Request(`http://localhost/api/v1/regions/${cityId}/summary`);
    const res = await getSummary(req, { params: { id: cityId } });
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.roads_indexed, false, `${cityId} must honestly state roads_indexed: false`);
    assert.equal(data.total_length_km, null, `${cityId} total_length_km must be null, not 0`);
    assert.equal(data.corridors_or_roads, null, `${cityId} corridors_or_roads must be null, not 0`);
    assert.equal(data.active_physical_segments, null, `${cityId} active_physical_segments must be null, not 0`);
    assert.ok(data.notice.includes('pending official acquisition'), `${cityId} must contain pending acquisition notice`);
  }

  // Compare with indexed city (Bengaluru)
  const blrReq = new Request('http://localhost/api/v1/regions/bengaluru/summary');
  const blrRes = await getSummary(blrReq, { params: { id: 'bengaluru' } });
  assert.equal(blrRes.status, 200);

  const blrData = await blrRes.json();
  assert.equal(blrData.roads_indexed, true);
  assert.ok(typeof blrData.total_length_km === 'number' && blrData.total_length_km > 0);
  assert.ok(typeof blrData.corridors_or_roads === 'number' && blrData.corridors_or_roads > 0);
  assert.ok(typeof blrData.active_physical_segments === 'number' && blrData.active_physical_segments > 0);
});

test('Gate 7: Non-Duplication in Summaries: Project budgets not multiplied across wards', async () => {
  // Fetch unit summaries
  const centralReq = new Request('http://localhost/api/v1/regions/bengaluru/summary?scheme=corporations&unit_id=gba-blr-central');
  const centralRes = await getSummary(centralReq, { params: { id: 'bengaluru' } });
  assert.equal(centralRes.status, 200);
  const centralData = await centralRes.json();
  assert.equal(centralData.unit_id, 'gba-blr-central');
  assert.equal(centralData.total_spend_tracked_cr, 12);
  assert.equal(centralData.active_works_count, 1);

  const eastReq = new Request('http://localhost/api/v1/regions/bengaluru/summary?scheme=corporations&unit_id=gba-blr-east');
  const eastRes = await getSummary(eastReq, { params: { id: 'bengaluru' } });
  assert.equal(eastRes.status, 200);
  const eastData = await eastRes.json();
  assert.equal(eastData.total_spend_tracked_cr, 170);
  assert.equal(eastData.active_works_count, 4);

  const southReq = new Request('http://localhost/api/v1/regions/bengaluru/summary?scheme=corporations&unit_id=gba-blr-south');
  const southRes = await getSummary(southReq, { params: { id: 'bengaluru' } });
  assert.equal(southRes.status, 200);
  const southData = await southRes.json();
  assert.equal(southData.total_spend_tracked_cr, 170);
  assert.equal(southData.active_works_count, 4);

  // Fetch parent scheme summary across the corporations
  const parentReq = new Request('http://localhost/api/v1/regions/bengaluru/summary?scheme=corporations');
  const parentRes = await getSummary(parentReq, { params: { id: 'bengaluru' } });
  assert.equal(parentRes.status, 200);
  const parentData = await parentRes.json();

  // Validate anti-double-counting guarantees
  assert.ok(parentData.anti_double_counting);
  assert.equal(parentData.anti_double_counting.works_deduplicated, true);
  assert.equal(parentData.anti_double_counting.spend_not_multiplied, true);
  assert.equal(parentData.anti_double_counting.canonical_road_span_union, true);
  assert.equal(parentData.anti_double_counting.multi_ward_works_counted_once, true);

  // Raw sum of unit spend is 12 + 170 + 0 + 170 + 0 = 352 cr
  // Parent deduplicated spend must be 182 cr (NOT 352 cr)
  assert.equal(parentData.total_spend_tracked_cr, 182);
  assert.equal(parentData.anti_double_counting.raw_unit_spend_sum_cr, 352);
  assert.equal(parentData.anti_double_counting.spend_multiplication_prevented_cr, 170);

  // Multi-ward works: raw sum is 1 + 4 + 0 + 4 + 0 = 9 works; parent has 5 distinct works
  assert.equal(parentData.active_works_count, 5);

  // Canonical road length uses span union (14,760.22 km), strictly <= raw sum of boxes (15,890.02 km)
  assert.equal(parentData.total_length_km, 14760.22);
  assert.ok(parentData.total_length_km < 15890.02);
});

test('Gate 8: Failure Recovery: Invalid city ID returns 404, missing jurisdiction gracefully falls back', async () => {
  // 1. Invalid city ID on summary -> 404
  const invalidSummaryReq = new Request('http://localhost/api/v1/regions/nonexistent-city-xyz/summary');
  const invalidSummaryRes = await getSummary(invalidSummaryReq, { params: { id: 'nonexistent-city-xyz' } });
  assert.equal(invalidSummaryRes.status, 404);
  const invalidSummaryData = await invalidSummaryRes.json();
  assert.ok(invalidSummaryData.error);
  assert.equal(invalidSummaryData.requested_id, 'nonexistent-city-xyz');

  // 2. Invalid city ID on manifest -> 404
  const invalidManifestReq = new Request('http://localhost/api/v1/regions/nonexistent-city-xyz/manifest');
  const invalidManifestRes = await getManifest(invalidManifestReq, { params: { id: 'nonexistent-city-xyz' } });
  assert.equal(invalidManifestRes.status, 404);

  // 3. Nonexistent unit ID in existing scheme -> 404
  const invalidUnitReq = new Request('http://localhost/api/v1/regions/bengaluru/summary?scheme=corporations&unit_id=nonexistent-unit');
  const invalidUnitRes = await getSummary(invalidUnitReq, { params: { id: 'bengaluru' } });
  assert.equal(invalidUnitRes.status, 404);

  // 4. Missing scheme query param on jurisdictions route -> 404
  const noSchemeReq = new Request('http://localhost/api/v1/regions/chennai/jurisdictions');
  const noSchemeRes = await getJurisdictions(noSchemeReq, { params: Promise.resolve({ id: 'chennai' }) });
  assert.equal(noSchemeRes.status, 404);

  // 5. Delimitation pending jurisdiction -> 404 with status 'pending'
  const pendingReq = new Request('http://localhost/api/v1/regions/bengaluru/jurisdictions?scheme=corporations');
  const pendingRes = await getJurisdictions(pendingReq, { params: Promise.resolve({ id: 'bengaluru' }) });
  assert.equal(pendingRes.status, 404);
  const pendingData = await pendingRes.json();
  assert.equal(pendingData.status, 'pending');

  // 6. OPTIONS preflight handlers -> 204
  const optSummary = await optionsSummary();
  assert.equal(optSummary.status, 204);
  assert.equal(optSummary.headers.get('Access-Control-Allow-Origin'), '*');

  const optManifest = await optionsManifest();
  assert.equal(optManifest.status, 204);

  const optJuris = await optionsJurisdictions();
  assert.equal(optJuris.status, 204);

  const optRegions = await optionsRegions();
  assert.equal(optRegions.status, 204);
});

test('Verification Runner & Evidence Generation Check', async () => {
  const result = await runCityNavigationVerification();
  assert.equal(result.success, true, 'Verification runner should pass all 8 gates');
  assert.equal(result.evidence.passed_gates, 8);
  assert.equal(result.evidence.failed_gates, 0);

  const evidenceFile = path.resolve('output/evidence/city-navigation-verification.json');
  assert.ok(fs.existsSync(evidenceFile), 'Evidence file must be written to output/evidence/city-navigation-verification.json');

  const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
  assert.equal(evidence.verdict, 'ALL_GATES_PASSED');
  assert.equal(evidence.total_gates, 8);
});
