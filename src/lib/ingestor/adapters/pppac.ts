import crypto from 'node:crypto';
import { load } from 'cheerio';

export const PPPAC_URL = 'https://www.pppinindia.gov.in/pppac-statewises/pppac-projects-list_Karnataka';
export const PPPAC_SOURCE = 'Department of Economic Affairs — PPPAC Karnataka road approvals';
export const PPPAC_PUBLISHER = 'Department of Economic Affairs, Ministry of Finance, Government of India';
export const PARSE_VERSION = 'pppac-karnataka-v1';
const headers = ['Sr No.','Project Name','Sponsoring Authority','Location','Sector','Sub Sector','Total Project Cost (In Rs. Crore)','PPPAC Meeting Date','Meeting Number','Recommended For'];
export const sha256 = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
export interface PppacProject {
  external_key:string; package_name:string; authority_name:string; state:string;
  approval_date:string; approval_status:string; approved_project_cost_inr:string;
  road_ref:string|null; chainage_start_km:number|null; chainage_end_km:number|null;
  original_fields:Record<string,string>;
}
function date(value:string) {
  const m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if(!m)throw new Error('Invalid PPPAC meeting date');
  const iso=`${m[3]}-${m[2]}-${m[1]}`;
  if(new Date(iso).toISOString().slice(0,10)!==iso)throw new Error('Invalid PPPAC calendar date');
  return iso;
}
export function parsePppac(html:string):PppacProject[] {
  const $=load(html);
  const table=$('table').toArray().find(t=>$(t).find('tr').first().find('th,td').toArray().map(c=>clean($(c).text())).join('|')===headers.join('|'));
  if(!table)throw new Error('PPPAC project table changed or is unavailable; refusing an empty success');
  const records:PppacProject[]=[],seen=new Set<string>();
  for(const row of $(table).find('tr').toArray().slice(1)) {
    const cells=$(row).children('th,td').toArray().map(c=>clean($(c).text()));
    if(!cells.length)continue;
    if(cells.length!==headers.length)throw new Error('Unexpected PPPAC row shape');
    if(cells[5]!=='Roads')continue;
    if(cells[3]!=='Karnataka'||!cells[1]||!cells[2]||!cells[8]||!cells[9])throw new Error('Missing PPPAC project identity');
    const amount=cells[6].replace(/,/g,'');
    if(!/^\d+(?:\.\d{1,2})?$/.test(amount))throw new Error('Invalid PPPAC approved project cost');
    const [whole,decimal='']=amount.split('.');
    const rupees=(BigInt(whole)*BigInt(10000000)+BigInt(decimal.padEnd(2,'0'))*BigInt(100000)).toString();
    // Row position, cost and approval outcome are mutable, not identity.
    const key=`pppac-ka-${sha256(`${cells[1].toLowerCase()}|${cells[8].toLowerCase()}`).slice(0,32)}`;
    if(seen.has(key))throw new Error('Duplicate PPPAC project identity');
    seen.add(key);
    const ref=/\bNH\s*[-–]?\s*(\d+[A-Za-z]?)/i.exec(cells[1]);
    const chainage=/from\s+km\.?\s*(\d+(?:\.\d+)?)\s+to\s+(?:km\.?\s*)?(\d+(?:\.\d+)?)/i.exec(cells[1]);
    records.push({external_key:key,package_name:cells[1],authority_name:cells[2],state:cells[3],approval_date:date(cells[7]),approval_status:cells[9],approved_project_cost_inr:rupees,road_ref:ref?`NH-${ref[1].toUpperCase()}`:null,chainage_start_km:chainage?Number(chainage[1]):null,chainage_end_km:chainage?Number(chainage[2]):null,original_fields:Object.fromEntries(headers.slice(1).map((h,i)=>[h,cells[i+1]]))});
  }
  if(!records.length||records.length>500)throw new Error('PPPAC road count outside safe bounds; source review required');
  return records;
}
export async function fetchPppac(options:{fetcher?:typeof fetch;sleep?:(ms:number)=>Promise<void>}={}) {
  const fetcher=options.fetcher||fetch,sleep=options.sleep||(ms=>new Promise(r=>setTimeout(r,ms)));
  let last:unknown;
  for(let attempt=0;attempt<3;attempt++) {
    try {
      const response=await fetcher(PPPAC_URL,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{Accept:'text/html','User-Agent':'TheRoadProblem/1.0 (+https://theroadproblem.quest/attributions)'}});
      if(!response.ok){const error=new Error(`PPPAC HTTP ${response.status}`);if(response.status<500&&response.status!==429)throw Object.assign(error,{permanent:true});throw error;}
      if(!response.headers.get('content-type')?.includes('text/html'))throw Object.assign(new Error('PPPAC returned an unexpected content type'),{permanent:true});
      if(Number(response.headers.get('content-length')||0)>2_000_000)throw new Error('PPPAC response too large');
      const reader=response.body?.getReader();if(!reader)throw new Error('PPPAC returned no response body');
      const chunks:Uint8Array[]=[];let size=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000)throw new Error('PPPAC response too large');chunks.push(value);}}finally{await reader.cancel();}
      const body=Buffer.concat(chunks),records=parsePppac(body.toString('utf8'));
      return {body,records,checksum:sha256(body),contentType:'text/html; charset=utf-8'};
    }catch(error){last=error;if((error as {permanent?:boolean}).permanent)break;if(attempt<2)await sleep(500*2**attempt);}
  }
  throw new Error(`Official PPPAC fetch failed: ${last instanceof Error?last.message:'unknown error'}`);
}
