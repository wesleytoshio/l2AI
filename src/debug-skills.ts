import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugSkills() {
    console.log('--- SKILLS TABLE DEBUG ---');
    
    // 1. Check for "Guts" in the basic skills table
    const { data: gutsSkill, error } = await supabase
        .from('skills')
        .select('*')
        .ilike('name', '%Guts%');
    
    console.log('Skills found with "Guts":', gutsSkill?.length);
    if (gutsSkill?.length) {
        console.log('Guts Skill details:', gutsSkill[0]);
        
        // 2. Check mapping
        const { data: mapping } = await supabase
            .from('class_skills')
            .select(`
                *,
                classes(name)
            `)
            .eq('skill_id', gutsSkill[0].id);
        
        console.log('Class mapping for Guts:', mapping?.map(m => ({
            class: (m.classes as any).name,
            level: m.get_level
        })));
    } else {
        console.log('Guts NOT found in skills table. Mapping check skipped.');
    }
}

debugSkills();
