import { query } from '../src/db/client.ts';

async function main() {
  const cols = await query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'roads'
    ORDER BY ordinal_position;
  `);
  console.log('roads columns:');
  console.log(cols.rows);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
