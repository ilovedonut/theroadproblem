import fs from 'node:fs';
import crypto from 'node:crypto';
import {pool} from '../src/db/client.ts';
import {classifyOsmWayTags} from '../src/lib/osm/classification.ts';
import {clipWayToBoundary,loadVerifiedBengaluruBoundary} from '../src/lib/osm/boundary.ts';

const inputPath=process.argv[2] || 'scripts/data/bengaluru_urban_roads.osm.json';
const outputPath=process.argv[3] || 'docs/road-gap-repair/coverage-audit.json';
const payload=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const boundary=loadVerifiedBengaluruBoundary();
const expected=new Set();const rejections={};
for(const way of payload.elements){
  let reason=null;
  const category=classifyOsmWayTags(way.tags || {});
  if(way.type!=='way' || way.deleted)reason='not_current_way';
  else if(!category.included)reason=category.rejectionReason || 'excluded_class';
  else if(!Array.isArray(way.geometry) || way.geometry.length<2)reason='invalid_geometry';
  else{
    const clip=clipWayToBoundary(way.geometry,boundary);
    if(clip.status==='outside' || clip.status==='invalid' || clip.primaryClippedCoords.length<2)reason=clip.status;
  }
  if(reason)rejections[reason]=(rejections[reason] || 0)+1;
  else expected.add(String(way.id));
}
pool.options.connectionTimeoutMillis=30000;
const client=await pool.connect();
try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='60s'");
  const active=(await client.query(`SELECT DISTINCT osm_way_id::text AS id FROM road_segments
    WHERE is_active=TRUE AND district=$1 AND osm_way_id IS NOT NULL`,['Bengaluru Urban'])).rows;
  const ids=new Set(active.map(row=>row.id));
  const missing=[...expected].filter(id=>!ids.has(id));
  const runs=(await client.query(`SELECT id,status,ways_count,checkpoint_offset,inserted_count,updated_count,
    skipped_count,checksum_sha256,started_at,completed_at FROM osm_imports WHERE district=$1
    ORDER BY started_at DESC LIMIT 4`,['Bengaluru Urban'])).rows;
  const counts=(await client.query(`SELECT COUNT(*) AS active_segments,COUNT(DISTINCT road_id) AS active_roads,
    COUNT(DISTINCT osm_way_id) AS active_osm_ways FROM road_segments WHERE is_active=TRUE AND district=$1`,['Bengaluru Urban'])).rows[0];
  await client.query('COMMIT');
  const report={checked_at:new Date().toISOString(),input_file:inputPath,
    source_checksum:crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    boundary_checksum:boundary.checksum_sha256,expected_eligible_ways:expected.size,
    expected_present:expected.size-missing.length,missing_count:missing.length,
    missing_way_ids:missing,active_counts:counts,extra_active_way_count:[...ids].filter(id=>!expected.has(id)).length,
    rejected_source_elements:rejections,runs,
    scope:'Eligible motor ways in this saved extract within Bengaluru Urban; not a claim of all real-world roads.'};
  fs.mkdirSync(new URL('../docs/road-gap-repair/',import.meta.url),{recursive:true});
  fs.writeFileSync(outputPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,missing_way_ids:missing.slice(0,10)}));
  if(missing.length)process.exitCode=1;
  else console.log('ROAD_EXTRACT_COVERAGE_PASSED');
}catch(error){await client.query('ROLLBACK');throw error;}
finally{client.release();await pool.end();}
