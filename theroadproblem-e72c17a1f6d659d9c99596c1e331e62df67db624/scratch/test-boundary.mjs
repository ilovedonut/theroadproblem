async function fetchRamanagara() {
  try {
    const url = 'https://nominatim.openstreetmap.org/search?q=Ramanagara+District&format=geojson&polygon_geojson=1&limit=1';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'TheRoadProblem-Pilot/1.0 (contact@theroadproblem.quest)'
      }
    });
    const data = await res.json();
    if (data.features?.[0]) {
      const fs = await import('node:fs');
      fs.writeFileSync('scripts/data/ramanagara_boundary.geojson', JSON.stringify(data.features[0], null, 2));
      console.log('Saved Ramanagara boundary, OSM ID:', data.features[0].properties?.osm_id);
    }
  } catch (err) {
    console.error('Error fetching Ramanagara:', err);
  }
}
fetchRamanagara();
