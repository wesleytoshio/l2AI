import OpenAI from 'openai';
import { searchKnowledge } from './searchService';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const askWiki = async (question: string): Promise<string> => {
  // 1. Search for relevant context
  console.log(`Searching for context for: "${question}"...`);
  const results = await searchKnowledge(question, 20); // Fetch more context (20 chunks)
  
  const context = results
    .map((r, i) => `<chunk id="${i + 1}" type="${r.metadata.type}" name="${r.metadata.name}">\n${r.content}\n</chunk>`)
    .join('\n');

  // 2. Build the System Prompt
  const systemPrompt = `
You are the Ultimate Lineage 2 High Five Expert Wiki.
Your knowledge comes EXCLUSIVELY from the provided Context.

RULES:
1. Support Portuguese: If the question is in Portuguese, answer in Portuguese. Translate terms if needed (e.g., "Rainha do Gelo" -> "Freya", "Poder" -> "P.Atk").
2. Dynamic Attribute Extraction: Extract ANY relevant technical data:
   - "getLevel": Level required to learn/acquire.
   - "skillLvl": Level of the skill.
   - "levels": Total levels available.
   - "minLvl/maxLvl": Range for NPCs or Quests.
   - "P.Atk, P.Def, M.Atk, M.Def": Combat stats.
3. Multiple Values: If a skill has multiple levels (e.g., level 1 at lvl 40, level 2 at lvl 44), list them clearly.
4. Accuracy first: Never invent data. Use the provided <chunk> tags to source your answer.
5. If the information is NOT in the context, say "Não encontrei essa informação técnica específica no banco de dados atual, mas encontrei dados relacionados a [descrever o que encontrou]."
6. Be technical and precise.

Context:
${context}
  `.trim();

  // 3. Call LLM
  console.log('Generating answer...');
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Question: ${question}` }
    ],
    temperature: 0.1, // Lower temperature for more factual responses
  });

  return response.choices[0].message.content || 'I could not generate an answer.';
};
