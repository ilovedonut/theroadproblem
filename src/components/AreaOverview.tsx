'use client';
import { useEffect,useState } from 'react';
import type { MapBounds } from '@/lib/map-bounds';
const money=(v:unknown)=>v==null?'Not available':new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(v));
export function AreaOverview({bounds}:{bounds:MapBounds|null}) {
  const [data,setData]=useState<any>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const key=bounds?.join(',');
  useEffect(()=>{setData(null);setError('');if(!key)return;const c=new AbortController();const timer=setTimeout(()=>{fetch(`/api/v1/map/summary?bbox=${key}`,{signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setData(d)}).catch(e=>{if(!c.signal.aborted)setError(e.message)})},350);return()=>{clearTimeout(timer);c.abort()}},[key,retry]);
  if(error)return <div role="alert" className="p-5 text-sm">{error}<button className="block mt-3 underline text-information" onClick={()=>setRetry(n=>n+1)}>Retry area summary</button></div>;
  if(!data)return <p role="status" className="p-5 text-sm text-muted">Updating this map area…</p>;
  const roads=Number(data.roads),issues=Number(data.open_issues);
  const rows=[['Indexed roads',roads.toLocaleString('en-IN')],['Road length in view',`${Number(data.road_km).toFixed(1)} km`],['Linked projects',data.projects],['Contractors',data.contractors],['Open issues',issues],['Roads with open issues',data.affected_roads],['Issues per 100 roads',roads?(issues/roads*100).toFixed(1):'Not available'],['Average repair time',data.average_repair_days==null?'Not available':`${Number(data.average_repair_days).toFixed(1)} days`]];
  return <div className="p-5 text-sm space-y-6">
    <p className="text-muted">Pan or zoom the map to explore the records in this view.</p>
    <section><h3 className="font-semibold text-base mb-3">Budgets & spending</h3><dl className="space-y-3"><div><dt className="text-muted">Recorded actual spending</dt><dd className="font-semibold">Not available</dd></div><div><dt className="text-muted">Full budgets of linked projects</dt><dd className="font-semibold tabular-nums">{money(data.linked_budget_inr)}</dd></div><div><dt className="text-muted">Estimated budget within this view</dt><dd className="font-semibold text-information tabular-nums">{money(data.estimated_area_budget_inr)}</dd></div></dl><p className="text-xs text-muted mt-3">{data.priced_projects} of {data.projects} projects have a recorded budget. The area estimate allocates each budget by its mapped road length in view; it does not measure payments.</p></section>
    <section><h3 className="font-semibold text-base mb-2">Roads & repairs</h3><dl className="divide-y divide-line">{rows.map(([label,value])=><div key={String(label)} className="flex justify-between gap-4 py-2.5"><dt className="text-muted">{label}</dt><dd className="font-semibold tabular-nums text-right">{value}</dd></div>)}</dl><p className="text-xs text-muted mt-3">Repair average uses {data.repair_sample} resolved issues with recorded dates, excluding reopened cases. {data.unmatched_issues} open issues have no matched road.</p></section>
    <section><h3 className="font-semibold text-base mb-2">Responsible authorities · {data.authorities.length}</h3>{data.authorities.length?<ul className="space-y-2">{data.authorities.map((a:string)=><li key={a}>{a}</li>)}</ul>:<p className="text-muted">No authority recorded for this view.</p>}</section>
    <p className="text-xs text-muted border-t border-line pt-4">Coverage reflects indexed roads and published reports, not every road or issue. Calculated {new Date(data.calculated_at).toLocaleTimeString()}.</p>
  </div>
}
