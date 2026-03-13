import OpenAI from 'openai';
import { searchKnowledge } from './searchService';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Tipos de intenção detectados ──────────────────────────────────────────
export type Intent =
  | 'skill_info'      // Detalhes de skills, efeitos, leveis
  | 'skill_tree'      // Quem aprende o que e em qual level
  | 'class_info'      // Stats de classes, transferências
  | 'mob_info'        // Stats de monstros, leveis, tipos
  | 'item_stats'      // Stats de armas, armaduras, sets
  | 'item_upgrade'    // Enchant, Augment, Elemental
  | 'item_drop'       // Onde cai, quem dropa (drop/spoil)
  | 'spawn_info'      // Localização, territórios, zonas
  | 'quest_info'      // Requisitos, passos, recompensas
  | 'residence_info'  // Castelos, Clan Halls, Fortalezas
  | 'event_info'      // Eventos, managers, mapas de eventos
  | 'instance_info'   // Dungeons, requisitos de entrada
  | 'service_info'    // Serviços (Dress, etc)
  | 'admin_info'      // Comandos admin, configs do servidor
  | 'general';

const INTENT_INSTRUCTIONS: Record<Intent, string> = {
  skill_info: 'Foque em efeitos (OPPs), níveis, range, power e custos de MP/HP. Liste todos os níveis se disponíveis.',
  skill_tree: 'Identifique quais classes aprendem a skill, o nível necessário e se é "autoGet" ou requer itens.',
  class_info: 'Foque em stats base (STR/INT/etc), evoluções de classe e pré-requisitos.',
  mob_info: 'Foque em Lvl, HP, P.Atk, M.Atk e vulnerabilidades/resistências.',
  item_stats: 'Foque em P.Atk, M.Atk, peso, slots de cristal e se faz parte de um set (armorset).',
  item_upgrade: 'Explique chances de enchant, bônus de augmentation ou pedras elementais.',
  item_drop: 'Liste NPCs que dropam/spoailam o item, com as respectivas chances e quantidades.',
  spawn_info: 'Descreva as coordenadas (X, Y, Z) ou o nome do território/zona onde a entidade aparece.',
  quest_info: 'Liste o NPC inicial, level necessário, itens de quest e recompensas finais.',
  residence_info: 'Descreva benefícios de castelo/clanhall, impostos e funções disponíveis.',
  event_info: 'Explique o funcionamento do evento, horários (se disponíveis) e prêmios.',
  instance_info: 'Liste condições de entrada (partido, level, itens) e tempo de cooldown.',
  service_info: 'Descreva os serviços extras como troca de cor de nome, sistema de dress ou VIP.',
  admin_info: 'Explique comandos de administração, níveis de acesso e configurações globais.',
  general: 'Responda de forma técnica e equilibrada usando os dados fornecidos.',
};

const detectIntent = (query: string): Intent => {
  const q = query.toLowerCase();
  if (q.includes('cai') || q.includes('drop') || q.includes('spoil') || q.includes('onde consig')) return 'item_drop';
  if (q.includes('skill') || q.includes('habilidade') || q.includes('poder')) {
    if (q.includes('quem') || q.includes('aprende') || q.includes('level') || q.includes('classe')) return 'skill_tree';
    return 'skill_info';
  }
  if (q.includes('item') || q.includes('arma') || q.includes('armadura') || q.includes('set')) {
    if (q.includes('enchant') || q.includes('melhor') || q.includes('pedra') || q.includes('element')) return 'item_upgrade';
    return 'item_stats';
  }
  if (q.includes('npc') || q.includes('mob') || q.includes('monstro') || q.includes('boss')) return 'mob_info';
  if (q.includes('onde fica') || q.includes('mapa') || q.includes('nasce') || q.includes('localiz') || q.includes('spawn')) return 'spawn_info';
  if (q.includes('quest') || q.includes('missao')) return 'quest_info';
  if (q.includes('castelo') || q.includes('castle') || q.includes('clanhall') || q.includes('ch ') || q.includes('residencia')) return 'residence_info';
  if (q.includes('evento') || q.includes('event')) return 'event_info';
  if (q.includes('instanc') || q.includes('dungeon')) return 'instance_info';
  if (q.includes('class') || q.includes('profissi') || q.includes('job')) return 'class_info';
  if (q.includes('admin') || q.includes('comando') || q.includes('//')) return 'admin_info';
  if (q.includes('servico') || q.includes('service') || q.includes('dress') || q.includes('vip')) return 'service_info';
  
  return 'general';
};

// ── Retry com exponential backoff para chamadas OpenAI ───────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isRetryable =
        err?.status === 429 ||
        err?.status === 500 ||
        err?.status === 503 ||
        err?.code === 'ECONNRESET';
      if (!isRetryable || attempt === retries - 1) throw err;
      const wait = delayMs * Math.pow(2, attempt);
      console.log(`[Retry] Tentativa ${attempt + 1} falhou (${err?.status ?? err?.code}). Aguardando ${wait}ms...`);
      await new Promise(res => setTimeout(res, wait));
    }
  }
  throw lastError;
}

// ── Sistema de prompts ────────────────────────────────────────────────────
const SYSTEM_BASE = `
Você é o Expert Wiki de Lineage 2 High Five.
Seu conhecimento vem EXCLUSIVAMENTE do Contexto fornecido.

REGRAS:
1. Responda SEMPRE em português brasileiro.
2. Traduza termos se necessário (ex: "Rainha do Gelo" → "Freya", "Poder" → "P.Atk").
3. Extraia dados técnicos relevantes: getLevel, skillLvl, levels, minLvl/maxLvl, P.Atk, M.Atk, P.Def, M.Def, drop rate, XP.
4. Se uma skill tem múltiplos níveis, liste todos claramente.
5. NUNCA invente dados. Use apenas o que está nos chunks.
6. Se não encontrar a informação, diga: "Não encontrei essa informação técnica específica no banco de dados atual."
7. Seja técnico, preciso e conciso.
`.trim();

export const askWiki = async (question: string): Promise<string> => {
  const intent = detectIntent(question);
  console.log(`[Query] Intent detectado: ${intent}`);

  console.log(`[Query] Buscando contexto para: "${question}"...`);
  const results = await searchKnowledge(question, 20);

  const context = results
    .map((r, i) => `<chunk id="${i + 1}" type="${r.metadata.type}" name="${r.metadata.name}">\n${r.content}\n</chunk>`)
    .join('\n');

  const systemPrompt = `${SYSTEM_BASE}\n\nINSTRUÇÃO ESPECÍFICA: ${INTENT_INSTRUCTIONS[intent]}\n\nContexto:\n${context}`;

  console.log('[Query] Gerando resposta...');
  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Pergunta: ${question}` },
      ],
      temperature: 0.1,
    })
  );

  return response.choices[0].message.content ?? 'Não foi possível gerar uma resposta.';
};