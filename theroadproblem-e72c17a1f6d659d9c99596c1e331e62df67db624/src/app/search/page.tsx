'use client';
import { Suspense,useEffect,useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { SearchResult } from '@/components/GlobalSearch';
function Results(){
  const params=useSearchParams(),q=params.get('q')||'',focus=params.get('focus');
  const [results,setResults]=useState<SearchResult[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{const c=new AbortController();setBusy(true);setError('');fetch(`/api/v1/search?q=${encodeURIComponent(q)}`,{signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setResults(d.results)}).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setBusy(false)});return()=>c.abort()},[q,retry]);
  return <div className="overflow-y-auto flex-1"><div className="max-w-4xl mx-auto p-6 md:p-10 text-ink"><Link href="/" className="text-information">Back to map</Link><h1 className="text-3xl font-semibold mt-6 mb-2">Search results</h1><p className="text-muted mb-8">Public records matching “{q}”. Up to 12 results per type.</p>
    {busy?<p role="status">Searching…</p>:error?<div role="alert">{error} <button onClick={()=>setRetry(n=>n+1)} className="underline">Retry</button></div>:!results.length?<p>No matches. Try another road name, tender ID or district using the search above.</p>:['road','project','place','address','source'].map(kind=>{const rows=results.filter(r=>r.kind===kind);return rows.length?<section key={kind} className="mb-8"><h2 className="text-xl font-semibold capitalize mb-3">{kind}s</h2><ul className="divide-y divide-line">{rows.map(r=><li key={r.id} className={`py-4 ${focus===`${kind}:${r.id}`?'bg-soft px-3 rounded-lg':''}`}><Link href={r.href} className="font-semibold text-information">{r.title}</Link><p className="text-sm text-muted mt-1 break-words">{r.detail}</p>{r.source_url&&<a href={r.source_url} target="_blank" rel="noopener noreferrer" className="inline-block text-sm underline mt-2">Original source</a>}</li>)}</ul></section>:null})}
  </div></div>
}
export default function SearchPage(){return <Suspense fallback={<p className="p-6">Loading search…</p>}><Results/></Suspense>}
