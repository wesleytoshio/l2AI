import { Pool } from 'pg';
import { generateEmbeddingsBatch } from './ingestion/embedder';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.LOCAL_DB_URL });

async function test() {
    try {
        const query = 'prominence';
        const embeddings = await generateEmbeddingsBatch([query]);
        const embeddingStr = `[${embeddings[0].join(',')}]`;

        const res = await pool.query(
          `SELECT entity_id, category, 1 - (embedding <=> $1::vector) AS similarity 
           FROM detailed_knowledge 
           ORDER BY embedding <=> $1::vector 
           LIMIT 5`,
          [embeddingStr]
        );
        console.log('Top 5 Raw Semantic Matches for: ' + query);
        res.rows.forEach(r => console.log(`Sim: ${r.similarity.toFixed(4)} | Name: ${r.entity_id} | Category: ${r.category}`));
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
test();
