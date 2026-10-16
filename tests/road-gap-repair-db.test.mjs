import '../scripts/test-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pool} from '../src/db/client.ts';
import {GET as deck} from '../src/app/api/v1/map/deck/route.ts';
import {GET as areaSummary} from '../src/app/api/v1/map/summary/route.ts';
import {linkWorkSegmentsWithPrecision,matchRoadPrecisely} from '../src/lib/matcher.ts';

test('actual viewport API retrieves every road beyond 600 with deterministic keyset pages',async()=>{
  const client=await pool.connect();const ids=Array.from({length:605},()=>crypto.randomUUID());
  try{
    await client.query('BEGIN');
    await client.query(`INSERT INTO roads(id,name,state,district,road_class)
      SELECT id,'Coverage regression '||id::text,'Karnataka','Bengaluru Urban','residential' FROM unnest($1::uuid[]) id`,[ids]);
    await client.query(`INSERT INTO road_segments(road_id,state,district,chainage_from,chainage_to,length_m,geom,is_active)
      SELECT id,'Karnataka','Bengaluru Urban',0,0.1,100,ST_GeomFromText('LINESTRING(77.571 12.951,77.572 12.952)',4326),TRUE FROM unnest($1::uuid[]) id`,[ids]);
    await client.query('COMMIT');
    const found=new Set();let cursor=null;let pages=0;
    do{
      const url=new URL('http://test/api/v1/map/deck?bbox=77.5705,12.9505,77.5725,12.9525&zoom=15&limit=100');
      if(cursor)url.searchParams.set('cursor',cursor);
      const response=await deck(new Request(url));assert.equal(response.status,200);
      const data=await response.json();assert.ok(data.roads.length<=100);
      for(const road of data.roads){assert.equal(found.has(road.id),false,'No duplicate across pages');found.add(road.id);}
      cursor=data.pagination.next_cursor;assert.equal(data.pagination.has_more,!!cursor);
      pages++;assert.ok(pages<100,'Cursor must terminate');
    }while(cursor);
    for(const id of ids)assert.ok(found.has(id),`Missing fixture road ${id}`);
    assert.ok(pages>=7);
    assert.equal((await deck(new Request('http://test/api/v1/map/deck?cursor=bad'))).status,400);
  }finally{
    await client.query('ROLLBACK');
    await client.query('DELETE FROM road_segments WHERE road_id=ANY($1::uuid[])',[ids]);
    await client.query('DELETE FROM roads WHERE id=ANY($1::uuid[])',[ids]);
    client.release();
  }
});
test('persisted review deduplication, metre units and automatic-link revision preserve manual decisions',async()=>{
  const client=await pool.connect();const roadId=crypto.randomUUID(),workId=crypto.randomUUID();
  try{
    await client.query('BEGIN');
    await client.query(`INSERT INTO roads(id,name,state,district,road_class,is_official_corridor) VALUES($1,'Precision fixture','Karnataka','Bengaluru Urban','primary',TRUE)`,[roadId]);
    const segments=(await client.query(`INSERT INTO road_segments(road_id,state,district,chainage_from,chainage_to,length_m,geom,is_active)
      SELECT $1,'Karnataka','Bengaluru Urban',i,i+1,100,ST_GeomFromText('LINESTRING(77.571 12.951,77.572 12.952)',4326),TRUE FROM generate_series(0,1) i RETURNING id,chainage_from`,[roadId])).rows.sort((a,b)=>a.chainage_from-b.chainage_from);
    await client.query(`INSERT INTO works(id,tender_id,package_name,authority_name,work_type,official_status) VALUES($1,$2,'Fixture','Fixture','maintenance','unknown')`,[workId,`GAP-${workId}`]);
    await client.query(`INSERT INTO work_segments(work_id,road_segment_id,matching_confidence,review_status,review_notes) VALUES
      ($1,$2,'medium_corridor_chainage','approved','Matched road Precision fixture with score 45'),
      ($1,$3,'manual_verified','approved','Manual decision')`,[workId,segments[0].id,segments[1].id]);
    const target={tender_id:`GAP-${workId}`,package_name:'Fixture',district:'Bengaluru Urban',road_name_hint:'Precision fixture',chainage_start:0,chainage_end:1000,chainage_unit:'m'};
    assert.equal((await linkWorkSegmentsWithPrecision(client,workId,target)).review_status,'approved');
    const stored=(await client.query('SELECT chainage_start_km,chainage_end_km FROM work_segments WHERE work_id=$1 AND road_segment_id=$2',[workId,segments[0].id])).rows[0];
    assert.equal(Number(stored.chainage_end_km),1);
    const bad={...target,district:'New Delhi'};
    await linkWorkSegmentsWithPrecision(client,workId,bad);await linkWorkSegmentsWithPrecision(client,workId,bad);
    const links=(await client.query('SELECT matching_confidence,review_status FROM work_segments WHERE work_id=$1',[workId])).rows;
    assert.equal(links.find(row=>row.matching_confidence==='manual_verified').review_status,'approved');
    assert.equal(links.find(row=>row.matching_confidence!=='manual_verified').review_status,'needs_review');
    assert.equal(Number((await client.query('SELECT count(*) FROM ambiguous_matches_queue WHERE work_id=$1',[workId])).rows[0].count),1);
    assert.equal(Number((await client.query("SELECT count(*) FROM events WHERE entity_id=$1 AND event_type='automatic_road_attribution_superseded'",[workId])).rows[0].count),1);
    assert.equal((await matchRoadPrecisely(client,{...target,chainage_end:3000})).review_status,'needs_review','Incomplete indexed chainage must not allocate the whole project');
  }finally{await client.query('ROLLBACK');client.release();}
});

