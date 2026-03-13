import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.LOCAL_DB_URL
});

async function run() {
    console.log('--- CHECKING CHECKPOINT KEYS ---');
    const res = await pool.query(`
        SELECT category, source_file, COUNT(*) 
        FROM detailed_knowledge 
        GROUP BY category, source_file 
        LIMIT 10
    `);
    res.rows.forEach(r => {
        console.log(`DB KEY -> ${r.category}:${r.source_file} (${r.count} entities)`);
    });

    console.log('\n--- CHECKING DASH HITS ---');
    const dashRes = await pool.query(`
        SELECT category, entity_id, substring(content, 1, 50) as snippet, (embedding <=> $1::vector) as dist
        FROM detailed_knowledge
        WHERE content ILIKE '%dash%'
        LIMIT 5
    `, ['[0,0,0]']); // Dummy vector just to see if it works

    process.exit(0);
}

run().catch(console.error);
