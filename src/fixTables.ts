import { Client, Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const REMOTE_URL = process.env.REMOTE_DB_URL!;
const LOCAL_URL = process.env.LOCAL_DB_URL!;

async function fixTables() {
    console.log('Connecting...');
    const remotePool = new Pool({ connectionString: REMOTE_URL, ssl: { rejectUnauthorized: false } });
    const localPool = new Pool({ connectionString: LOCAL_URL });

    // 1. CLASS_SKILLS
    console.log('Recreating local class_skills table...');
    await localPool.query(`DROP TABLE IF EXISTS class_skills;`);
    await localPool.query(`CREATE TABLE class_skills ( 
        id SERIAL PRIMARY KEY, 
        class_id INT, 
        skill_id INT, 
        min_level INT,
        get_level INT, 
        auto_get BOOLEAN, 
        UNIQUE(class_id, skill_id) 
    );`);

    // 2. KNOWLEDGE_EMBEDDINGS
    console.log('Recreating local knowledge_embeddings table...');
    await localPool.query(`DROP TABLE IF EXISTS knowledge_embeddings;`);
    await localPool.query(`CREATE TABLE knowledge_embeddings (
        id SERIAL PRIMARY KEY,
        type TEXT,
        name TEXT,
        content TEXT NOT NULL,
        metadata JSONB,
        embedding vector(1536)
    );`);

    const tables = ['class_skills', 'knowledge_embeddings'];
    
    for (const table of tables) {
        console.log(`\nMigrating ${table}...`);
        
        const countRes = await remotePool.query(`SELECT COUNT(*) FROM ${table}`);
        const total = parseInt(countRes.rows[0].count, 10);
        console.log(`Total records: ${total}`);

        const colRes = await remotePool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = $1 AND table_schema = 'public'
        `, [table]);
        const columns = colRes.rows.map(r => r.column_name);

        const limit = 500;
        let offset = 0;

        while (offset < total) {
          const res = await remotePool.query(`SELECT * FROM ${table} ORDER BY (SELECT NULL) OFFSET $1 LIMIT $2`, [offset, limit]);
          const rows = res.rows;
          
          if (rows.length === 0) break;

          let insertQuery = `INSERT INTO ${table} (${columns.join(', ')}) VALUES `;
          const params: any[] = [];
          let paramIndex = 1;

          const valuesStr = rows.map(row => {
              const rowVals = columns.map(col => {
                  params.push(row[col]);
                  return `$${paramIndex++}`;
              });
              return `(${rowVals.join(', ')})`;
          }).join(', ');
          
          insertQuery += valuesStr + ' ON CONFLICT DO NOTHING;';

          try {
            await localPool.query(insertQuery, params);
          } catch (err: any) {
            console.error(`Error in ${table}: ${err.message}`);
            break;
          }
          
          offset += rows.length;
          process.stdout.write(`\rCopied ${Math.min(offset, total)} / ${total} records...`);
        }
    }

    // Since we dropped knowledge_embeddings, we MUST recreate the search function
    console.log('\nRecreating search function...');
    await localPool.query(`
    CREATE OR REPLACE FUNCTION match_all_knowledge(
      query_embedding vector(1536), 
      match_threshold float, 
      match_count int
    ) RETURNS TABLE (
      content TEXT,
      metadata JSONB,
      similarity FLOAT
    ) AS $$
      SELECT content, metadata, 1 - (embedding <=> query_embedding) AS similarity
      FROM knowledge_embeddings
      WHERE 1 - (embedding <=> query_embedding) > match_threshold
      UNION ALL
      SELECT content, 
             jsonb_build_object('category', category, 'source_file', source_file, 'entity_id', entity_id) AS metadata, 
             1 - (embedding <=> query_embedding) AS similarity
      FROM detailed_knowledge
      WHERE 1 - (embedding <=> query_embedding) > match_threshold
      ORDER BY similarity DESC
      LIMIT match_count;
    $$ LANGUAGE sql;
    `);

    console.log('\nDone fixing tables!');
    process.exit(0);
}

fixTables().catch(console.error);
