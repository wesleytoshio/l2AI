import { Client, Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const REMOTE_URL = process.env.REMOTE_DB_URL!;
const LOCAL_URL = process.env.LOCAL_DB_URL!;

async function fixClassSkills() {
    console.log('Connecting...');
    const remotePool = new Pool({ connectionString: REMOTE_URL, ssl: { rejectUnauthorized: false } });
    const localPool = new Pool({ connectionString: LOCAL_URL });

    console.log('Recreating local class_skills table...');
    await localPool.query(`DROP TABLE IF EXISTS class_skills;`);
    await localPool.query(`CREATE TABLE class_skills ( 
        id SERIAL PRIMARY KEY, 
        class_id INT REFERENCES classes(id), 
        skill_id INT REFERENCES skills(id), 
        min_level INT NOT NULL, 
        auto_get BOOLEAN DEFAULT false, 
        UNIQUE(class_id, skill_id) 
    );`);

    console.log('Migrating class_skills...');
    
    const countRes = await remotePool.query(`SELECT COUNT(*) FROM class_skills`);
    const total = parseInt(countRes.rows[0].count, 10);
    console.log(`Total records: ${total}`);

    const colRes = await remotePool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'class_skills' AND table_schema = 'public'
    `);
    const columns = colRes.rows.map(r => r.column_name);

    const limit = 500;
    let offset = 0;

    while (offset < total) {
      const res = await remotePool.query(`SELECT * FROM class_skills ORDER BY (SELECT NULL) OFFSET $1 LIMIT $2`, [offset, limit]);
      const rows = res.rows;
      
      if (rows.length === 0) break;

      let insertQuery = `INSERT INTO class_skills (${columns.join(', ')}) VALUES `;
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
        console.error(`Error: ${err.message}`);
        break;
      }
      
      offset += rows.length;
      process.stdout.write(`Copied ${Math.min(offset, total)} / ${total} records...\n`);
    }

    console.log('Fixed class_skills!');
    process.exit(0);
}

fixClassSkills().catch(console.error);
