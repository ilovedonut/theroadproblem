import { query } from '../src/db/client.ts';

async function checkFn() {
  try {
    const res = await query('SELECT pg_current_xact_id_if_assigned() as xid;');
    console.log('pg_current_xact_id_if_assigned:', res.rows[0]);
  } catch (err) {
    console.error('pg_current_xact_id_if_assigned failed:', err.message);
  }

  try {
    const res2 = await query('SELECT txid_current_if_assigned() as xid;');
    console.log('txid_current_if_assigned:', res2.rows[0]);
  } catch (err) {
    console.error('txid_current_if_assigned failed:', err.message);
  }
}

checkFn();
