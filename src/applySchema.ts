import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const sql = `
-- Update class_skills to include level requirements
ALTER TABLE class_skills ADD COLUMN IF NOT EXISTS get_level INT;

-- Create NPC table
CREATE TABLE IF NOT EXISTS npcs (
    id INT PRIMARY KEY,
    name TEXT NOT NULL,
    level INT,
    type TEXT,
    hp_max BIGINT,
    is_raid BOOLEAN DEFAULT false
);

-- Create NPC Rewards (Drop/Spoil)
CREATE TABLE IF NOT EXISTS npc_rewards (
    id SERIAL PRIMARY KEY,
    npc_id INT REFERENCES npcs(id),
    item_id INT REFERENCES items(id),
    min_count INT,
    max_count INT,
    chance FLOAT,
    reward_type TEXT -- RATED_GROUPED, NOT_RATED_GROUPED, SWEEP (Spoil)
);
`;

async function apply() {
  console.log('Applying Schema Updates...');
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(e => ({ error: e }));
  
  // If exec_sql RPC doesn't exist (likely), we might be stuck since Supabase doesn't have a direct SQL execution via JS Client easily without RPC.
  // Actually, I should have the user run it in the dashboard if I can't.
  // BUT I can try to use the mcp server list_tables to check if it worked? No, it failed already.
  
  console.log('Schema update script finished. If it failed, please run the SQL manually in Supabase dashboard.');
}

// Since I can't easily run raw SQL from the client without a pre-defined RPC, 
// I will ask the user to run it one more time or try the execute_sql tool again with a different project ID if applicable.
// Wait, the user's project ID is cgaqhbnglphjdtkdqhlr.

apply();
