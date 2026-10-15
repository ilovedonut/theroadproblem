import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMapDeckPages } from '../src/lib/map-deck-loader.ts';
import { matchRoadPrecisely, linkWorkSegmentsWithPrecision, normalizeChainage } from '../src/lib/matcher.ts';
import {importOsmRoads} from '../src/lib/osm/importer.ts';

const base={tender_id:'regression',package_name:'Regression',district:'Bengaluru Urban',road_name_hint:'First Main',coordinates:{lon:77.6,lat:12.97}};
const row={segment_id:'segment-one',road_id:'road-one',road_name:'First Main',road_ref:'NH-1',district:'Bengaluru Urban',layer:0};
const clientFor=rows=>({query:async()=>({rows})});

test('an arbitrary resume offset cannot skip roads without a verified saved run',async()=>{
  await assert.rejects(()=>importOsmRoads({query:async()=>{throw Error('No DB query expected');}},
    {checkpointOffset:100}),/saved run ID is required/);
});

test('viewport loader drains more than the old 600-road cap and deduplicates page overlaps',async()=>{
  const snapshots=[]; let calls=0;
  await loadMapDeckPages({params:new URLSearchParams('bbox=77,12,78,13'),signal:new AbortController().signal,
    fetchPage:async url=>{calls++;const cursor=new URL(url,'http://test').searchParams.get('cursor');
      return Response.json(cursor ? {roads:[{id:'599'},{id:'600'}],pagination:{has_more:false,next_cursor:null}}
        :{roads:Array.from({length:600},(_,i)=>({id:String(i)})),pagination:{has_more:true,next_cursor:'cursor-one'}});},
    onPage:(data,roads,complete)=>snapshots.push({length:roads.length,complete}),
  });
  assert.equal(calls,2);assert.deepEqual(snapshots,[{length:600,complete:false},{length:601,complete:true}]);
});
test('viewport pagination rejects failures and stalled cursors instead of claiming completeness',async()=>{
  await assert.rejects(()=>loadMapDeckPages({params:new URLSearchParams(),signal:new AbortController().signal,fetchPage:async()=>new Response('',{status:500}),onPage:()=>{}}),/retry/i);
  await assert.rejects(()=>loadMapDeckPages({params:new URLSearchParams(),signal:new AbortController().signal,fetchPage:async()=>Response.json({roads:[],pagination:{has_more:true,next_cursor:'same'}}),onPage:()=>{}}),/before this area was complete/i);
});
test('stale viewport response never renders after cancellation',async()=>{
  const controller=new AbortController();let rendered=false;
  await loadMapDeckPages({params:new URLSearchParams(),signal:controller.signal,fetchPage:async()=>{controller.abort();return Response.json({roads:[{id:'old'}]});},onPage:()=>{rendered=true;}});
  assert.equal(rendered,false);
});
test('coordinate evidence rejects contradictory district, reference and road name',async()=>{
  for(const change of [{district:'New Delhi'},{road_ref:'NONEXISTENT'},{road_name_hint:'NONEXISTENT'}]){
    const result=await matchRoadPrecisely(clientFor([row]),{...base,...change});
    assert.equal(result.review_status,'needs_review');assert.deepEqual(result.matched_segment_ids,[]);
    assert.match(result.ambiguity_reason,/conflicts/);
  }
});
test('nearby geometry remains discoverable but does not invent a project extent',async()=>{
  const result=await matchRoadPrecisely(clientFor([row]),base);
  assert.equal(result.review_status,'needs_review');assert.deepEqual(result.candidate_segment_ids,['segment-one']);
  assert.match(result.ambiguity_reason,/extent/);assert.notEqual(result.score,95);
  const noIdentity=await matchRoadPrecisely(clientFor([row]),{tender_id:'x',package_name:'x',coordinates:base.coordinates});
  assert.equal(noIdentity.review_status,'needs_review');
});
test('invalid coordinates and invalid or incomplete chainage never reach spatial SQL',async()=>{
  const client={query:async()=>{throw Error('SQL must not execute');}};
  for(const change of [{coordinates:{lon:181,lat:12}},{chainage_start_km:2,chainage_end_km:1},{chainage_start_km:0},{chainage_start:0,chainage_end:500},{chainage_start_km:'',chainage_end_km:1}]){
    assert.equal((await matchRoadPrecisely(client,{...base,...change})).review_status,'needs_review');
  }
  assert.deepEqual(normalizeChainage({chainage_start:1000,chainage_end:2500,chainage_unit:'m'}),{start:1,end:2.5});
  assert.match(normalizeChainage({chainage_start_km:1,chainage_end_km:2,chainage_start:0,chainage_end:2000,chainage_unit:'m'}).error,/Conflicting/);
});
test('project geometry is used to retrieve review candidates',async()=>{
  const geometry={type:'LineString',coordinates:[[77.6,12.97],[77.601,12.97]]};let params;
  const result=await matchRoadPrecisely({query:async(sql,p)=>{params=p;return {rows:[row]};}},{...base,coordinates:null,geometry_geojson:geometry});
  assert.equal(params[2],JSON.stringify(geometry));assert.equal(result.review_status,'needs_review');
  assert.deepEqual(result.candidate_segment_ids,['segment-one']);
});
test('competing carriageway grades require review even with identifying text and chainage',async()=>{
  const result=await matchRoadPrecisely(clientFor([row,{...row,segment_id:'elevated',layer:1}]),
    {...base,chainage_start_km:0,chainage_end_km:1});
  assert.equal(result.review_status,'needs_review');assert.match(result.ambiguity_reason,/grade/);
  assert.deepEqual(result.matched_segment_ids,[]);
});
test('review requests use stable source/work identities and save normalized metres',async()=>{
  const inserts=[];const client={query:async(sql,p)=>{
    if(sql.includes('INSERT INTO ambiguous_matches_queue')){inserts.push(p);return {rows:[]};}
    return {rows:[row]};
  }};
  const target={...base,chainage_start:1000,chainage_end:2000,chainage_unit:'m',geometry_geojson:{type:'LineString',coordinates:[[77.6,12.97],[77.601,12.97]]}};
  await linkWorkSegmentsWithPrecision(client,'work',target,'source');await linkWorkSegmentsWithPrecision(client,'work',target,'source');
  assert.equal(inserts[0][10],inserts[1][10]);assert.equal(inserts[0][6],1);assert.equal(inserts[0][7],2);
  await linkWorkSegmentsWithPrecision(client,'work',target,'revised-source');assert.notEqual(inserts[0][10],inserts[2][10]);
});
test('authoritative corridor chainage has a positive control and district contradictions veto it',async()=>{
  const client={query:async(sql)=>({rows:sql.includes('LEFT JOIN road_segments')
    ?[{id:'corridor',name:'First Main',ref:'NH-1',district:'Bengaluru Urban',is_official_corridor:true}]
    :[{id:'segment',chainage_from:0,chainage_to:2}]})};
  const target={...base,coordinates:null,road_ref:'NH-1',chainage_start_km:0,chainage_end_km:1};
  const positive=await matchRoadPrecisely(client,target);assert.equal(positive.review_status,'approved');assert.deepEqual(positive.matched_segment_ids,['segment']);
  assert.equal((await matchRoadPrecisely(client,{...target,district:'New Delhi'})).review_status,'needs_review');
});
