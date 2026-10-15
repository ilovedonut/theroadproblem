'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
export type SearchResult = { kind:string; id:string; title:string; detail:string; href:string; source_url:string|null };
export function GlobalSearch() {
  const [q,setQ]=useState(''),[results,setResults]=useState<SearchResult[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[active,setActive]=useState(-1);
  const root=useRef<HTMLDivElement>(null); const router=useRouter();
  useEffect(()=>{ const close=(e:MouseEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)}; document.addEventListener('mousedown',close); return()=>document.removeEventListener('mousedown',close); },[]);
  useEffect(()=>{
    setResults([]);setActive(-1);setError('');
    if(q.trim().length<2){setBusy(false);return}
    const controller=new AbortController();setBusy(true);
    const timer=setTimeout(async()=>{try{const res=await fetch(`/api/v1/search?q=${encodeURIComponent(q.trim())}`,{signal:controller.signal});const data=await res.json();if(!res.ok)throw Error(data.error);setResults(['road','project','place','address','source'].flatMap(kind=>data.results.filter((r:SearchResult)=>r.kind===kind).slice(0,2)));}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Search unavailable.');}finally{if(!controller.signal.aborted)setBusy(false)}},300);
    return()=>{clearTimeout(timer);controller.abort()};
  },[q]);
  return <div ref={root} className="relative w-full">
    <Search className="absolute left-3 top-3 w-4 h-4 text-muted"/>
    <input aria-label="Search roads, projects and places" role="combobox" aria-expanded={open} aria-controls="global-search-results" aria-autocomplete="list" aria-activedescendant={active>=0?`search-option-${active}`:undefined} value={q} maxLength={120} onChange={e=>{setQ(e.target.value);setOpen(true)}} onFocus={()=>setOpen(true)} onKeyDown={e=>{
      if(e.key==='Escape')setOpen(false);
      if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(a=>Math.min(a+1,results.length-1))}
      if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(a-1,0))}
      if(e.key==='Enter'&&q.trim().length>=2){e.preventDefault();router.push(active>=0&&results[active]?results[active].href:`/search?q=${encodeURIComponent(q.trim())}`);setOpen(false)}
    }} placeholder="Search roads, tenders, contractors, places…" className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-10 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-information"/>
    {q&&<button aria-label="Clear search" onClick={()=>setQ('')} className="absolute right-1 top-0 h-10 w-10 flex items-center justify-center text-muted"><X className="w-4 h-4"/></button>}
    {open&&<div className="absolute top-full mt-2 w-full max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-lg text-sm">
      <div id="global-search-results" role="listbox" aria-label="Search results">
      {results.map((r,i)=><Link role="option" aria-selected={i===active} id={`search-option-${i}`} key={`${r.kind}:${r.id}`} href={r.href} onClick={()=>setOpen(false)} className={`block px-4 py-3 border-b border-line hover:bg-soft ${i===active?'bg-soft':''}`}><span className="text-xs text-muted capitalize">{r.kind}</span><span className="block font-semibold truncate">{r.title}</span><span className="block text-xs text-muted truncate">{r.detail}</span></Link>)}
      </div>
      <p role="status" className="px-4 py-3 text-muted">{q.trim().length<2?'Search public roads, projects, sources and indexed places.':busy?'Searching…':error||(!results.length?'No matching records. Try a road name or district.':'')}</p>
      {q.trim().length>=2&&<Link href={`/search?q=${encodeURIComponent(q.trim())}`} onClick={()=>setOpen(false)} className="block px-4 pb-3 text-information font-semibold">View all results</Link>}
    </div>}
  </div>;
}
