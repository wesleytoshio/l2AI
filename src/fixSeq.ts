import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();
const pool = new Pool({ connectionString: process.env.LOCAL_DB_URL });
async function fix() {
  await pool.query(`SELECT setval(pg_get_serial_sequence('detailed_knowledge', 'id'), coalesce(max(id),0) + 1, false) FROM detailed_knowledge;`);
  console.log('Fixed detailed_knowledge sequence!');
  process.exit(0);
}
fix();
