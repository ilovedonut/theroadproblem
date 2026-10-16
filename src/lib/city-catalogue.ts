export type NavigationCapability = 'verified' | 'pending' | 'marker_only';
export type RoadCoverageCapability = 'indexed' | 'partial' | 'pending';
export type JurisdictionCapability = 'verified' | 'pending' | 'none';
export type ResponsibilityCapability = 'documented' | 'in_review' | 'pending';
export type IngestionCapability = 'active' | 'paused' | 'pending';

export interface CityCapabilities {
  navigation: NavigationCapability;
  road_coverage: RoadCoverageCapability;
  jurisdiction: JurisdictionCapability;
  responsibility: ResponsibilityCapability;
  ingestion: IngestionCapability;
}

export type MetroGroup = 'NCR' | 'MMR' | 'Tricity';

export interface CityEntry {
  id: string;
  name: string;
  local_name: string;
  state: string;
  center: [number, number]; // [longitude, latitude]
  bounds: [number, number, number, number]; // [west, south, east, north]
  aliases: string[];
  metro_group?: MetroGroup;
  structure_summary: string;
  capabilities: CityCapabilities;
  notice: string;
}

export const CITY_CATALOGUE: CityEntry[] = [
  // --- Southern Cities ---
  {
    id: 'bengaluru',
    name: 'Bengaluru',
    local_name: 'ಬೆಂಗಳೂರು',
    state: 'Karnataka',
    center: [77.5946, 12.9716],
    bounds: [77.4600, 12.8340, 77.7840, 13.1436],
    aliases: ['Bengaluru', 'Bangalore', 'Bengaluru Urban', 'GBA', 'BBMP'],
    structure_summary: 'GBA (5 Corporations: Central, North, South, East, West)',
    capabilities: {
      navigation: 'verified',
      road_coverage: 'indexed',
      jurisdiction: 'pending',
      responsibility: 'in_review',
      ingestion: 'active',
    },
    notice: 'Indexed motor-road coverage active within verified Bengaluru Urban district. GBA five-corporation boundaries and ward crosswalks pending final delimitation reconciliation.',
  },
  {
    id: 'hyderabad',
    name: 'Hyderabad',
    local_name: 'హైదరాబాద్',
    state: 'Telangana',
    center: [78.4867, 17.3850],
    bounds: [78.2370, 17.2000, 78.6220, 17.5800],
    aliases: ['Hyderabad', 'Secunderabad', 'GHMC', 'Cyberabad', 'Malkajgiri', 'CYB', 'HYD'],
    structure_summary: '3 Corporations (GHMC, Cyberabad, Malkajgiri)',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. Reorganization into three municipal corporations (GHMC, Cyberabad, Malkajgiri) and road network indexing pending.',
  },
  {
    id: 'chennai',
    name: 'Chennai',
    local_name: 'சென்னை',
    state: 'Tamil Nadu',
    center: [80.2707, 13.0827],
    bounds: [80.1160, 12.8800, 80.3400, 13.2450],
    aliases: ['Chennai', 'Madras', 'GCC', 'Greater Chennai'],
    structure_summary: '3 Regions, 15 Zones, 200 Wards',
    capabilities: {
      navigation: 'verified',
      road_coverage: 'pending',
      jurisdiction: 'verified',
      responsibility: 'in_review',
      ingestion: 'active',
    },
    notice: 'Official GCC administrative boundary verified (3 regions, 15 zones, 200 wards). Road network indexing pending.',
  },
  {
    id: 'coimbatore',
    name: 'Coimbatore',
    local_name: 'கோயம்புத்தூர்',
    state: 'Tamil Nadu',
    center: [76.9558, 11.0168],
    bounds: [76.8400, 10.9000, 77.0800, 11.1200],
    aliases: ['Coimbatore', 'Kovai', 'CCMC'],
    structure_summary: '5 Zones, 100 Divisions',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. Official 5-zone / 100-division vector export and road network indexing pending.',
  },
  {
    id: 'kochi',
    name: 'Kochi',
    local_name: 'കൊച്ചി',
    state: 'Kerala',
    center: [76.2673, 9.9312],
    bounds: [76.2000, 9.8700, 76.3800, 10.0500],
    aliases: ['Kochi', 'Cochin', 'Ernakulam'],
    structure_summary: '76 Wards, 6 Zonal Offices',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 76-ward SEC roster identified; final vector boundaries and road network indexing pending.',
  },
  {
    id: 'thiruvananthapuram',
    name: 'Thiruvananthapuram',
    local_name: 'തിരുവനന്തപുരം',
    state: 'Kerala',
    center: [76.9366, 8.5241],
    bounds: [76.8400, 8.4200, 77.0400, 8.6100],
    aliases: ['Thiruvananthapuram', 'Trivandrum', 'TMC'],
    structure_summary: '101 Wards, 11 Zonal Offices',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 101-ward SEC roster identified; final vector boundaries and road network indexing pending.',
  },

  // --- Western Cities and Jaipur ---
  {
    id: 'mumbai',
    name: 'Mumbai',
    local_name: 'मुंबई',
    state: 'Maharashtra',
    center: [72.8777, 19.0760],
    bounds: [72.7750, 18.8900, 72.9860, 19.2720],
    aliases: ['Mumbai', 'Bombay', 'BMC', 'MCGM'],
    metro_group: 'MMR',
    structure_summary: '24 Administrative Wards (A to T)',
    capabilities: {
      navigation: 'verified',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'City discovery marker active. BMC 24 administrative ward boundaries and road network indexing pending.',
  },
  {
    id: 'pune',
    name: 'Pune',
    local_name: 'पुणे',
    state: 'Maharashtra',
    center: [73.8567, 18.5204],
    bounds: [73.7300, 18.4100, 73.9900, 18.6200],
    aliases: ['Pune', 'Poona', 'PMC'],
    structure_summary: 'PMC Ward Offices & Electoral Prabhags',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. PMC municipal boundaries and current prabhag vector export pending.',
  },
  {
    id: 'pimpri-chinchwad',
    name: 'Pimpri-Chinchwad',
    local_name: 'पिंपरी-चिंचवड',
    state: 'Maharashtra',
    center: [73.8057, 18.6298],
    bounds: [73.7100, 18.5600, 73.9100, 18.7300],
    aliases: ['Pimpri-Chinchwad', 'PCMC', 'Pimpri Chinchwad', 'Pimpri', 'Chinchwad'],
    structure_summary: '10 Regional Offices, 32 Prabhags',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. Official 10 regional offices and 32 prabhags crosswalk verified; vector geometry pending.',
  },
  {
    id: 'ahmedabad',
    name: 'Ahmedabad',
    local_name: 'અમદાવાદ',
    state: 'Gujarat',
    center: [72.5714, 23.0225],
    bounds: [72.4600, 22.9200, 72.6900, 23.1300],
    aliases: ['Ahmedabad', 'Amdavad', 'AMC', 'Karnavati'],
    structure_summary: '7 Administrative Zones, 48 Wards',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. AMC 7 administrative zones identified; ward boundary reconciliation pending.',
  },
  {
    id: 'surat',
    name: 'Surat',
    local_name: 'સુરત',
    state: 'Gujarat',
    center: [72.8311, 21.1702],
    bounds: [72.7200, 21.0800, 72.9300, 21.2600],
    aliases: ['Surat', 'SMC'],
    structure_summary: '9 Administrative Zones, 30 Wards',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 9 administrative zones identified; enlarged city GIS export pending.',
  },
  {
    id: 'jaipur',
    name: 'Jaipur',
    local_name: 'जयपुर',
    state: 'Rajasthan',
    center: [75.7873, 26.9124],
    bounds: [75.6800, 26.7900, 75.9200, 27.0200],
    aliases: ['Jaipur', 'Pink City', 'JMC'],
    structure_summary: '13 Geographical Zones, 150 Wards',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 13 zones and 150 wards identified in tenders; official vector boundaries pending.',
  },
  {
    id: 'nagpur',
    name: 'Nagpur',
    local_name: 'नागपूर',
    state: 'Maharashtra',
    center: [79.0882, 21.1458],
    bounds: [78.9800, 21.0600, 79.1900, 21.2300],
    aliases: ['Nagpur', 'NMC'],
    structure_summary: '10 Administrative Zones, 38 Prabhags',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 10 zones and final 2025 prabhag maps identified; vector data export pending.',
  },
  {
    id: 'nashik',
    name: 'Nashik',
    local_name: 'नाशिक',
    state: 'Maharashtra',
    center: [73.7898, 19.9975],
    bounds: [73.7000, 19.9100, 73.8800, 20.0600],
    aliases: ['Nashik', 'Nasik', 'NMC'],
    structure_summary: '6 Administrative Divisions, 31 Prabhags',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 6 administrative divisions and 31 prabhags identified; vector boundaries pending.',
  },
  {
    id: 'navi-mumbai',
    name: 'Navi Mumbai',
    local_name: 'नवी मुंबई',
    state: 'Maharashtra',
    center: [73.0297, 19.0330],
    bounds: [72.9600, 18.9600, 73.1200, 19.1900],
    aliases: ['Navi Mumbai', 'New Bombay', 'NMMC'],
    metro_group: 'MMR',
    structure_summary: '2 Zones, 8 Ward Offices (NMMC)',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. NMMC 2 zones and 8 ward offices documented; vector geometry pending.',
  },
  {
    id: 'thane',
    name: 'Thane',
    local_name: 'ठाणे',
    state: 'Maharashtra',
    center: [72.9781, 19.2183],
    bounds: [72.9100, 19.1400, 73.0500, 19.2900],
    aliases: ['Thane', 'Thana', 'TMC'],
    metro_group: 'MMR',
    structure_summary: 'TMC Ward Committees & Prabhags',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. TMC municipal area and ward committee records pending current GIS acquisition.',
  },

  // --- Northern, Eastern and Central Cities ---
  {
    id: 'delhi',
    name: 'Delhi',
    local_name: 'दिल्ली',
    state: 'Delhi',
    center: [77.2090, 28.6139],
    bounds: [76.8400, 28.4000, 77.3500, 28.8800],
    aliases: ['Delhi', 'New Delhi', 'NCT Delhi', 'MCD', 'NDMC', 'DL'],
    metro_group: 'NCR',
    structure_summary: 'MCD (12 Zones, 250 Wards), NDMC & Cantonment',
    capabilities: {
      navigation: 'verified',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'City discovery marker active. Municipal jurisdiction vectors (MCD/NDMC) pending licensing and geometry reconciliation.',
  },
  {
    id: 'gurugram',
    name: 'Gurugram',
    local_name: 'गुरुग्राम',
    state: 'Haryana',
    center: [77.0266, 28.4595],
    bounds: [76.9200, 28.3400, 77.1300, 28.5300],
    aliases: ['Gurugram', 'Gurgaon', 'MCG', 'GMDA'],
    metro_group: 'NCR',
    structure_summary: 'MCG (36 Wards) & GMDA',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. MCG 36 wards identified; September 2026 administrative cluster order reconciliation pending.',
  },
  {
    id: 'noida',
    name: 'Noida',
    local_name: 'नोएडा',
    state: 'Uttar Pradesh',
    center: [77.3910, 28.5355],
    bounds: [77.2900, 28.4600, 77.4500, 28.6300],
    aliases: ['Noida', 'New Okhla Industrial Development Authority', 'NOIDA'],
    metro_group: 'NCR',
    structure_summary: 'NOIDA Authority Sectors & Work Circles',
    capabilities: {
      navigation: 'verified',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Authority boundary discovery active. Sector and work circle boundaries pending public vector export.',
  },
  {
    id: 'greater-noida',
    name: 'Greater Noida',
    local_name: 'ग्रेटर नोएडा',
    state: 'Uttar Pradesh',
    center: [77.5030, 28.4744],
    bounds: [77.4100, 28.3800, 77.5900, 28.5700],
    aliases: ['Greater Noida', 'GNIDA'],
    metro_group: 'NCR',
    structure_summary: 'GNIDA Authority Sectors & Work Circles',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. GNIDA sector layout and work circle definitions pending vector acquisition.',
  },
  {
    id: 'ghaziabad',
    name: 'Ghaziabad',
    local_name: 'ग़ाज़ियाबाद',
    state: 'Uttar Pradesh',
    center: [77.4538, 28.6692],
    bounds: [77.3200, 28.5800, 77.5200, 28.7400],
    aliases: ['Ghaziabad', 'GNN', 'GDA'],
    metro_group: 'NCR',
    structure_summary: '5 Zones, 100 Wards & GDA',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 5 zones and 100 wards identified; zone-ward crosswalk reconciliation pending.',
  },
  {
    id: 'faridabad',
    name: 'Faridabad',
    local_name: 'फरीदाबाद',
    state: 'Haryana',
    center: [77.3178, 28.4089],
    bounds: [77.2400, 28.3000, 77.3900, 28.4900],
    aliases: ['Faridabad', 'MCF', 'FMDA'],
    metro_group: 'NCR',
    structure_summary: 'MCF (46 Wards) & FMDA (3 Zones, 6 Subzones)',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. MCF 46-ward 2024 delimitation identified; FMDA vector layers pending reconciliation.',
  },
  {
    id: 'kolkata',
    name: 'Kolkata',
    local_name: 'কলকাতা',
    state: 'West Bengal',
    center: [88.3639, 22.5726],
    bounds: [88.2700, 22.4500, 88.4400, 22.6500],
    aliases: ['Kolkata', 'Calcutta', 'KMC'],
    structure_summary: '16 Boroughs, 144 Wards (209-Ward Amendment Pending)',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. KMC 16-borough / 144-ward reference baseline noted; September 2026 amendment commencement in review.',
  },
  {
    id: 'lucknow',
    name: 'Lucknow',
    local_name: 'लखनऊ',
    state: 'Uttar Pradesh',
    center: [80.9462, 26.8467],
    bounds: [80.8400, 26.7400, 81.0500, 26.9600],
    aliases: ['Lucknow', 'LMC', 'LNN'],
    structure_summary: '8 Engineering Zones, 110 Wards',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 8 engineering zones and 110 wards identified; current vector maps pending.',
  },
  {
    id: 'kanpur',
    name: 'Kanpur',
    local_name: 'कानपुर',
    state: 'Uttar Pradesh',
    center: [80.3319, 26.4499],
    bounds: [80.2200, 26.3600, 80.4400, 26.5400],
    aliases: ['Kanpur', 'Cawnpore', 'KMC', 'KNN'],
    structure_summary: '6 Zones, 110 Wards',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 6 zones and 110 wards baseline identified; updated vector data pending.',
  },
  {
    id: 'indore',
    name: 'Indore',
    local_name: 'इंदौर',
    state: 'Madhya Pradesh',
    center: [75.8577, 22.7196],
    bounds: [75.7600, 22.6400, 75.9600, 22.8000],
    aliases: ['Indore', 'IMC'],
    structure_summary: '85 Wards, 19/22 Zones',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. IMC 85 wards identified; zone order and vector boundaries pending reconciliation.',
  },
  {
    id: 'bhopal',
    name: 'Bhopal',
    local_name: 'भोपाल',
    state: 'Madhya Pradesh',
    center: [77.4126, 23.2599],
    bounds: [77.3000, 23.1600, 77.5200, 23.3600],
    aliases: ['Bhopal', 'BMC'],
    structure_summary: '85 Wards, 19/21 Zones',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. BMC 85 wards identified; zone reorganization and vector boundaries pending.',
  },
  {
    id: 'chandigarh',
    name: 'Chandigarh',
    local_name: 'ਚੰਡੀਗੜ੍ਹ',
    state: 'Chandigarh',
    center: [76.7794, 30.7333],
    bounds: [76.7100, 30.6700, 76.8500, 30.7900],
    aliases: ['Chandigarh', 'Tricity', 'MCC'],
    metro_group: 'Tricity',
    structure_summary: '35 Electoral Wards & Sectors',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 35 wards and sector layout identified; road transfer custody records pending.',
  },

  // --- Additional Major City Areas ---
  {
    id: 'patna',
    name: 'Patna',
    local_name: 'पटना',
    state: 'Bihar',
    center: [85.1376, 25.5941],
    bounds: [85.0300, 25.5300, 85.2500, 25.6600],
    aliases: ['Patna', 'Patliputra', 'PMC'],
    structure_summary: '6 Municipal Circles, 75 Wards',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 6 civic circles and 75 wards documented; current circle-ward crosswalk pending.',
  },
  {
    id: 'bhubaneswar',
    name: 'Bhubaneswar',
    local_name: 'ଭୁବନେଶ୍ୱର',
    state: 'Odisha',
    center: [85.8245, 20.2961],
    bounds: [85.7300, 20.2100, 85.9200, 20.3800],
    aliases: ['Bhubaneswar', 'BMC'],
    structure_summary: 'BMC 67 Wards, Territorial Groupings',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. BMC 67-ward 2022 notification documented; 2026 zone reorganization order pending.',
  },
  {
    id: 'visakhapatnam',
    name: 'Visakhapatnam',
    local_name: 'విశాఖపట్నం',
    state: 'Andhra Pradesh',
    center: [83.2185, 17.6868],
    bounds: [83.1000, 17.6000, 83.3900, 17.8200],
    aliases: ['Visakhapatnam', 'Vizag', 'GVMC', 'Waltair'],
    structure_summary: 'GVMC 10 Zones, 120 Wards',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 10 approved administrative zones and October 2026 APSEC 120-ward roster confirmed; final geometry pending.',
  },
  {
    id: 'vijayawada',
    name: 'Vijayawada',
    local_name: 'విజయవాడ',
    state: 'Andhra Pradesh',
    center: [80.6480, 16.5062],
    bounds: [80.5600, 16.4500, 80.7300, 16.5700],
    aliases: ['Vijayawada', 'Bezawada', 'VMC'],
    structure_summary: 'VMC 3 Circles, 86 Wards',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. October 2026 APSEC 86-ward roster confirmed; circle crosswalk and vector geometry pending.',
  },
  {
    id: 'guwahati',
    name: 'Guwahati',
    local_name: 'গুৱাহাটী',
    state: 'Assam',
    center: [91.7362, 26.1445],
    bounds: [91.6200, 26.0800, 91.8600, 26.2200],
    aliases: ['Guwahati', 'Gauhati', 'GMC'],
    structure_summary: '6 Zones, 60 Wards',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 6 service zones and 60 wards identified; vector boundary files pending.',
  },
  {
    id: 'ranchi',
    name: 'Ranchi',
    local_name: 'राँची',
    state: 'Jharkhand',
    center: [85.3096, 23.3441],
    bounds: [85.2200, 23.2700, 85.4000, 23.4200],
    aliases: ['Ranchi', 'RMC'],
    structure_summary: 'RMC 53 Wards',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. Official 2025 election 53-ward list identified; polygon boundary export pending.',
  },
  {
    id: 'raipur',
    name: 'Raipur',
    local_name: 'रायपुर',
    state: 'Chhattisgarh',
    center: [81.6296, 21.2514],
    bounds: [81.5300, 21.1700, 81.7400, 21.3300],
    aliases: ['Raipur', 'RMC'],
    structure_summary: '10 Zones, 70 Wards',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 10 zones and 70 operational wards identified; latest vector boundaries pending.',
  },
  {
    id: 'madurai',
    name: 'Madurai',
    local_name: 'மதுரை',
    state: 'Tamil Nadu',
    center: [78.1198, 9.9252],
    bounds: [78.0400, 9.8500, 78.2000, 10.0000],
    aliases: ['Madurai', 'Madura', 'MMC'],
    structure_summary: '5 Zones, 100 Wards',
    capabilities: {
      navigation: 'pending',
      road_coverage: 'pending',
      jurisdiction: 'pending',
      responsibility: 'pending',
      ingestion: 'pending',
    },
    notice: 'Discovery marker active. 5 civic zones and 100 council wards identified; current vector export pending.',
  },
];

const CITY_BY_ID = new Map<string, CityEntry>();
const ALIAS_LOOKUP = new Map<string, string>();

for (const city of CITY_CATALOGUE) {
  CITY_BY_ID.set(city.id.toLowerCase(), city);
  ALIAS_LOOKUP.set(city.id.toLowerCase(), city.id);
  for (const alias of city.aliases) {
    ALIAS_LOOKUP.set(alias.toLowerCase().trim(), city.id);
  }
}

/**
 * Returns all 36 configured discovery cities.
 */
export function getAllCities(): CityEntry[] {
  return [...CITY_CATALOGUE];
}

/**
 * Resolves a city ID or known alias to the canonical city slug.
 */
export function resolveCityId(input: string): string | undefined {
  if (!input) return undefined;
  const normalized = input.trim().toLowerCase();
  return ALIAS_LOOKUP.get(normalized);
}

/**
 * Retrieves a city entry by ID or alias.
 */
export function getCityById(id: string): CityEntry | undefined {
  if (!id) return undefined;
  const canonicalId = resolveCityId(id) || id.trim().toLowerCase();
  return CITY_BY_ID.get(canonicalId);
}

/**
 * Searches cities by query string against id, name, local_name, state, aliases, and structure summary.
 */
export function searchCities(query: string): CityEntry[] {
  if (!query || !query.trim()) {
    return getAllCities();
  }
  const q = query.trim().toLowerCase();
  return CITY_CATALOGUE.filter((city) => {
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

/**
 * Retrieves cities belonging to a metro collection (e.g. 'NCR', 'MMR', 'Tricity').
 */
export function getCitiesByMetro(metro: string): CityEntry[] {
  if (!metro || !metro.trim()) return [];
  const m = metro.trim().toLowerCase();
  return CITY_CATALOGUE.filter(
    (city) => city.metro_group && city.metro_group.toLowerCase() === m
  );
}
