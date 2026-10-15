import { GET as getNearestRoads } from '../src/app/api/v1/roads/nearest/route.ts';

async function testNearest() {
  console.log('Testing nearest road API endpoint...');

  // 1. MG Road (Inside Bengaluru Urban & inside bengaluru_cbd)
  const req1 = new Request('http://localhost/api/v1/roads/nearest?lon=77.5946&lat=12.9716&radius=150');
  const res1 = await (await getNearestRoads(req1)).json();
  console.log('\n1. MG Road (CBD):');
  console.log('  in_coverage:', res1.in_coverage);
  console.log('  coverage_status:', res1.coverage_status);
  console.log('  sector_key:', res1.sector_key);
  console.log('  candidates count:', res1.candidates.length);
  console.log('  message:', res1.message);

  // 2. Yelahanka (Inside Bengaluru Urban, but unindexed sector)
  // Coordinates for Yelahanka: 77.5963, 13.1007
  const req2 = new Request('http://localhost/api/v1/roads/nearest?lon=77.5963&lat=13.1007&radius=150');
  const res2 = await (await getNearestRoads(req2)).json();
  console.log('\n2. Yelahanka (Inside district, unindexed sector):');
  console.log('  in_coverage:', res2.in_coverage);
  console.log('  coverage_status:', res2.coverage_status);
  console.log('  coverage_area:', res2.coverage_area);
  console.log('  message:', res2.message);

  // 3. New Delhi (Outside Bengaluru Urban)
  const req3 = new Request('http://localhost/api/v1/roads/nearest?lon=77.2090&lat=28.6139&radius=150');
  const res3 = await (await getNearestRoads(req3)).json();
  console.log('\n3. New Delhi (Outside district boundary):');
  console.log('  in_coverage:', res3.in_coverage);
  console.log('  coverage_status:', res3.coverage_status);
  console.log('  message:', res3.message);
}

testNearest().catch(console.error);
