import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.LOCAL_DB_URL
});

async function run() {
    const res = await pool.query('SELECT category, COUNT(DISTINCT source_file) FROM detailed_knowledge GROUP BY category');
    console.log('--- INGESTED FILES PER CATEGORY ---');
    res.rows.forEach(r => {
        console.log(`${r.category}: ${r.count} files`);
    });
    process.exit(0);
}

run().catch(console.error);
