import { pool } from '../src/db/client.ts';

async function checkClient() {
  const client = await pool.connect();
  try {
    console.log('client keys:', Object.keys(client));
    console.log('client.connection keys:', Object.keys(client.connection || {}));
    
    // Check inside transaction
    await client.query('BEGIN');
    console.log('inside BEGIN, check xact:');
    const res = await client.query(`
      SELECT 
        (SELECT count(*) FROM pg_stat_activity WHERE pid = pg_backend_pid() AND state LIKE '%transaction%') as tx_stat;
    `);
    console.log('tx_stat:', res.rows[0]);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

checkClient();
