async function fetchSector(name, bbox) {
  console.log(`Fetching sector ${name} (${bbox})...`);
  const query = `[out:json][timeout:35];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|living_street"](${bbox});
);
out body geom;`;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'User-Agent': 'TheRoadProblem-Pilot/1.0 (+https://theroadproblem.quest)'
      },
      body: 'data=' + encodeURIComponent(query)
    });
    if (!res.ok) {
      console.warn(`Sector ${name} HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    console.log(`Sector ${name}: ${data.elements?.length} ways retrieved.`);
    return data.elements;
  } catch (err) {
    console.error(`Sector ${name} error:`, err.message);
    return null;
  }
}

async function run() {
  const fs = await import('node:fs');
  // Sector 1: Bangalore CBD (MG Road, Kasturba Road, Residency Road, Church St)
  // 12.965 to 12.980, 77.590 to 77.615
  const cbd = await fetchSector('CBD', '12.965,77.590,12.980,77.615');

  // Sector 2: Hosur Road / Electronic City (Elevated vs Surface)
  // 12.845 to 12.870, 77.655 to 77.680
  const ecity = await fetchSector('Electronic_City_Hosur_Rd', '12.845,77.655,12.870,77.680');

  // Sector 3: Outer Ring Road / Silk Board / Bellandur
  // 12.915 to 12.940, 77.620 to 77.680
  const orr = await fetchSector('ORR_Bellandur', '12.915,77.620,12.940,77.680');

  const allWays = [];
  const seenIds = new Set();
  for (const list of [cbd, ecity, orr]) {
    if (list) {
      for (const w of list) {
        if (!seenIds.has(w.id)) {
          seenIds.add(w.id);
          allWays.push(w);
        }
      }
    }
  }

  console.log(`Total unique ways collected: ${allWays.length}`);
  if (allWays.length > 0) {
    fs.writeFileSync('scripts/data/bengaluru_roads_osm_sample.json', JSON.stringify({
      district: "Bengaluru Urban",
      state: "Karnataka",
      source: "OpenStreetMap Contributors",
      license: "ODbL 1.0 (https://www.openstreetmap.org/copyright)",
      retrieved_at: new Date().toISOString(),
      elements: allWays
    }, null, 2));
    console.log('Saved to scripts/data/bengaluru_roads_osm_sample.json');
  }
}

run();
