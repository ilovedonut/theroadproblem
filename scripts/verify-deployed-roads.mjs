import fs from 'node:fs';
import assert from 'node:assert/strict';

const base='https://theroadproblem.quest';
const report={checked_at:new Date().toISOString(),base,checks:[]};
try {
  const health=await fetch(`${base}/api/v1/health`,{signal:AbortSignal.timeout(30000)});
  const healthBody=await health.json();
  report.checks.push({name:'health',status:health.status,body:healthBody});
  assert.equal(health.status,200);assert.equal(healthBody.status,'healthy');
  const path='/api/v1/map/deck?bbox=77.60,12.965,77.605,12.97&zoom=16&limit=10';
  const first=await fetch(base+path,{signal:AbortSignal.timeout(60000)});
  const page=await first.json();
  report.checks.push({name:'first_page',status:first.status,returned:page.roads?.length,pagination:page.pagination});
  assert.equal(first.status,200);assert.equal(page.roads.length,10);assert.equal(page.pagination.has_more,true);
  const second=await fetch(base+path+'&cursor='+page.pagination.next_cursor,{signal:AbortSignal.timeout(60000)});
  const next=await second.json();
  const overlap=(next.roads || []).filter(road=>page.roads.some(previous=>previous.id===road.id)).length;
  report.checks.push({name:'continuation',status:second.status,returned:next.roads?.length,overlap,pagination:next.pagination});
  assert.equal(second.status,200);assert.equal(next.roads.length,10);assert.equal(overlap,0);
  report.passed=true;console.log('DEPLOYED_ROAD_PAGINATION_PASSED');
} catch(error){report.passed=false;report.error=error.message;process.exitCode=1;console.error(error.message);}
finally{fs.mkdirSync('docs/road-gap-repair',{recursive:true});fs.writeFileSync('docs/road-gap-repair/deployed-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
