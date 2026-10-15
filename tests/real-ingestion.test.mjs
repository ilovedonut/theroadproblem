import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parsePppac,fetchPppac} from '../src/lib/ingestor/adapters/pppac.ts';
const page=fs.readFileSync('tests/fixtures/pppac-karnataka.html','utf8');
test('official page parses exact rupees and preserves missing contract facts',()=>{
 const rows=parsePppac(page),r=rows.find(r=>r.package_name.includes('Bangalore-Nidagatta'));
 assert.ok(rows.length>0);assert.equal(r.approved_project_cost_inr,'19953400000');assert.equal(r.approval_date,'2017-05-17');
 assert.equal(r.road_ref,'NH-275');assert.equal(r.chainage_start_km,18);assert.equal(r.chainage_end_km,74.2);
 assert.equal(r.contractor,undefined);assert.equal(r.contract_value_inr,undefined);
});
test('reordering, formatting and cost revisions do not change identity',()=>{
 const original=parsePppac(page),changed=parsePppac(page.replace('1,995.34','2,000.00'));
 assert.deepEqual(original.map(r=>r.external_key),changed.map(r=>r.external_key));
 assert.notEqual(original.find(r=>r.package_name.includes('Bangalore-Nidagatta')).approved_project_cost_inr,changed.find(r=>r.package_name.includes('Bangalore-Nidagatta')).approved_project_cost_inr);
});
test('missing table, malformed amount and empty road list fail closed',()=>{
 assert.throws(()=>parsePppac('<h1>Maintenance</h1>'));
 assert.throws(()=>parsePppac(page.replace('1,995.34','not known')));
 assert.throws(()=>parsePppac(page.replaceAll('>Roads<','>Airport<')));
});
test('transient HTTP failure retries and returns raw bytes',async()=>{
 let calls=0;const result=await fetchPppac({sleep:async()=>{},fetcher:async()=>++calls===1?new Response('',{status:503}):new Response(page,{headers:{'content-type':'text/html'}})});
 assert.equal(calls,2);assert.equal(result.body.toString(),page);assert.equal(result.checksum.length,64);
});
test('permanent HTTP failures stop immediately and retry count is bounded',async()=>{
 let calls=0;await assert.rejects(fetchPppac({sleep:async()=>{},fetcher:async()=>{calls++;return new Response('',{status:403})}}));assert.equal(calls,1);
 calls=0;await assert.rejects(fetchPppac({sleep:async()=>{},fetcher:async()=>{calls++;throw Error('connection reset')}}));assert.equal(calls,3);
});
