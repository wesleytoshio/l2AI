import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkColumns() {
    const { data, error } = await supabase
        .from('class_skills')
        .select('*')
        .limit(1);
    
    if (data && data.length > 0) {
        console.log('Columns in class_skills:', Object.keys(data[0]));
    } else {
        // If empty, we can try to insert a dummy and see error or use another way
        console.log('Table is empty. Trying to find columns via dummy insert...');
        const { error: insError } = await supabase.from('class_skills').insert({ id: 999999 } as any);
        console.log('Insert Error (contains column info):', insError?.message);
    }
}

checkColumns();
