import { pool } from '../../db/client.ts';
import { runOfficialIngestion } from './official-ingestion.ts';
import { connectForIngestion } from './connection.ts';
export async function runAllIngestors(options:{dryRun?:boolean}={}) {
  if(!options.dryRun && (!process.env.R2_ACCOUNT_ID||!process.env.R2_ACCESS_KEY_ID||!process.env.R2_SECRET_ACCESS_KEY)) throw new Error('R2 credentials are required. Local archive fallback is not permitted.');
  const client=await connectForIngestion(pool);
  const connectionError=(error:Error&{code?:string})=>console.error('Ingestion database connection failed',{code:error.code||'CONNECTION_ERROR'});
  client.on('error',connectionError);
  try{return {timestamp:new Date().toISOString(),runs:[await runOfficialIngestion(client,options)]};}
  finally{client.removeListener('error',connectionError);client.release();}
}
if(process.argv[1]?.endsWith('runner.ts')) {
  runAllIngestors({dryRun:process.argv.includes('--dry-run')}).then(summary=>console.log(JSON.stringify(summary,null,2))).catch(error=>{console.error('Official ingestion failed:',error.message);process.exitCode=1}).finally(()=>pool.end());
}
