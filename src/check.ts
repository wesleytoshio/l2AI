import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.LOCAL_DB_URL });

async function check() {
    try {
        const rr = await pool.query(`SELECT COUNT(*), substring(content from 1 for 100) as c FROM detailed_knowledge WHERE content ILIKE '%Guts%' GROUP BY content`);
        console.log('Guts in detailed_knowledge:', rr.rows);

        const kr = await pool.query(`SELECT COUNT(*), substring(content from 1 for 100) as c FROM knowledge_embeddings WHERE content ILIKE '%Guts%' OR name ILIKE '%Guts%' GROUP BY content`);
        console.log('Guts in knowledge_embeddings:', kr.rows);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
check();
