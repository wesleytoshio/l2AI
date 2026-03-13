import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { KnowledgeGenerator } from './ingestion/knowledgeGenerator';
import { generateEmbeddingsBatch } from './ingestion/embedder';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function syncKnowledge() {
  console.log('--- Starting FINAL Knowledge Sync (Embeddings) ---');

  // 0. Clear old knowledge
  console.log('Clearing old knowledge...');
  await supabase.from('knowledge_embeddings').delete().neq('id', 0);

  const chunks: { content: string; metadata: any }[] = [];

  // 1. Fetch classes
  console.log('Fetching classes...');
  const { data: classes } = await supabase
    .from('classes')
    .select('*, class_skills(min_level, skills(name, description))');

  for (const c of (classes || [])) {
    const skills = c.class_skills?.map((cs: any) => ({
      name: cs.skills.name,
      description: cs.skills.description,
      min_level: cs.min_level
    })) || [];
    chunks.push({
      content: KnowledgeGenerator.generateClassSummary(c, skills),
      metadata: { type: 'class', id: c.id, name: c.name }
    });
  }

  // 2. Fetch items with rewards (drops are highly relevant)
  console.log('Fetching items with rewards...');
  const { data: rewards } = await supabase
    .from('npc_rewards')
    .select('*, items(*, item_weapon(*), item_armor(*)), npcs(name, level)')
    .limit(1000);

  // Group by item
  const itemMap = new Map<number, any>();
  rewards?.forEach((r: any) => {
      if (!r.items) return;
      if (!itemMap.has(r.item_id)) {
          itemMap.set(r.item_id, { 
              item: r.items, 
              drops: [] 
          });
      }
      itemMap.get(r.item_id).drops.push({
          npc_name: r.npcs.name,
          npc_level: r.npcs.level,
          chance: r.chance
      });
  });

  for (const entry of itemMap.values()) {
      chunks.push({
          content: KnowledgeGenerator.generateItemSummary(entry.item, entry.drops),
          metadata: { type: 'item', id: entry.item.id, name: entry.item.name }
      });
  }

  // 3. Fetch top skills
  console.log('Fetching skills...');
  const { data: skillsWithClasses } = await supabase
    .from('skills')
    .select('*, class_skills(min_level, classes(name))')
    .limit(1000);

  for (const s of (skillsWithClasses || [])) {
    if (s.class_skills?.length > 0) {
        const classes = s.class_skills.map((cs: any) => ({
            name: cs.classes.name,
            min_level: cs.min_level
        }));
        chunks.push({
            content: KnowledgeGenerator.generateSkillSummary(s, classes),
            metadata: { type: 'skill', id: s.id, name: s.name }
        });
    }
  }

  // 4. Generate Embeddings
  console.log(`Generating embeddings for ${chunks.length} chunks...`);
  const batchSize = 50;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const contents = batch.map(c => c.content);
    const embeddings = await generateEmbeddingsBatch(contents);
    const upsertData = batch.map((chunk, index) => ({
      content: chunk.content,
      metadata: chunk.metadata,
      embedding: embeddings[index]
    }));
    await supabase.from('knowledge_embeddings').upsert(upsertData);
    console.log(`Batch ${Math.floor(i / batchSize) + 1} done`);
  }

  console.log('--- FINAL Knowledge Sync Complete! ---');
}

syncKnowledge().catch(console.error);
