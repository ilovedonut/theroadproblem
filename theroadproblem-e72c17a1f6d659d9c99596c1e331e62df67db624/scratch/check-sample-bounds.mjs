import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve('scripts/data/bengaluru_roads_osm_sample.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
let wayCount = 0;

for (const el of data.elements) {
  if (el.type === 'way' && el.geometry) {
    wayCount++;
    for (const pt of el.geometry) {
      if (pt.lon < minLon) minLon = pt.lon;
      if (pt.lon > maxLon) maxLon = pt.lon;
      if (pt.lat < minLat) minLat = pt.lat;
      if (pt.lat > maxLat) maxLat = pt.lat;
    }
  }
}

console.log('Sample file summary:');
console.log(`  Total elements: ${data.elements.length}`);
console.log(`  Ways count: ${wayCount}`);
console.log(`  Bounding box: Lon [${minLon.toFixed(4)}, ${maxLon.toFixed(4)}], Lat [${minLat.toFixed(4)}, ${maxLat.toFixed(4)}]`);