test('fast city pages preserve fallback classes, selected roads and exact clipped area lengths',async()=>{
  const client=await pool.connect();
  const ids=Array.from({length:5},()=>crypto.randomUUID());
  const bbox='77.800,12.800,77.810,12.810';
  try {
    await client.query('BEGIN');
    for (const [index,id] of ids.entries()) {
      await client.query(`INSERT INTO roads(id,name,state,district,road_class,authority_name,is_official_corridor)
        VALUES($1,'Map loading regression','Karnataka','Bengaluru Urban',$2,'Map fixture authority',$3)`,
        [id,index===1?'primary':'residential',index===2]);
      const line=index===3?'LINESTRING(77.82 12.82,77.821 12.821)':
        index===4?'LINESTRING(77.799 12.805,77.811 12.805)':'LINESTRING(77.801 12.801,77.802 12.802)';
      await client.query(`INSERT INTO road_segments(road_id,state,district,chainage_from,chainage_to,length_m,geom,is_active,road_class)
        VALUES($1,'Karnataka','Bengaluru Urban',0,1,1000,ST_GeomFromText($2,4326),TRUE,$3)`,
        [id,line,index===0||index===3?'residential':index===1?null:'primary']);
    }
    await client.query('COMMIT');
    const response=await deck(new Request(`http://test/api/v1/map/deck?bbox=${bbox}&zoom=10&include_index_stats=false&selected_road_id=${ids[3]}`));
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.summary,undefined,'Geometry refresh must not recalculate district totals');
    assert.ok(Array.isArray(data.signals));
    const found=new Set(data.roads.map(r=>r.id));
    assert.equal(found.has(ids[0]),false,'Minor unselected road is hidden at city zoom');
    for(const id of ids.slice(1))assert.ok(found.has(id),'Fallback, official, selected and crossing roads remain visible');
    const reference=(await client.query(`SELECT SUM(ST_Length(ST_CollectionExtract(ST_Intersection(geom,
      ST_MakeEnvelope(77.800,12.800,77.810,12.810,4326)),2)::geography))/1000 AS km,
      count(distinct road_id) AS roads FROM road_segments WHERE is_active
      AND COALESCE(usage_category,'public_motor') IN ('public_motor','restricted_motor')
      AND ST_Intersects(geom,ST_MakeEnvelope(77.800,12.800,77.810,12.810,4326))`)).rows[0];
    const summaryResponse=await areaSummary(new Request(`http://test/api/v1/map/summary?bbox=${bbox}`));
    assert.equal(summaryResponse.status,200);
    const summary=await summaryResponse.json();
    assert.equal(Number(summary.roads),Number(reference.roads));
    assert.ok(Math.abs(Number(summary.road_km)-Number(reference.km))<0.000001,'Containment shortcut must preserve clipped geodesic length');
    assert.ok(summary.authorities.includes('Map fixture authority'));
    assert.equal((await client.query('SHOW statement_timeout')).rows[0].statement_timeout,'0','Query budget must not leak into the pool');
  } finally {
    await client.query('ROLLBACK');
    await client.query('DELETE FROM road_segments WHERE road_id=ANY($1::uuid[])',[ids]);
    await client.query('DELETE FROM roads WHERE id=ANY($1::uuid[])',[ids]);
    client.release();
  }
});
test.after(async()=>pool.end());
