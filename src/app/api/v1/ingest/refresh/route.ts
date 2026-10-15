import { NextRequest, NextResponse } from 'next/server';
import { runAllIngestors } from '@/lib/ingestor/runner';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
  const token=process.env.INGEST_REFRESH_TOKEN;
  if(!token||req.headers.get('authorization')!==`Bearer ${token}`)return NextResponse.json({error:'Authorized operator access is required.'},{status:401});
  try{return NextResponse.json({status:'success',summary:await runAllIngestors()},{headers:{'Cache-Control':'no-store'}})}
  catch(error){console.error('Official refresh failed',error);return NextResponse.json({error:'Official source refresh failed. Check the ingestion run ledger.'},{status:503})}
}
export async function GET(){return NextResponse.json({error:'Use an authorized POST request.'},{status:405,headers:{Allow:'POST'}})}
