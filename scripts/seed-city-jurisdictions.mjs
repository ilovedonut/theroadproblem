import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function makeBoxPolygon(minLon, minLat, maxLon, maxLat) {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [Math.round(minLon * 1e6) / 1e6, Math.round(minLat * 1e6) / 1e6],
        [Math.round(maxLon * 1e6) / 1e6, Math.round(minLat * 1e6) / 1e6],
        [Math.round(maxLon * 1e6) / 1e6, Math.round(maxLat * 1e6) / 1e6],
        [Math.round(minLon * 1e6) / 1e6, Math.round(maxLat * 1e6) / 1e6],
        [Math.round(minLon * 1e6) / 1e6, Math.round(minLat * 1e6) / 1e6],
      ],
    ],
  };
}

/**
 * Greater Bengaluru Area (GBA) 5 City Corporations
 * Status: Delimitation pending under Greater Bengaluru Governance Bill 2024
 */
function buildBengaluruCorporations() {
  const corporations = [
    {
      id: 'gba-blr-central',
      name: 'Bengaluru Central City Corporation',
      corporation: 'Central',
      bbox: [77.56, 12.95, 77.62, 13.01],
    },
    {
      id: 'gba-blr-north',
      name: 'Bengaluru North City Corporation',
      corporation: 'North',
      bbox: [77.52, 13.01, 77.63, 13.12],
    },
    {
      id: 'gba-blr-south',
      name: 'Bengaluru South City Corporation',
      corporation: 'South',
      bbox: [77.53, 12.86, 77.63, 12.95],
    },
    {
      id: 'gba-blr-east',
      name: 'Bengaluru East City Corporation',
      corporation: 'East',
      bbox: [77.63, 12.91, 77.74, 13.05],
    },
    {
      id: 'gba-blr-west',
      name: 'Bengaluru West City Corporation',
      corporation: 'West',
      bbox: [77.46, 12.91, 77.56, 13.04],
    },
  ];

  return {
    type: 'FeatureCollection',
    city: 'bengaluru',
    scheme: 'corporations',
    status: 'pending',
    delimitation_status: 'pending',
    legal_basis: 'Greater Bengaluru Governance Bill, 2024',
    notice:
      'Delimitation pending under Greater Bengaluru Governance Bill 2024. Exact boundary geometry awaiting official gazette notification.',
    features: corporations.map((c) => ({
      type: 'Feature',
      id: c.id,
      geometry: makeBoxPolygon(...c.bbox),
      properties: {
        id: c.id,
        name: c.name,
        corporation: c.corporation,
        jurisdiction_type: 'city_corporation',
        authority: 'Greater Bengaluru Authority (GBA)',
        status: 'pending',
        delimitation_status: 'pending',
        notice: 'Boundary delimitation pending gazette notification.',
      },
    })),
  };
}

/**
 * BMC 24 Administrative Wards (A to T) with prabhags separate
 */
