async function run() {
  const query = `[out:json][timeout:25];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|service|unclassified"](12.970,77.590,12.975,77.598);
);
out body geom qt 20;`;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'User-Agent': 'TheRoadProblem-Pilot/1.0 (+https://theroadproblem.quest)'
      },
      body: 'data=' + encodeURIComponent(query)
    });
    const data = await res.json();
    console.log('Total elements returned:', data.elements?.length);
    if (data.elements?.length > 0) {
      console.log('Sample element:', {
        id: data.elements[0].id,
        tags: data.elements[0].tags,
        geometryPointsCount: data.elements[0].geometry?.length
      });
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}
run();
