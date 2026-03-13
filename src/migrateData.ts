import { Client, Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const REMOTE_URL = process.env.REMOTE_DB_URL!;
const LOCAL_URL = process.env.LOCAL_DB_URL!;

const TABLES = [
  'races',
  'classes',
  'skills',
  'skill_levels',
  'class_skills',
  'items',
  'item_weapon',
  'item_armor',
  'detailed_knowledge',
  'knowledge_embeddings'
];

async function migrate() {
  console.log('Connecting to Remote DB...');
  const remotePool = new Pool({ connectionString: REMOTE_URL, ssl: { rejectUnauthorized: false } });
  
  console.log('Connecting to Local DB...');
  const localPool = new Pool({ connectionString: LOCAL_URL });

  // 1. Initialize local DB with pgvector
  console.log('Initializing pgvector on local db...');
  await localPool.query('CREATE EXTENSION IF NOT EXISTS vector;');

  // 2. Create Schema
  console.log('Creating schema internally...');
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS races ( id INT PRIMARY KEY, name TEXT NOT NULL );
    CREATE TABLE IF NOT EXISTS classes ( id INT PRIMARY KEY, name TEXT NOT NULL, race_id INT REFERENCES races(id), parent_class_id INT REFERENCES classes(id), base_int INT, base_str INT, base_con INT, base_men INT, base_dex INT, base_wit INT );
    CREATE TABLE IF NOT EXISTS skills ( id INT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT );
    CREATE TABLE IF NOT EXISTS skill_levels ( skill_id INT REFERENCES skills(id), level INT, power FLOAT, mp_consume INT, cast_range INT, effect_type TEXT, PRIMARY KEY (skill_id, level) );
    CREATE TABLE IF NOT EXISTS class_skills ( class_id INT REFERENCES classes(id), skill_id INT REFERENCES skills(id), min_level INT NOT NULL, auto_get BOOLEAN DEFAULT false, PRIMARY KEY (class_id, skill_id) );
    CREATE TABLE IF NOT EXISTS items ( id INT PRIMARY KEY, name TEXT NOT NULL, item_type TEXT, material TEXT, weight INT, price INT, icon TEXT );
    CREATE TABLE IF NOT EXISTS item_weapon ( item_id INT PRIMARY KEY REFERENCES items(id), p_atk INT, m_atk INT, critical INT, atk_speed INT, weapon_type TEXT );
    CREATE TABLE IF NOT EXISTS item_armor ( item_id INT PRIMARY KEY REFERENCES items(id), p_def INT, m_def INT, armor_type TEXT, slot TEXT );
    
    CREATE TABLE IF NOT EXISTS detailed_knowledge (
        id SERIAL PRIMARY KEY,
        category TEXT,
        source_file TEXT,
        entity_id TEXT,
        content TEXT,
        raw_data JSONB,
        embedding vector(1536)
    );

    CREATE TABLE IF NOT EXISTS knowledge_embeddings (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB,
        embedding vector(1536)
    );
  `;
  await localPool.query(schemaSql);
  console.log('Schema created.');

  // 3. Copy Data
  for (const table of TABLES) {
    console.log(`\nMigrating table: ${table}`);
    
    // Count remote
    const countRes = await remotePool.query(`SELECT COUNT(*) FROM ${table}`);
    const total = parseInt(countRes.rows[0].count, 10);
    console.log(`Total records in ${table}: ${total}`);

    if (total === 0) continue;

    const limit = 500;
    let offset = 0;

    // Get table columns
    const colRes = await remotePool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
    `, [table]);
    const columns = colRes.rows.map(r => r.column_name);

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
      
      insertQuery += valuesStr + ' ON CONFLICT DO NOTHING;'; // Simplistic conflict resolution

      try {
        await localPool.query(insertQuery, params);
      } catch (err: any) {
        console.error(`\nError inserting row slice into ${table}: ${err.message}`);
        break;
      }
      
      offset += rows.length;
      process.stdout.write(`\rCopied ${Math.min(offset, total)} / ${total} records...`);
    }
    console.log(`\nFinished table: ${table}`);
  }

  // 4. Create search functions
  console.log('Creating search functions...');
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

  console.log('\nMigration complete! You can now use the local database.');
  process.exit(0);
}

migrate().catch(console.error);