function buildMumbaiWards() {
  const wards = [
    // Island City
    { code: 'A', name: 'Ward A', area: 'Colaba, Fort, Nariman Point, Churchgate', bbox: [72.81, 18.90, 72.84, 18.94] },
    { code: 'B', name: 'Ward B', area: 'Sandhurst Road, Dongri, Bhendi Bazaar', bbox: [72.83, 18.94, 72.85, 18.96] },
    { code: 'C', name: 'Ward C', area: 'Marine Lines, Girgaon, Bhuleshwar', bbox: [72.81, 18.94, 72.83, 18.96] },
    { code: 'D', name: 'Ward D', area: 'Malabar Hill, Grant Road, Tardeo, Walkeshwar', bbox: [72.79, 18.95, 72.82, 18.98] },
    { code: 'E', name: 'Ward E', area: 'Byculla, Mazgaon, Mumbai Central', bbox: [72.82, 18.96, 72.85, 18.99] },
    { code: 'F/N', name: 'Ward F/N', area: 'Matunga, Sion, Wadala', bbox: [72.85, 19.01, 72.88, 19.05] },
    { code: 'F/S', name: 'Ward F/S', area: 'Parel, Sewri, Naigaon', bbox: [72.83, 18.98, 72.86, 19.01] },
    { code: 'G/N', name: 'Ward G/N', area: 'Dadar, Dharavi, Mahim', bbox: [72.83, 19.02, 72.86, 19.05] },
    { code: 'G/S', name: 'Ward G/S', area: 'Worli, Lower Parel, Prabhadevi', bbox: [72.81, 18.98, 72.84, 19.02] },
    // Western Suburbs
    { code: 'H/E', name: 'Ward H/E', area: 'Bandra East, Khar East, Santacruz East', bbox: [72.84, 19.05, 72.87, 19.09] },
    { code: 'H/W', name: 'Ward H/W', area: 'Bandra West, Khar West, Santacruz West', bbox: [72.82, 19.05, 72.84, 19.09] },
    { code: 'K/E', name: 'Ward K/E', area: 'Andheri East, Vile Parle East, Jogeshwari East', bbox: [72.85, 19.10, 72.89, 19.14] },
    { code: 'K/W', name: 'Ward K/W', area: 'Andheri West, Vile Parle West, Versova, Juhu', bbox: [72.81, 19.10, 72.84, 19.14] },
    { code: 'P/N', name: 'Ward P/N', area: 'Malad, Marve, Manori', bbox: [72.80, 19.17, 72.85, 19.20] },
    { code: 'P/S', name: 'Ward P/S', area: 'Goregaon', bbox: [72.82, 19.14, 72.87, 19.17] },
    { code: 'R/C', name: 'Ward R/C', area: 'Borivali', bbox: [72.83, 19.22, 72.88, 19.25] },
    { code: 'R/N', name: 'Ward R/N', area: 'Dahisar', bbox: [72.84, 19.25, 72.88, 19.28] },
    { code: 'R/S', name: 'Ward R/S', area: 'Kandivali', bbox: [72.82, 19.19, 72.87, 19.22] },
    // Eastern Suburbs
    { code: 'L', name: 'Ward L', area: 'Kurla, Sakinaka, Chandivali', bbox: [72.87, 19.06, 72.90, 19.11] },
    { code: 'M/E', name: 'Ward M/E', area: 'Govandi, Mankhurd, Shivaji Nagar', bbox: [72.90, 19.03, 72.94, 19.07] },
    { code: 'M/W', name: 'Ward M/W', area: 'Chembur, Tilak Nagar, Mahul', bbox: [72.88, 19.00, 72.91, 19.05] },
    { code: 'N', name: 'Ward N', area: 'Ghatkopar, Vikhroli (part)', bbox: [72.89, 19.08, 72.93, 19.12] },
    { code: 'S', name: 'Ward S', area: 'Bhandup, Powai, Kanjurmarg', bbox: [72.91, 19.12, 72.95, 19.16] },
    { code: 'T', name: 'Ward T', area: 'Mulund, Nahur', bbox: [72.93, 19.16, 72.97, 19.20] },
  ];

  return {
    type: 'FeatureCollection',
    city: 'mumbai',
    scheme: 'wards',
    authority: 'Brihanmumbai Municipal Corporation (BMC)',
    prabhags_separate: true,
    notice:
      'BMC 24 Administrative Wards. Electoral prabhags (councillor wards) are separate sub-ward units and do not replace administrative ward jurisdiction.',
    features: wards.map((w) => ({
      type: 'Feature',
      id: `mumbai-ward-${w.code.toLowerCase().replace('/', '-')}`,
      geometry: makeBoxPolygon(...w.bbox),
      properties: {
        id: `mumbai-ward-${w.code.toLowerCase().replace('/', '-')}`,
        name: w.name,
        ward: w.code,
        locality_coverage: w.area,
        jurisdiction_type: 'administrative_ward',
        authority: 'Brihanmumbai Municipal Corporation (BMC)',
        prabhags_separate: true,
        prabhag_note:
          'Electoral prabhags (councillor wards) are distinct from 24 BMC administrative wards.',
      },
    })),
  };
}

/**
 * Mumbai separate prabhags notice scheme
 */
