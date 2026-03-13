import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.LOCAL_DB_URL });

async function check() {
    try {
        const rr = await pool.query(`SELECT id, embedding IS NOT NULL as has_vec FROM detailed_knowledge WHERE content ILIKE '%Guts%'`);
        console.log('DK has embedding:', rr.rows);

        const kr = await pool.query(`SELECT id, embedding IS NOT NULL as has_vec FROM knowledge_embeddings WHERE content ILIKE '%Guts%' OR name ILIKE '%Guts%'`);
        console.log('KE has embedding:', kr.rows);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
check();
