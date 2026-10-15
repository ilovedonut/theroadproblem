import { NextResponse } from 'next/server';
export async function GET(){
 return NextResponse.json({error:'This endpoint previously served representative records. It is disabled until a real PMGSY adapter is verified.',records:[],is_demo:false},{status:410,headers:{'Cache-Control':'no-store'}});
}
