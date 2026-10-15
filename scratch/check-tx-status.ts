import { pool } from '../src/db/client.ts';

async function checkTxStatus() {
  const client = await pool.connect();
  try {
    console.log('Initial _txStatus:', (client as any)._txStatus);
    await client.query('BEGIN');
    console.log('After BEGIN _txStatus:', (client as any)._txStatus);
    await client.query('ROLLBACK');
    console.log('After ROLLBACK _txStatus:', (client as any)._txStatus);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTxStatus();