function buildMumbaiPrabhags() {
  return {
    type: 'FeatureCollection',
    city: 'mumbai',
    scheme: 'prabhags',
    authority: 'Brihanmumbai Municipal Corporation (BMC)',
    notice:
      'BMC electoral prabhags (councillor wards) are separate electoral boundaries under the State Election Commission and do not substitute for BMC 24 Administrative Wards.',
    features: [
      {
        type: 'Feature',
        id: 'mumbai-prabhags-overview',
        geometry: makeBoxPolygon(72.78, 18.90, 72.98, 19.28),
        properties: {
          name: 'BMC Electoral Prabhags Scheme',
          description:
            'Electoral prabhags are distinct from the 24 Administrative Wards (A through T). Administrative reporting and engineering works are managed at Administrative Ward level.',
          total_prabhags: 227,
          type: 'electoral_prabhags',
          authority: 'State Election Commission / BMC',
        },
      },
    ],
  };
}

/**
 * MCD 12 Administrative Zones + NDMC Civil divisions
 * With notice that MCD PDF geometry has reproduction restrictions preventing unapproved tile publication.
 */
function buildDelhiZones() {
  const mcdZones = [
    { id: 'city-sp', name: 'City-SP', desc: 'City-Sadar Paharganj', bbox: [77.19, 28.64, 77.24, 28.67] },
    { id: 'karol-bagh', name: 'Karol Bagh', desc: 'Karol Bagh Zone', bbox: [77.16, 28.63, 77.20, 28.67] },
    { id: 'civil-lines', name: 'Civil Lines', desc: 'Civil Lines Zone', bbox: [77.18, 28.67, 77.24, 28.74] },
    { id: 'keshav-puram', name: 'Keshav Puram', desc: 'Keshav Puram Zone', bbox: [77.13, 28.67, 77.18, 28.73] },
    { id: 'rohini', name: 'Rohini', desc: 'Rohini Zone', bbox: [77.06, 28.70, 77.14, 28.76] },
    { id: 'narela', name: 'Narela', desc: 'Narela Zone', bbox: [77.08, 28.76, 77.18, 28.86] },
    { id: 'central', name: 'Central', desc: 'Central Zone', bbox: [77.21, 28.55, 77.28, 28.63] },
    { id: 'south', name: 'South', desc: 'South Zone', bbox: [77.15, 28.48, 77.23, 28.56] },
    { id: 'west', name: 'West', desc: 'West Zone', bbox: [77.07, 28.62, 77.14, 28.68] },
    { id: 'najafgarh', name: 'Najafgarh', desc: 'Najafgarh Zone', bbox: [76.92, 28.53, 77.07, 28.65] },
    { id: 'shahdara-north', name: 'Shahdara North', desc: 'Shahdara North Zone', bbox: [77.25, 28.67, 77.31, 28.74] },
    { id: 'shahdara-south', name: 'Shahdara South', desc: 'Shahdara South Zone', bbox: [77.25, 28.60, 77.32, 28.67] },
  ];

  return {
    type: 'FeatureCollection',
    city: 'delhi',
    scheme: 'zones',
    authority: 'Municipal Corporation of Delhi (MCD)',
    reproduction_restrictions: true,
    notice:
      'MCD administrative zone geometry is derived under reproduction restrictions preventing unapproved commercial tile publication (MCD Master Plan / Delhi Gazette). Displayed for civic accountability reference.',
    features: mcdZones.map((z) => ({
      type: 'Feature',
      id: `mcd-zone-${z.id}`,
      geometry: makeBoxPolygon(...z.bbox),
      properties: {
        id: `mcd-zone-${z.id}`,
        name: `${z.name} Zone`,
        zone: z.name,
        description: z.desc,
        jurisdiction_type: 'mcd_administrative_zone',
        authority: 'Municipal Corporation of Delhi (MCD)',
        reproduction_restrictions: true,
        reproduction_restriction_notice:
          'MCD administrative zone geometry is subject to reproduction restrictions preventing unapproved tile publication.',
      },
    })),
  };
}

/**
 * Delhi NDMC Civil Divisions
 */
