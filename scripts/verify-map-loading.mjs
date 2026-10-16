import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pool,withTransaction} from '../src/db/client.ts';

const base=process.env.MAP_BASE_URL||'https://theroadproblem.quest';
const cases=[
  {name:'requested-area',bbox:[77.59766954096631,12.963176237505582,77.6073304590368,12.975533679276158],zoom:15.29,limit:600},
  {name:'city-view',bbox:[77.47590248086419,12.817922298552277,77.73835872490554,13.153546086110113],zoom:10.53,limit:2500},
  {name:'fitted-city-viewport',bbox:[77.10973151424355,12.785095942028317,78.10452969152993,13.364246671374257],zoom:10.35,limit:2500},
];
const evidence={base,checked_at:new Date().toISOString(),cases:[]};
try {
  for(const item of cases){
    // Independent, read-only reference query; do not infer completeness from
    // the API's own has_more flag or a hardcoded minimum road count.
    const reference=await withTransaction(async client=>{
      await client.query("SET TRANSACTION READ ONLY; SET LOCAL statement_timeout='30000'");
      return client.query(`SELECT DISTINCT rs.road_id FROM road_segments rs JOIN roads r ON r.id=rs.road_id
        WHERE rs.is_active AND r.name NOT LIKE 'Test %'
        AND COALESCE(rs.usage_category,'public_motor') IN ('public_motor','restricted_motor')
        AND ST_Intersects(rs.geom,ST_MakeEnvelope($1,$2,$3,$4,4326))
        AND (NOT $5::boolean OR COALESCE(rs.road_class,r.road_class) IN
          ('motorway','trunk','primary','secondary','tertiary','motorway_link','trunk_link','primary_link','secondary_link')
          OR r.is_official_corridor
          OR EXISTS(SELECT 1 FROM work_segments w WHERE w.road_segment_id=rs.id)
          OR EXISTS(SELECT 1 FROM incidents i WHERE i.road_segment_id=rs.id AND i.lifecycle_status='active'))`,
        [...item.bbox,item.zoom<11.5]);
    });
    const expected=reference.rows.map(r=>r.road_id).sort();
    const ids=new Set(),pages=[];let cursor=null;
    const started=Date.now();
    do {
      const url=new URL('/api/v1/map/deck',base);
      url.search=new URLSearchParams({bbox:item.bbox.join(','),zoom:String(item.zoom),limit:String(item.limit),include_index_stats:'false'});
      if(cursor)url.searchParams.set('cursor',cursor);
      const t=Date.now();const r=await fetch(url,{signal:AbortSignal.timeout(30000)});
      assert.equal(r.status,200,await r.clone().text());
      const d=await r.json();
      assert.ok(d.pagination,'Expected paginated road response');
      for(const road of d.roads){assert.ok(!ids.has(road.id),'Duplicate road across pages');ids.add(road.id);}
      pages.push({ms:Date.now()-t,roads:d.roads.length});
      cursor=d.pagination.next_cursor;
      assert.equal(d.pagination.has_more,Boolean(cursor));
      assert.ok(pages.length<100,'Pagination must terminate');
    }while(cursor);
    assert.deepEqual([...ids].sort(),expected,'Every matching indexed road must be returned');
    const roadMs=Date.now()-started;
    const t=Date.now();const response=await fetch(new URL(`/api/v1/map/summary?bbox=${item.bbox.join(',')}`,base),{signal:AbortSignal.timeout(30000)});
    assert.equal(response.status,200,await response.clone().text());
    const summary=await response.json();
    assert.ok(Number(summary.roads)>=ids.size,'Summary includes minor roads at city zoom');
    const result={name:item.name,roads:ids.size,pages,road_ms:roadMs,summary_ms:Date.now()-t,summary_roads:Number(summary.roads)};
    evidence.cases.push(result);console.log(JSON.stringify(result));
  }
  evidence.passed=true;
  console.log('Live map loading verification passed');
}finally{
  fs.mkdirSync('output/map-load',{recursive:true});
  fs.writeFileSync('output/map-load/deployed-verification.json',JSON.stringify(evidence,null,2));
  await pool.end();
}
