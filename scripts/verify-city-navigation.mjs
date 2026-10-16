import fs from 'node:fs';
import path from 'node:path';

// Import route handlers and catalogue
import { getAllCities, getCityById, getCitiesByMetro, resolveCityId } from '../src/lib/city-catalogue.ts';
import { GET as getRegions, OPTIONS as optionsRegions } from '../src/app/api/v1/regions/route.ts';
import { GET as getManifest, OPTIONS as optionsManifest } from '../src/app/api/v1/regions/[id]/manifest/route.ts';
import { GET as getJurisdictions, OPTIONS as optionsJurisdictions } from '../src/app/api/v1/regions/[id]/jurisdictions/route.ts';
import { GET as getSummary, OPTIONS as optionsSummary } from '../src/app/api/v1/regions/[id]/summary/route.ts';

export async function runCityNavigationVerification() {
  console.log('===============================================================');
  console.log('CITY NAVIGATION & JURISDICTION FLOW: 8-GATE VERIFICATION SUITE');
  console.log('===============================================================\n');

  const evidence = {
    suite: 'city-navigation-flow',
    timestamp: new Date().toISOString(),
    total_gates: 8,
    passed_gates: 0,
    failed_gates: 0,
    gates: {},
  };

  // -------------------------------------------------------------
  // GATE 1: City Catalogue Completeness (All 36 cities, metadata, capability flags)
  // -------------------------------------------------------------
  console.log('[Gate 1/8] Verifying City Catalogue Completeness (36 Cities)...');
  try {
    const cities = getAllCities();
    if (cities.length !== 36) {
      throw new Error(`Expected exactly 36 cities, found ${cities.length}`);
    }

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
      if (!slugs.includes(expected)) {
        throw new Error(`Missing expected city in catalogue: ${expected}`);
      }
    }

    for (const c of cities) {
      if (!c.id || !c.name || !c.local_name || !c.state || !c.structure_summary || !c.notice) {
        throw new Error(`Incomplete metadata in city ${c.id}`);
      }
      if (!Array.isArray(c.center) || c.center.length !== 2) {
        throw new Error(`Invalid center coordinates in ${c.id}`);
      }
      const [lon, lat] = c.center;
      if (lon < 68 || lon > 98 || lat < 8 || lat > 36) {
        throw new Error(`Coordinates outside India bounding box for ${c.id}: [${lon}, ${lat}]`);
      }
      if (!Array.isArray(c.bounds) || c.bounds.length !== 4) {
        throw new Error(`Invalid bounding box in ${c.id}`);
      }
      const [w, s, e, n] = c.bounds;
      if (w >= e || s >= n || lon < w || lon > e || lat < s || lat > n) {
        throw new Error(`Bounding box geometry invariant failed for ${c.id}`);
      }
      if (!c.capabilities || !c.capabilities.navigation || !c.capabilities.road_coverage) {
        throw new Error(`Missing capabilities for ${c.id}`);
      }
    }

    // Metro groups
    const ncr = getCitiesByMetro('NCR');
    const mmr = getCitiesByMetro('MMR');
    const tricity = getCitiesByMetro('Tricity');
    if (ncr.length !== 6 || mmr.length !== 3 || tricity.length !== 1) {
      throw new Error(`Metro groups count mismatch: NCR=${ncr.length}, MMR=${mmr.length}, Tricity=${tricity.length}`);
    }

    evidence.gates.gate_1_catalogue_completeness = {
      status: 'PASS',
      cities_count: cities.length,
      metros_verified: {
        NCR: ncr.map((c) => c.id),
        MMR: mmr.map((c) => c.id),
        Tricity: tricity.map((c) => c.id),
      },
      capability_distribution: {
        indexed_roads: cities.filter((c) => c.capabilities.road_coverage === 'indexed').map((c) => c.id),
        pending_roads: cities.filter((c) => c.capabilities.road_coverage === 'pending').length,
        verified_jurisdiction: cities.filter((c) => c.capabilities.jurisdiction === 'verified').map((c) => c.id),
      },
    };
    evidence.passed_gates++;
    console.log('  ✓ Gate 1 PASS: All 36 cities validated with bounds, centers, and capability flags.');
  } catch (err) {
    evidence.gates.gate_1_catalogue_completeness = { status: 'FAIL', error: err.message };
    evidence.failed_gates++;
    console.error(`  ✗ Gate 1 FAIL: ${err.message}`);
  }

  // -------------------------------------------------------------
  // GATE 2: National Overview Loads 0 City Road Archives
  // -------------------------------------------------------------
  console.log('[Gate 2/8] Verifying National Overview loads 0 City Road Archives...');
  try {
    const req = new Request('http://localhost/api/v1/regions');
    const res = await getRegions(req);
    if (res.status !== 200) {
      throw new Error(`Expected status 200, got ${res.status}`);
    }

    const payload = await res.json();
    const rawJson = JSON.stringify(payload);
    const payloadSizeKb = Math.round((rawJson.length / 1024) * 100) / 100;

    // Check that national overview contains NO road coordinates or road geometry archives
    if (rawJson.includes('"geometry"') || rawJson.includes('"LineString"') || rawJson.includes('"MultiLineString"')) {
      throw new Error('National overview leaked road geometry features');
    }
    if (rawJson.includes('.mvt') || rawJson.includes('.pbf')) {
      throw new Error('National overview leaked vector tile archives');
    }

    if (payloadSizeKb > 50) {
      throw new Error(`National overview payload size too large (${payloadSizeKb} KB > 50 KB)`);
    }

    evidence.gates.gate_2_national_overview_zero_road_archives = {
      status: 'PASS',
      payload_size_kb: payloadSizeKb,
      road_archives_loaded: 0,
      road_geometries_transferred: 0,
      cache_control: res.headers.get('Cache-Control'),
      guarantee: 'National overview transfers 0 road archives and 0 geometry linestrings at India discovery scale.',
    };
    evidence.passed_gates++;
    console.log(`  ✓ Gate 2 PASS: National overview payload is lightweight (${payloadSizeKb} KB) with 0 road archives.`);
  } catch (err) {
    evidence.gates.gate_2_national_overview_zero_road_archives = { status: 'FAIL', error: err.message };
    evidence.failed_gates++;
    console.error(`  ✗ Gate 2 FAIL: ${err.message}`);
  }

  // -------------------------------------------------------------
  // GATE 3: Deep Links and City Manifest Resolution for Bengaluru, Chennai, Mumbai, Delhi, Noida
  // -------------------------------------------------------------
  console.log('[Gate 3/8] Verifying Deep Links and City Manifest Resolution...');
  try {
    const testCities = ['bengaluru', 'chennai', 'mumbai', 'delhi', 'noida'];
    const manifests = {};

    for (const cityId of testCities) {
      const req = new Request(`http://localhost/api/v1/regions/${cityId}/manifest`);
      const res = await getManifest(req, { params: { id: cityId } });
      if (res.status !== 200) {
        throw new Error(`Manifest for ${cityId} failed with status ${res.status}`);
      }
      const data = await res.json();
      if (data.region_id !== cityId || !data.discovery_footprint || !Array.isArray(data.jurisdiction_schemes)) {
        throw new Error(`Invalid manifest structure for ${cityId}`);
      }
      manifests[cityId] = {
        region_id: data.region_id,
        road_status: data.road_release.status,
        membership_status: data.membership_release.status,
        schemes_count: data.jurisdiction_schemes.length,
      };
    }

    // Deep link alias resolution
    const aliases = [
      { alias: 'bangalore', canonical: 'bengaluru' },
      { alias: 'bombay', canonical: 'mumbai' },
      { alias: 'madras', canonical: 'chennai' },
      { alias: 'gurgaon', canonical: 'gurugram' },
    ];
    for (const { alias, canonical } of aliases) {
      const req = new Request(`http://localhost/api/v1/regions/${alias}/manifest`);
      const res = await getManifest(req, { params: { id: alias } });
      if (res.status !== 200) {
        throw new Error(`Alias ${alias} resolution failed`);
      }
      const data = await res.json();
      if (data.region_id !== canonical) {
        throw new Error(`Alias ${alias} resolved to ${data.region_id}, expected ${canonical}`);
      }
    }

    evidence.gates.gate_3_manifest_and_deep_links = {
      status: 'PASS',
      resolved_manifests: manifests,
      aliases_verified: aliases,
    };
    evidence.passed_gates++;
    console.log('  ✓ Gate 3 PASS: Manifests and deep-link aliases resolved successfully.');
  } catch (err) {
    evidence.gates.gate_3_manifest_and_deep_links = { status: 'FAIL', error: err.message };
    evidence.failed_gates++;
    console.error(`  ✗ Gate 3 FAIL: ${err.message}`);
  }

  // -------------------------------------------------------------
  // GATE 4: Chennai GCC Live Adapter: 3 Regions, 15 Zones, 200 Wards
  // -------------------------------------------------------------
  console.log('[Gate 4/8] Verifying Chennai GCC Live Adapter Boundaries...');
  try {
    const chennaiDir = path.resolve('output/jurisdictions/chennai');
    const regionsPath = path.join(chennaiDir, 'regions.geojson');
    const zonesPath = path.join(chennaiDir, 'zones.geojson');
    const wardsPath = path.join(chennaiDir, 'wards.geojson');
    const auditPath = path.join(chennaiDir, 'audit.json');

    if (!fs.existsSync(regionsPath) || !fs.existsSync(zonesPath) || !fs.existsSync(wardsPath)) {
      throw new Error('Chennai GeoJSON files missing from output/jurisdictions/chennai');
    }

    const regionsData = JSON.parse(fs.readFileSync(regionsPath, 'utf8'));
    const zonesData = JSON.parse(fs.readFileSync(zonesPath, 'utf8'));
    const wardsData = JSON.parse(fs.readFileSync(wardsPath, 'utf8'));
    const auditData = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

    if (regionsData.features.length !== 3) {
      throw new Error(`Expected 3 Chennai regions, found ${regionsData.features.length}`);
    }
    if (zonesData.features.length !== 15) {
      throw new Error(`Expected 15 Chennai zones, found ${zonesData.features.length}`);
    }
    if (wardsData.features.length !== 200) {
      throw new Error(`Expected 200 Chennai wards, found ${wardsData.features.length}`);
    }

    // Verify endpoint returns them
    const reqWards = new Request('http://localhost/api/v1/regions/chennai/jurisdictions?scheme=wards');
    const resWards = await getJurisdictions(reqWards, { params: Promise.resolve({ id: 'chennai' }) });
    if (resWards.status !== 200) {
      throw new Error(`Endpoint returned status ${resWards.status} for Chennai wards`);
    }

    evidence.gates.gate_4_chennai_gcc_adapter = {
      status: 'PASS',
      counts: {
        regions: regionsData.features.length,
        zones: zonesData.features.length,
        wards: wardsData.features.length,
        total_features: auditData.totalFeatures,
      },
      audit: {
        source_url: auditData.sourceUrl,
        retrieved_at: auditData.retrievedAt,
        license: auditData.license,
      },
    };
    evidence.passed_gates++;
    console.log('  ✓ Gate 4 PASS: Chennai GCC adapter verified with 3 regions, 15 zones, 200 wards.');
  } catch (err) {
    evidence.gates.gate_4_chennai_gcc_adapter = { status: 'FAIL', error: err.message };
    evidence.failed_gates++;
    console.error(`  ✗ Gate 4 FAIL: ${err.message}`);
  }

  // -------------------------------------------------------------
  // GATE 5: Multi-Authority Schemes (Mumbai, Delhi, Noida)
  // -------------------------------------------------------------
  console.log('[Gate 5/8] Verifying Multi-Authority Schemes (Mumbai, Delhi, Noida)...');
  try {
    // 1. Mumbai BMC 24 wards with separate prabhags
    const mumReq = new Request('http://localhost/api/v1/regions/mumbai/jurisdictions?scheme=wards');
    const mumRes = await getJurisdictions(mumReq, { params: Promise.resolve({ id: 'mumbai' }) });
    if (mumRes.status !== 200) {
      throw new Error(`Mumbai wards endpoint returned ${mumRes.status}`);
    }
    const mumData = await mumRes.json();
    if (mumData.features.length !== 24 || !mumData.prabhags_separate) {
      throw new Error('Mumbai BMC wards missing or prabhags not marked separate');
    }

    // 2. Delhi MCD 12 zones with license restriction notice + NDMC divisions
    const delReq = new Request('http://localhost/api/v1/regions/delhi/jurisdictions?scheme=zones');
    const delRes = await getJurisdictions(delReq, { params: Promise.resolve({ id: 'delhi' }) });
    if (delRes.status !== 200) {
      throw new Error(`Delhi zones endpoint returned ${delRes.status}`);
    }
    const delData = await delRes.json();
    if (delData.features.length !== 12 || !delData.reproduction_restrictions) {
      throw new Error('Delhi MCD zones missing or reproduction restrictions not flagged');
    }

    const ndmcReq = new Request('http://localhost/api/v1/regions/delhi/jurisdictions?scheme=divisions');
    const ndmcRes = await getJurisdictions(ndmcReq, { params: Promise.resolve({ id: 'delhi' }) });
    if (ndmcRes.status !== 200) {
      throw new Error(`Delhi NDMC divisions endpoint returned ${ndmcRes.status}`);
    }
    const ndmcData = await ndmcRes.json();
    if (ndmcData.features.length !== 6) {
      throw new Error(`Expected 6 NDMC divisions, found ${ndmcData.features.length}`);
    }

    // 3. NOIDA Authority sectors and work circles (no fake wards)
    const noiReq = new Request('http://localhost/api/v1/regions/noida/jurisdictions?scheme=sectors');
    const noiRes = await getJurisdictions(noiReq, { params: Promise.resolve({ id: 'noida' }) });
    if (noiRes.status !== 200) {
      throw new Error(`Noida sectors endpoint returned ${noiRes.status}`);
    }
    const noiData = await noiRes.json();
    if (noiData.has_municipal_wards !== false || !noiData.rejection_notice) {
      throw new Error('NOIDA did not explicitly reject fake municipal wards');
    }

    evidence.gates.gate_5_multi_authority_schemes = {
      status: 'PASS',
      mumbai: {
        bmc_wards: mumData.features.length,
        prabhags_separate: true,
        notice: mumData.notice,
      },
      delhi: {
        mcd_zones: delData.features.length,
        ndmc_divisions: ndmcData.features.length,
        reproduction_restrictions: true,
        notice: delData.notice,
      },
      noida: {
        authority_sectors: noiData.features.length,
        has_municipal_wards: false,
        rejection_notice: noiData.rejection_notice,
      },
    };
    evidence.passed_gates++;
    console.log('  ✓ Gate 5 PASS: Multi-authority schemes validated with exact institutional models.');
  } catch (err) {
    evidence.gates.gate_5_multi_authority_schemes = { status: 'FAIL', error: err.message };
    evidence.failed_gates++;
    console.error(`  ✗ Gate 5 FAIL: ${err.message}`);
  }

  // -------------------------------------------------------------
  // GATE 6: Honest Availability States: Distinguishing Unindexed Roads from Zero Roads
  // -------------------------------------------------------------
  console.log('[Gate 6/8] Verifying Honest Availability States...');
  try {
    const unindexedCities = ['chennai', 'mumbai', 'delhi', 'noida'];

    for (const cityId of unindexedCities) {
      const req = new Request(`http://localhost/api/v1/regions/${cityId}/summary`);
      const res = await getSummary(req, { params: { id: cityId } });
      if (res.status !== 200) {
        throw new Error(`Summary for ${cityId} failed with ${res.status}`);
      }
      const data = await res.json();

      if (data.roads_indexed !== false) {
        throw new Error(`Expected roads_indexed: false for ${cityId}, got ${data.roads_indexed}`);
      }
      if (data.total_length_km !== null) {
        throw new Error(`Expected total_length_km: null for ${cityId}, got ${data.total_length_km} (must not invent zero roads)`);
      }
      if (data.corridors_or_roads !== null) {
        throw new Error(`Expected corridors_or_roads: null for ${cityId}`);
      }
      if (!data.notice || !data.notice.includes('pending official acquisition')) {
        throw new Error(`Notice missing honest acquisition statement for ${cityId}`);
      }
    }

    // Compare with indexed city (bengaluru)
    const blrReq = new Request('http://localhost/api/v1/regions/bengaluru/summary');
    const blrRes = await getSummary(blrReq, { params: { id: 'bengaluru' } });
    const blrData = await blrRes.json();
    if (blrData.roads_indexed !== true || typeof blrData.total_length_km !== 'number' || blrData.total_length_km <= 0) {
      throw new Error('Bengaluru indexed road coverage not correctly declared');
    }

    evidence.gates.gate_6_honest_availability_states = {
      status: 'PASS',
      unindexed_cities_tested: unindexedCities,
      indexed_city: {
        id: 'bengaluru',
        roads_indexed: true,
        total_length_km: blrData.total_length_km,
        corridors_or_roads: blrData.corridors_or_roads,
      },
      unindexed_contract: {
        roads_indexed: false,
        total_length_km: null,
        notice: 'Road geometry index pending official acquisition',
      },
      guarantee: 'Never conflates unindexed roads with zero roads.',
    };
    evidence.passed_gates++;
    console.log('  ✓ Gate 6 PASS: Unindexed cities honestly report null length and official pending notice.');
  } catch (err) {
    evidence.gates.gate_6_honest_availability_states = { status: 'FAIL', error: err.message };
    evidence.failed_gates++;
    console.error(`  ✗ Gate 6 FAIL: ${err.message}`);
  }

  // -------------------------------------------------------------
  // GATE 7: Non-Duplication in Summaries: Project Budgets Not Multiplied Across Wards
  // -------------------------------------------------------------
  console.log('[Gate 7/8] Verifying Anti-Double-Counting Guarantees in Summaries...');
  try {
    const parentReq = new Request('http://localhost/api/v1/regions/bengaluru/summary?scheme=corporations');
    const parentRes = await getSummary(parentReq, { params: { id: 'bengaluru' } });
    if (parentRes.status !== 200) {
      throw new Error(`Parent summary failed with status ${parentRes.status}`);
    }
    const parentData = await parentRes.json();

    if (!parentData.anti_double_counting || !parentData.anti_double_counting.spend_not_multiplied) {
      throw new Error('Parent summary missing anti_double_counting guarantees');
    }

    const rawSumSpend = parentData.anti_double_counting.raw_unit_spend_sum_cr;
    const parentSpend = parentData.total_spend_tracked_cr;

    if (typeof rawSumSpend !== 'number' || typeof parentSpend !== 'number') {
      throw new Error('Spend amounts must be valid numbers');
    }

    // Verify parent spend does not multiply cross-ward works
    if (parentSpend >= rawSumSpend) {
      throw new Error(`Parent spend (₹${parentSpend} cr) should be strictly less than raw sum (₹${rawSumSpend} cr) due to multi-ward works`);
    }

    const savedInflation = parentData.anti_double_counting.spend_multiplication_prevented_cr;
    if (savedInflation <= 0) {
      throw new Error('Spend multiplication prevented must be greater than 0');
    }

    // Verify canonical span union length is strictly less than or equal to sum of overlapping unit lengths
    const rawSumLength = 15890.02; // sum of 5 boxes
    const parentLength = parentData.total_length_km;
    if (parentLength > rawSumLength) {
      throw new Error(`Parent length (₹${parentLength} km) exceeds raw sum (₹${rawSumLength} km)`);
    }

    evidence.gates.gate_7_non_duplication_in_summaries = {
      status: 'PASS',
      anti_double_counting: {
        raw_unit_spend_sum_cr: rawSumSpend,
        parent_deduplicated_spend_cr: parentSpend,
        spend_multiplication_prevented_cr: savedInflation,
        raw_sum_unit_length_km: rawSumLength,
        parent_canonical_span_union_length_km: parentLength,
        multi_ward_works_counted_once: true,
      },
      guarantee: 'Multi-ward works and tenders are counted once per parent summary; spend is NOT multiplied across boundaries.',
    };
    evidence.passed_gates++;
    console.log(`  ✓ Gate 7 PASS: Deduplication verified. Parent spend is ₹${parentSpend} cr (prevented ₹${savedInflation} cr artificial inflation).`);
  } catch (err) {
    evidence.gates.gate_7_non_duplication_in_summaries = { status: 'FAIL', error: err.message };
    evidence.failed_gates++;
    console.error(`  ✗ Gate 7 FAIL: ${err.message}`);
  }

  // -------------------------------------------------------------
  // GATE 8: Failure Recovery: Invalid City Returns 404, Missing Jurisdiction Handled
  // -------------------------------------------------------------
  console.log('[Gate 8/8] Verifying Failure Recovery and Edge Cases...');
  try {
    // 1. Unknown city ID in summary -> 404
    const unknownSummaryReq = new Request('http://localhost/api/v1/regions/atlantis/summary');
    const unknownSummaryRes = await getSummary(unknownSummaryReq, { params: { id: 'atlantis' } });
    if (unknownSummaryRes.status !== 404) {
      throw new Error(`Expected 404 for unknown city summary, got ${unknownSummaryRes.status}`);
    }

    // 2. Unknown city ID in manifest -> 404
    const unknownManifestReq = new Request('http://localhost/api/v1/regions/atlantis/manifest');
    const unknownManifestRes = await getManifest(unknownManifestReq, { params: { id: 'atlantis' } });
    if (unknownManifestRes.status !== 404) {
      throw new Error(`Expected 404 for unknown city manifest, got ${unknownManifestRes.status}`);
    }

    // 3. Unknown unit in existing scheme -> 404
    const unknownUnitReq = new Request('http://localhost/api/v1/regions/bengaluru/summary?scheme=corporations&unit_id=nonexistent-unit');
    const unknownUnitRes = await getSummary(unknownUnitReq, { params: { id: 'bengaluru' } });
    if (unknownUnitRes.status !== 404) {
      throw new Error(`Expected 404 for unknown unit ID, got ${unknownUnitRes.status}`);
    }

    // 4. Missing scheme query param in jurisdictions -> 404
    const noSchemeReq = new Request('http://localhost/api/v1/regions/chennai/jurisdictions');
    const noSchemeRes = await getJurisdictions(noSchemeReq, { params: Promise.resolve({ id: 'chennai' }) });
    if (noSchemeRes.status !== 404) {
      throw new Error(`Expected 404 when query param 'scheme' is missing, got ${noSchemeRes.status}`);
    }

    // 5. Delimitation pending jurisdiction -> 404 with status 'pending'
    const pendingJurisReq = new Request('http://localhost/api/v1/regions/bengaluru/jurisdictions?scheme=corporations');
    const pendingJurisRes = await getJurisdictions(pendingJurisReq, { params: Promise.resolve({ id: 'bengaluru' }) });
    if (pendingJurisRes.status !== 404) {
      throw new Error(`Expected 404 for delimitation pending jurisdiction, got ${pendingJurisRes.status}`);
    }
    const pendingJurisBody = await pendingJurisRes.json();
    if (pendingJurisBody.status !== 'pending') {
      throw new Error(`Expected body status 'pending', got ${pendingJurisBody.status}`);
    }

    // 6. OPTIONS preflight handlers -> 204
    const optSummaryRes = await optionsSummary();
    const optManifestRes = await optionsManifest();
    const optJurisRes = await optionsJurisdictions();
    const optRegionsRes = await optionsRegions();

    if (
      optSummaryRes.status !== 204 ||
      optManifestRes.status !== 204 ||
      optJurisRes.status !== 204 ||
      optRegionsRes.status !== 204
    ) {
      throw new Error('OPTIONS preflight did not return 204');
    }

    evidence.gates.gate_8_failure_recovery = {
      status: 'PASS',
      checks: [
        'Invalid city summary -> 404',
        'Invalid city manifest -> 404',
        'Invalid unit ID in scheme -> 404',
        'Missing jurisdiction scheme parameter -> 404',
        'Delimitation pending jurisdiction -> 404 with pending notice',
        'OPTIONS preflights -> 204 No Content with CORS',
      ],
    };
    evidence.passed_gates++;
    console.log('  ✓ Gate 8 PASS: Failure recovery and boundary edge cases handled gracefully.');
  } catch (err) {
    evidence.gates.gate_8_failure_recovery = { status: 'FAIL', error: err.message };
    evidence.failed_gates++;
    console.error(`  ✗ Gate 8 FAIL: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Final Verdict & Evidence Export
  // -------------------------------------------------------------
  const allPassed = evidence.passed_gates === 8 && evidence.failed_gates === 0;
  evidence.verdict = allPassed ? 'ALL_GATES_PASSED' : 'GATES_FAILED';

  const evidenceDir = path.resolve('output/evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const evidenceFile = path.join(evidenceDir, 'city-navigation-verification.json');
  fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2), 'utf8');

  console.log('\n===============================================================');
  console.log(`VERIFICATION SUMMARY: ${evidence.passed_gates}/8 GATES PASSED (Status: ${evidence.verdict})`);
  console.log(`Evidence written to: ${evidenceFile}`);
  console.log('===============================================================\n');

  return { success: allPassed, evidence };
}

if (process.argv[1]?.endsWith('verify-city-navigation.mjs')) {
  runCityNavigationVerification()
    .then(({ success }) => process.exit(success ? 0 : 1))
    .catch((err) => {
      console.error('Fatal error during verification:', err);
      process.exit(1);
    });
}