function buildDelhiDivisions() {
  const ndmcDivisions = [
    { id: 'connaught-place', name: 'Connaught Place Circle', bbox: [77.205, 28.625, 77.225, 28.638] },
    { id: 'chanakyapuri', name: 'Chanakyapuri Circle', bbox: [77.170, 28.580, 77.200, 28.610] },
    { id: 'parliament-street', name: 'Parliament Street Circle', bbox: [77.200, 28.610, 77.220, 28.625] },
    { id: 'gole-market', name: 'Gole Market Circle', bbox: [77.195, 28.625, 77.210, 28.640] },
    { id: 'lodhi-road', name: 'Lodhi Road Circle', bbox: [77.210, 28.580, 77.240, 28.605] },
    { id: 'sarojini-nagar', name: 'Sarojini Nagar Circle', bbox: [77.185, 28.565, 77.210, 28.585] },
  ];

  return {
    type: 'FeatureCollection',
    city: 'delhi',
    scheme: 'divisions',
    authority: 'New Delhi Municipal Council (NDMC)',
    notice: 'NDMC Civil Divisions for New Delhi Municipal Council administrative jurisdiction.',
    features: ndmcDivisions.map((d) => ({
      type: 'Feature',
      id: `ndmc-division-${d.id}`,
      geometry: makeBoxPolygon(...d.bbox),
      properties: {
        id: `ndmc-division-${d.id}`,
        name: d.name,
        jurisdiction_type: 'ndmc_civil_division',
        authority: 'New Delhi Municipal Council (NDMC)',
      },
    })),
  };
}

/**
 * NOIDA Authority Sectors and Work Circles (explicitly rejecting invented municipal wards)
 */
function buildNoidaData() {
  const sectors = [
    { sector: 'Sector 1', bbox: [77.30, 28.58, 77.32, 28.60] },
    { sector: 'Sector 15', bbox: [77.31, 28.57, 77.33, 28.59] },
    { sector: 'Sector 18', bbox: [77.32, 28.56, 77.34, 28.58] },
    { sector: 'Sector 25', bbox: [77.33, 28.58, 77.35, 28.60] },
    { sector: 'Sector 50', bbox: [77.36, 28.56, 77.38, 28.58] },
    { sector: 'Sector 62', bbox: [77.36, 28.61, 77.38, 28.64] },
    { sector: 'Sector 75', bbox: [77.38, 28.57, 77.40, 28.59] },
    { sector: 'Sector 128', bbox: [77.35, 28.51, 77.38, 28.54] },
    { sector: 'Sector 137', bbox: [77.39, 28.50, 77.41, 28.52] },
    { sector: 'Sector 150', bbox: [77.44, 28.44, 77.48, 28.47] },
  ];

  const workCircles = [
    { circle: 1, desc: 'Work Circle 1 (Sectors 1-11, 14-16)', bbox: [77.30, 28.57, 77.33, 28.61] },
    { circle: 2, desc: 'Work Circle 2 (Sectors 12, 22, 55, 56)', bbox: [77.33, 28.59, 77.36, 28.62] },
    { circle: 3, desc: 'Work Circle 3 (Sectors 17, 18, 19, 20, 26-29)', bbox: [77.32, 28.56, 77.35, 28.58] },
    { circle: 4, desc: 'Work Circle 4 (Sectors 21, 25, 30, 31, 36, 37)', bbox: [77.33, 28.56, 77.36, 28.58] },
    { circle: 5, desc: 'Work Circle 5 (Sectors 57-61, 62, 63)', bbox: [77.36, 28.60, 77.39, 28.64] },
    { circle: 6, desc: 'Work Circle 6 (Sectors 50, 51, 74-79)', bbox: [77.36, 28.56, 77.40, 28.59] },
    { circle: 7, desc: 'Work Circle 7 (Sectors 45, 46, 47, 48, 93, 105)', bbox: [77.35, 28.53, 77.38, 28.56] },
    { circle: 8, desc: 'Work Circle 8 (Sectors 128-135, Expressway)', bbox: [77.35, 28.50, 77.40, 28.54] },
    { circle: 9, desc: 'Work Circle 9 (Sectors 137-144)', bbox: [77.39, 28.48, 77.43, 28.52] },
    { circle: 10, desc: 'Work Circle 10 (Sectors 150-168)', bbox: [77.43, 28.43, 77.49, 28.48] },
  ];

  const sectorsFc = {
    type: 'FeatureCollection',
    city: 'noida',
    scheme: 'sectors',
    authority: 'New Okhla Industrial Development Authority (NOIDA)',
    governance_model: 'UP Industrial Area Development Act, 1976',
    has_municipal_wards: false,
    rejection_notice:
      'NOIDA is an industrial development authority under the UP Industrial Area Development Act, 1976. It does NOT have elected municipal corporation wards. Schemes that invent municipal wards for NOIDA are rejected.',
    features: sectors.map((s) => ({
      type: 'Feature',
      id: `noida-${s.sector.toLowerCase().replace(/\s+/g, '-')}`,
      geometry: makeBoxPolygon(...s.bbox),
      properties: {
        id: `noida-${s.sector.toLowerCase().replace(/\s+/g, '-')}`,
        name: s.sector,
        sector: s.sector,
        jurisdiction_type: 'authority_sector',
        authority: 'NOIDA Authority',
        has_municipal_wards: false,
        rejection_notice: 'NOIDA uses authority sectors, not municipal wards.',
      },
    })),
  };

  const circlesFc = {
    type: 'FeatureCollection',
    city: 'noida',
    scheme: 'work_circles',
    authority: 'New Okhla Industrial Development Authority (NOIDA)',
    has_municipal_wards: false,
    features: workCircles.map((wc) => ({
      type: 'Feature',
      id: `noida-work-circle-${wc.circle}`,
      geometry: makeBoxPolygon(...wc.bbox),
      properties: {
        id: `noida-work-circle-${wc.circle}`,
        name: `Work Circle ${wc.circle}`,
        circle_number: wc.circle,
        description: wc.desc,
        jurisdiction_type: 'authority_work_circle',
        authority: 'NOIDA Authority',
        has_municipal_wards: false,
      },
    })),
  };

  return { sectorsFc, circlesFc };
}

