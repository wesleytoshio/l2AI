import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { parseClasses } from './ingestion/classParser';
import { parseSkills } from './ingestion/skillParser';
import { parseItems } from './ingestion/itemParser';
import { parseSkillTrees } from './ingestion/skillTreeParser';
import { parseNPCs } from './ingestion/npcParser';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DATA_PATH = 'f:/L2 extract/game/data/stats/';

async function ingest() {
  console.log('--- Starting L2 High Five Deep Ingestion ---');

  // 1. Races & Classes
  console.log('Ingesting Classes...');
  const classes = parseClasses(path.join(DATA_PATH, 'chars/classList.xml'));
  
  const races = Array.from(new Set(classes.map(c => c.race))).map((name, id) => ({ id, name }));
  await supabase.from('races').upsert(races);

  const classesToUpsert = classes.map(c => ({
    id: c.id,
    name: c.name,
    parent_class_id: c.parent_class_id,
    race_id: races.find(r => r.name === c.race)?.id,
    ...c.stats
  }));
  await supabase.from('classes').upsert(classesToUpsert);

  // 2. Skills
  console.log('Ingesting Skills (this might take a while)...');
  const skills = parseSkills(path.join(DATA_PATH, 'skills/skills/'));
  
  // Upsert in batches
  const skillBatchSize = 1000;
  for (let i = 0; i < skills.length; i += skillBatchSize) {
    const batch = skills.slice(i, i + skillBatchSize);
    await supabase.from('skills').upsert(batch.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      icon: s.icon
    })));
    console.log(`Skills: Processed ${i + batch.length}/${skills.length}`);
  }

  // 3. Skill Trees (with get_level)
  console.log('Ingesting Class Skill Trees...');
  const skillMappings = parseSkillTrees(path.join(DATA_PATH, 'skills/skillTrees/classSkillTree.xml'));
  
  // Get existing skill IDs to avoid FK violations
  const { data: existingSkills } = await supabase.from('skills').select('id');
  const validSkillIds = new Set(existingSkills?.map(s => s.id) || []);
  
  // Deduplicate: Take the minimum acquisition level for each class-skill pair
  const deduplicated = new Map<string, any>();
  skillMappings
    .filter(m => validSkillIds.has(m.skillId))
    .forEach(m => {
      const key = `${m.classId}-${m.skillId}`;
      const current = deduplicated.get(key);
      if (!current || m.minLevel < current.min_level) {
        deduplicated.set(key, {
          class_id: m.classId,
          skill_id: m.skillId,
          min_level: m.minLevel,
          get_level: m.minLevel,
          auto_get: m.autoGet
        });
      }
    });

  const mappingsToUpsert = Array.from(deduplicated.values());
  
  console.log(`Unique mappings found: ${mappingsToUpsert.length} / ${skillMappings.length}`);
  for (let i = 0; i < mappingsToUpsert.length; i += 2000) {
      const { error } = await supabase.from('class_skills').upsert(mappingsToUpsert.slice(i, i + 2000));
      if (error) console.error('Error ingesting class_skills batch:', error.message);
  }

  // 4. Items
  console.log('Ingesting Items...');
  const items = parseItems(path.join(DATA_PATH, 'items/items/'));
  for (let i = 0; i < items.length; i += 1000) {
      const batch = items.slice(i, i + 1000);
      await supabase.from('items').upsert(batch.map(item => ({
        id: item.id,
        name: item.name,
        item_type: item.item_type,
        material: item.material,
        weight: item.weight,
        price: item.price,
        icon: item.icon
      })));
      
      const weapons = batch.filter(it => it.weapon_stats).map(it => ({ item_id: it.id, ...it.weapon_stats }));
      if (weapons.length > 0) await supabase.from('item_weapon').upsert(weapons);
      
      const armors = batch.filter(it => it.armor_stats).map(it => ({ item_id: it.id, ...it.armor_stats }));
      if (armors.length > 0) await supabase.from('item_armor').upsert(armors);
      
      console.log(`Items: Processed ${i + batch.length}/${items.length}`);
  }

  // 5. NPCs & Drops
  console.log('Ingesting NPCs & Drops...');
  const npcs = parseNPCs(path.join(DATA_PATH, 'npcs/npcs/'));
  for (let i = 0; i < npcs.length; i += 500) {
      const batch = npcs.slice(i, i + 500);
      await supabase.from('npcs').upsert(batch.map(n => ({
          id: n.id,
          name: n.name,
          level: n.level,
          type: n.type,
          hp_max: n.hp_max
      })));

      const rewards: any[] = [];
      batch.forEach(n => {
          n.rewards.forEach(r => {
              rewards.push({
                  npc_id: n.id,
                  item_id: r.itemId,
                  min_count: r.min,
                  max_count: r.max,
                  chance: r.chance,
                  reward_type: r.type
              });
          });
      });
      
      if (rewards.length > 0) {
          // Flatten chunks for rewards if too big
          for (let j = 0; j < rewards.length; j += 1000) {
              await supabase.from('npc_rewards').upsert(rewards.slice(j, j + 1000));
          }
      }
      console.log(`NPCs: Processed ${i + batch.length}/${npcs.length}`);
  }

  console.log('--- Ingestion Complete! ---');
}

ingest().catch(console.error);
