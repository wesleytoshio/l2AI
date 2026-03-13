import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { askWiki } from './rag/queryService';
import { searchKnowledge } from './rag/searchService';

dotenv.config();
const pool = new Pool({ connectionString: process.env.LOCAL_DB_URL });

async function runTest() {
  console.log('--- Verification: Skill Tree RAG ---');
  
  // 1. Verificar se existem chunks de skillTrees no banco
  const countRes = await pool.query("SELECT COUNT(*) FROM detailed_knowledge WHERE category = 'skills/skillTrees'");
  console.log(`[Test] Chunks de skillTrees no DB: ${countRes.rows[0].count}`);

  if (parseInt(countRes.rows[0].count) === 0) {
    console.log('[Test] Erro: Nenhum dado de skillTrees encontrado. Certifique-se de rodar o ingester para esta categoria.');
    return;
  }

  // 2. Testar busca semântica para uma skill específica
  const query = "quem aprende Mortal Blow no level 5?";
  console.log(`\n[Test] Query: "${query}"`);
  
  const results = await searchKnowledge(query, 5);
  console.log('[Test] Top 3 Resultados:');
  results.slice(0, 3).forEach((r, i) => {
    console.log(`  [${i+1}] ${r.metadata.type} | ${r.metadata.name} | score: ${r.similarity.toFixed(3)}`);
    console.log(`      Resumo: ${r.content.split('\n')[0]}...`);
  });

  // 3. Gerar resposta RAG
  console.log('\n[Test] Gerando resposta RAG...');
  const answer = await askWiki(query);
  console.log('\n[Test] Resposta Final:');
  console.log('----------------------------');
  console.log(answer);
  console.log('----------------------------');

  await pool.end();
}

runTest().catch(console.error);
