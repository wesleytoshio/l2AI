import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMappingCount() {
    const { count, error } = await supabase
        .from('class_skills')
        .select('*', { count: 'exact', head: true });
    
    console.log('Total Class-Skill Mappings:', count);
}

checkMappingCount();