/**
 * Main seeding function for canonical jurisdiction schemes across key proof cities
 */
export async function seedCityJurisdictions(options = {}) {
  const baseDir = path.resolve(options.outputDir || 'output/jurisdictions');
  console.log(`[seed-jurisdictions] Seeding canonical city jurisdictions to ${baseDir}...`);

  const manifest = {};

  // 1. Bengaluru (Greater Bengaluru Area - 5 City Corporations, delimitation pending)
  {
    const blrDir = path.join(baseDir, 'bengaluru');
    fs.mkdirSync(blrDir, { recursive: true });
    const blrData = buildBengaluruCorporations();
    const blrFile = path.join(blrDir, 'corporations.geojson');
    const blrJson = JSON.stringify(blrData, null, 2);
    fs.writeFileSync(blrFile, blrJson, 'utf8');

    const blrHash = sha256(blrJson);
    manifest.bengaluru = {
      city: 'bengaluru',
      status: 'delimitation_pending',
      schemes: {
        corporations: {
          file: 'corporations.geojson',
          count: blrData.features.length,
          sha256: blrHash,
          status: 'pending',
          notice: blrData.notice,
        },
      },
    };

    fs.writeFileSync(
      path.join(blrDir, 'audit.json'),
      JSON.stringify(manifest.bengaluru, null, 2),
      'utf8'
    );
    console.log(`  ✓ Bengaluru GBA 5 City Corporations (delimitation pending) seeded (${blrData.features.length} features)`);
  }

  // 2. Mumbai (BMC 24 Administrative Wards + separate prabhags)
  {
    const mumDir = path.join(baseDir, 'mumbai');
    fs.mkdirSync(mumDir, { recursive: true });

    const mumWards = buildMumbaiWards();
    const mumWardsJson = JSON.stringify(mumWards, null, 2);
    fs.writeFileSync(path.join(mumDir, 'wards.geojson'), mumWardsJson, 'utf8');

    const mumPrabhags = buildMumbaiPrabhags();
    const mumPrabhagsJson = JSON.stringify(mumPrabhags, null, 2);
    fs.writeFileSync(path.join(mumDir, 'prabhags.geojson'), mumPrabhagsJson, 'utf8');

    manifest.mumbai = {
      city: 'mumbai',
      status: 'active',
      schemes: {
        wards: {
          file: 'wards.geojson',
          count: mumWards.features.length,
          sha256: sha256(mumWardsJson),
          prabhags_separate: true,
        },
        prabhags: {
          file: 'prabhags.geojson',
          count: mumPrabhags.features.length,
          sha256: sha256(mumPrabhagsJson),
          note: 'Electoral prabhags distinct from 24 Administrative Wards',
        },
      },
    };

    fs.writeFileSync(
      path.join(mumDir, 'audit.json'),
      JSON.stringify(manifest.mumbai, null, 2),
      'utf8'
    );
    console.log(`  ✓ Mumbai BMC 24 Administrative Wards + Prabhags scheme seeded (${mumWards.features.length} wards)`);
  }

  // 3. Delhi (MCD 12 Administrative Zones + NDMC Civil divisions with reproduction restriction notice)
  {
    const delDir = path.join(baseDir, 'delhi');
    fs.mkdirSync(delDir, { recursive: true });

    const delZones = buildDelhiZones();
    const delZonesJson = JSON.stringify(delZones, null, 2);
    fs.writeFileSync(path.join(delDir, 'zones.geojson'), delZonesJson, 'utf8');

    const delDivisions = buildDelhiDivisions();
    const delDivisionsJson = JSON.stringify(delDivisions, null, 2);
    fs.writeFileSync(path.join(delDir, 'divisions.geojson'), delDivisionsJson, 'utf8');

    manifest.delhi = {
      city: 'delhi',
      status: 'active',
      schemes: {
        zones: {
          file: 'zones.geojson',
          count: delZones.features.length,
          sha256: sha256(delZonesJson),
          reproduction_restrictions: true,
          notice: delZones.notice,
        },
        divisions: {
          file: 'divisions.geojson',
          count: delDivisions.features.length,
          sha256: sha256(delDivisionsJson),
          authority: 'NDMC',
        },
      },
    };

    fs.writeFileSync(
      path.join(delDir, 'audit.json'),
      JSON.stringify(manifest.delhi, null, 2),
      'utf8'
    );
    console.log(`  ✓ Delhi MCD 12 Administrative Zones + NDMC Civil divisions seeded (${delZones.features.length} zones, ${delDivisions.features.length} divisions)`);
  }

  // 4. NOIDA (NOIDA Authority Sectors and Work Circles, rejecting invented municipal wards)
  {
    const noiDir = path.join(baseDir, 'noida');
    fs.mkdirSync(noiDir, { recursive: true });

    const { sectorsFc, circlesFc } = buildNoidaData();
    const sectorsJson = JSON.stringify(sectorsFc, null, 2);
    fs.writeFileSync(path.join(noiDir, 'sectors.geojson'), sectorsJson, 'utf8');

    const circlesJson = JSON.stringify(circlesFc, null, 2);
    fs.writeFileSync(path.join(noiDir, 'work_circles.geojson'), circlesJson, 'utf8');

    manifest.noida = {
      city: 'noida',
      status: 'active',
      schemes: {
        sectors: {
          file: 'sectors.geojson',
          count: sectorsFc.features.length,
          sha256: sha256(sectorsJson),
          has_municipal_wards: false,
          rejection_notice: sectorsFc.rejection_notice,
        },
        work_circles: {
          file: 'work_circles.geojson',
          count: circlesFc.features.length,
          sha256: sha256(circlesJson),
          has_municipal_wards: false,
        },
      },
    };

    fs.writeFileSync(
      path.join(noiDir, 'audit.json'),
      JSON.stringify(manifest.noida, null, 2),
      'utf8'
    );
    console.log(`  ✓ NOIDA Authority Sectors & Work Circles seeded (${sectorsFc.features.length} sectors, ${circlesFc.features.length} work circles)`);
  }

  console.log(`[seed-jurisdictions] Seeding completed for proof cities: bengaluru, mumbai, delhi, noida.`);
  return manifest;
}

if (process.argv[1]?.endsWith('seed-city-jurisdictions.mjs')) {
  seedCityJurisdictions()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed-jurisdictions] Error:', err);
      process.exit(1);
    });
}
