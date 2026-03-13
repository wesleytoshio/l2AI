import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { XMLParser } from 'fast-xml-parser';
import * as dotenv from 'dotenv';
import inquirer from 'inquirer';
import { generateEmbeddingsBatch } from './ingestion/embedder';
import { STATS_FOLDERS } from './ingestion/statsFolders';

dotenv.config();

const pool = new Pool({ connectionString: process.env.LOCAL_DB_URL });

// ── Parser com isArray para garantir arrays mesmo com 1 elemento ──────────
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
  isArray: (name) => [
    'npc', 'set', 'skill', 'defence', 'attack',
    'reward', 'group', 'minion', 'class', 'option',
    'item', 'enchant', 'route', 'spawn', 'territory',
  ].includes(name),
});

const BASE_PATH = 'f:/L2 extract/game/data/stats';

const TARGET_FOLDERS = STATS_FOLDERS;

interface ChunkMetadata {
  category: string;
  source_file: string;
  entity_id: string;
  type: string;
}

interface Chunk {
  content: string;
  metadata: ChunkMetadata;
  raw: Record<string, unknown>;
}

const processedSet = new Set<string>();

// ── Converte set[] name/value → campo legível ─────────────────────────────
// Resolve o problema central: set[0].value → level: 10
function setsToFields(sets: Array<{ name: string; value: unknown }>): string[] {
  return sets.map(s => `- **${s.name}**: ${s.value}`);
}

// ── Mapeamento Global de Nomes para Resolução de IDs ──────────────────────
const globalNameMap = new Map<string, Map<string, string>>();

function getNameMap(type: string): Map<string, string> {
  if (!globalNameMap.has(type)) globalNameMap.set(type, new Map());
  return globalNameMap.get(type)!;
}

function resolveName(type: string, id: string | number): string {
  const sId = String(id);
  const name = globalNameMap.get(type)?.get(sId);
  return name ? `${sId} (${name})` : sId;
}

async function preScanDefinitions(): Promise<void> {
  console.log('\x1b[35m[Ingester] Pré-escaneando definições de nomes...\x1b[0m');
  
  const defFolders: Array<{ folder: string; type: string; idField: string }> = [
    { folder: 'items/items', type: 'item', idField: 'id' },
    { folder: 'npcs/npcs', type: 'npc', idField: 'id' },
    { folder: 'npcs/pets', type: 'npc', idField: 'id' },
    { folder: 'skills/skills', type: 'skill', idField: 'id' },
    { folder: 'chars/classes', type: 'class', idField: 'classId' },
    { folder: 'regions/zones', type: 'zone', idField: 'id' },
    { folder: 'residences/castle', type: 'castle', idField: 'id' },
  ];

  for (const def of defFolders) {
    const fullPath = path.join(BASE_PATH, def.folder);
    if (!fs.existsSync(fullPath)) continue;
    
    const files = getAllFiles(fullPath).filter(f => f.endsWith('.xml'));
    const map = getNameMap(def.type);

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const jsonObj = parser.parse(content);
        const rootTag = Object.keys(jsonObj).find(k => k !== '?xml');
        if (!rootTag) continue;

        const list = jsonObj[rootTag];
        for (const k of Object.keys(list ?? {})) {
          if (k.startsWith('@')) continue;
          const value = list[k];
          const entities = Array.isArray(value) ? value : [value];
          for (const ent of entities) {
            if (ent && typeof ent === 'object') {
              const id = String(ent[def.idField] ?? 'N/A');
              const name = ent['nameEn'] || ent['name'] || ent['nameRu'];
              if (id !== 'N/A' && name) {
                map.set(id, String(name));
                if (id === '9549') console.log(`\x1b[32m[Ingester] Mapeado: ${def.type} ${id} -> ${name}\x1b[0m`);
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[Ingester] Erro ao scanear ${file}:`, e);
      }
    }
  }
  console.log(`\x1b[35m[Ingester] Scan concluído. ${globalNameMap.size} categorias mapeadas.\x1b[0m`);
}

// ── Detecta informações de ID e Nome de forma genérica ────────────────────
function detectEntityInfo(category: string, raw: Record<string, unknown>): { id: string, name?: string } {
  const parent = raw['_parent'] as Record<string, any> | undefined;

  // 1. Tenta campos comuns no root
  let id = String(raw['id'] ?? raw['classId'] ?? raw['npcId'] ?? raw['itemId'] ?? raw['skillId'] ?? 'N/A');
  let name = (raw['nameEn'] || raw['name'] || raw['skillName'] || raw['itemName']) as string | undefined;

  // 2. Se for sub-item (ex: skill em skilltree), tenta pegar contexto do pai
  if (id === 'N/A' && parent) {
      id = String(parent.id ?? parent.classId ?? parent.npcId ?? 'N/A');
  }

  // 3. Tenta extrair de blocos aninhados comuns
  if (id === 'N/A') {
    const commonBlocks = ['npc', 'npcs', 'item', 'items', 'skill', 'skills'];
    for (const block of commonBlocks) {
      const b = raw[block] as any;
      const first = Array.isArray(b) ? b[0] : b;
      if (first && typeof first === 'object') {
        id = String(first.id ?? first.npcId ?? first.itemId ?? first.skillId ?? 'N/A');
        if (id !== 'N/A') break;
      } else if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) {
        id = String(first);
        break;
      }
    }
  }

  // 4. Resolve nome se o ID foi encontrado mas o nome não
  if (id !== 'N/A' && !name) {
    const typeMap: Record<string, string> = {
      'npcs': 'npc',
      'items': 'item',
      'skills': 'skill',
      'chars': 'class',
      'residences': 'castle',
      'regions': 'zone'
    };
    
    // Tenta inferir o tipo pela categoria se não for óbvio
    let type = 'item';
    if (category.includes('npc') || category.includes('spawn') || category.includes('buylist') || category.includes('multisell')) type = 'npc';
    else if (category.includes('skill')) type = 'skill';
    else if (category.includes('class')) type = 'class';
    else if (category.includes('zone') || category.includes('region')) type = 'zone';
    else if (category.includes('castle') || category.includes('residence')) type = 'castle';

    const resolved = resolveName(type, id);
    if (resolved.includes('(')) {
      name = resolved.split('(')[1].replace(')', '');
    }
  }

  return { id, name };
}

// ── Gerador de summary semântico por tipo de entidade ─────────────────────
function generateSummary(category: string, file: string, raw: Record<string, unknown>): string {
  const parent = raw['_parent'] as Record<string, any> | undefined;
  const { id, name: detectName } = detectEntityInfo(category, raw);
  
  const nameEn = (raw['nameEn'] || raw['name'] || raw['skillName'] || raw['itemName'] || detectName) as string | undefined;
  const nameRu = raw['nameRu'] as string | undefined;
  const titleEn = raw['titleEn'] as string | undefined;
  const entityName = nameEn || id;

  const lines: string[] = [];
  
  // Header com contexto de pai se existir (importante para skillTrees e buylists)
  if (parent) {
    const parentId = parent['id'] ?? parent['classId'] ?? parent['npcId'] ?? 'N/A';
    const parentType = category.includes('skill') ? 'class' : 'npc';
    const pName = resolveName(parentType, String(parentId));
    lines.push(`## [${category}] ${entityName} (id: ${id}) - Parent Context: ${pName}`);
  } else {
    lines.push(`## [${category}] ${entityName} (id: ${id})`);
  }
  lines.push(`**Source File:** ${file}`);
  lines.push(`**Category:** ${category}`);
  if (nameEn) lines.push(`**Name:** ${nameEn}`);
  if (nameRu) lines.push(`**Name (RU):** ${nameRu}`);
  if (titleEn && titleEn.trim()) lines.push(`**Title:** ${titleEn}`);

  // ── set[] name/value → campos legíveis (NPC stats, skill params, etc) ──
  const sets = raw['set'];
  if (Array.isArray(sets) && sets.length > 0) {
    lines.push('\n### Stats');
    lines.push(...setsToFields(sets as Array<{ name: string; value: unknown }>));
  }

  // ── Skills do NPC ────────────────────────────────────────────────────────
  const skillsBlock = raw['skills'] as any;
  if (skillsBlock?.skill) {
    lines.push('\n### Skills');
    const skillList = Array.isArray(skillsBlock.skill) ? skillsBlock.skill : [skillsBlock.skill];
    for (const sk of skillList) {
      lines.push(`- skill id ${resolveName('skill', sk.id)} level ${sk.level}`);
    }
  }

  // ── Atributos (ataque/defesa elemental) ───────────────────────────────────
  const attrs = raw['attributes'] as any;
  if (attrs) {
    if (attrs.attack) {
      lines.push('\n### Attribute Attack');
      const atks = Array.isArray(attrs.attack) ? attrs.attack : [attrs.attack];
      for (const a of atks) lines.push(`- ${a.attribute}: ${a.value}`);
    }
    if (attrs.defence) {
      lines.push('\n### Attribute Defence');
      const defs = Array.isArray(attrs.defence) ? attrs.defence : [attrs.defence];
      for (const d of defs) lines.push(`- ${d.attribute}: ${d.value}`);
    }
  }

  // ── Drop list (rewardlist) ────────────────────────────────────────────────
  const rewardlist = raw['rewardlist'] as any;
  if (rewardlist) {
    lines.push('\n### Drop List');
    const groups = Array.isArray(rewardlist.group) ? rewardlist.group : (rewardlist.group ? [rewardlist.group] : []);
    for (const g of groups) {
      const rewards = Array.isArray(g.reward) ? g.reward : (g.reward ? [g.reward] : []);
      for (const r of rewards) {
        lines.push(`- itemId ${resolveName('item', r.itemId)}: chance ${r.chance}%, qty ${r.min ?? 1}-${r.max ?? 1}`);
      }
    }
    // Rewards diretos (sem grupo)
    const directRewards = Array.isArray(rewardlist.reward) ? rewardlist.reward : (rewardlist.reward ? [rewardlist.reward] : []);
    for (const r of directRewards) {
      lines.push(`- itemId ${resolveName('item', r.itemId)}: chance ${r.chance}%, qty ${r.min ?? 1}-${r.max ?? 1}`);
    }
  }

  // ── Minions ────────────────────────────────────────────────────────────────
  const minions = raw['minions'] as any;
  if (minions?.minion) {
    lines.push('\n### Minions');
    const minionList = Array.isArray(minions.minion) ? minions.minion : [minions.minion];
    for (const m of minionList) {
      lines.push(`- npcId ${resolveName('npc', m.npcId)} count ${m.count ?? 1}`);
    }
  }

  // ── Equip ─────────────────────────────────────────────────────────────────
  const equip = raw['equip'] as any;
  if (equip) {
    lines.push('\n### Equipment');
    if (equip.rhand) lines.push(`- Right hand itemId: ${resolveName('item', equip.rhand.itemId ?? equip.rhand)}`);
    if (equip.lhand) lines.push(`- Left hand itemId: ${resolveName('item', equip.lhand.itemId ?? equip.lhand)}`);
  }

  // ── Fallback: qualquer campo restante não tratado acima ──────────────────
  const handled = new Set(['id', 'classId', 'npcId', 'nameEn', 'nameRu', 'titleEn', 'titleRu', 'set', 'skills', 'attributes', 'rewardlist', 'minions', 'equip', 'type', '_entityType', '_parent']);
  
  const flatten = (obj: any, prefix = ''): string[] => {
    let res: string[] = [];
    if (!obj || typeof obj !== 'object') return res;

    for (const key of Object.keys(obj)) {
      if (handled.has(key) && prefix === '') continue;
      if (key.startsWith('@')) continue;
      
      const val = obj[key];
      const keyPath = prefix ? `${prefix}.${key}` : key;
      const keyLower = key.toLowerCase();

      if (Array.isArray(val)) {
        res.push(`\n### ${keyPath}`);
        val.forEach((item, i) => {
          if (typeof item === 'object' && item !== null) {
            res.push(...flatten(item, `${keyPath}[${i}]`));
          } else {
            res.push(`- ${item}`);
          }
        });
      } else if (typeof val === 'object' && val !== null) {
        res.push(...flatten(val, keyPath));
      } else {
        let displayVal = val;
        if (typeof val === 'number' || (typeof val === 'string' && /^\d+$/.test(val))) {
          if (keyLower.endsWith('itemid')) displayVal = resolveName('item', val);
          else if (keyLower.endsWith('npcid')) displayVal = resolveName('npc', val);
          else if (keyLower.endsWith('skillid')) displayVal = resolveName('skill', val);
          else if (keyLower.endsWith('classid')) displayVal = resolveName('class', val);
        }
        res.push(`- **${keyPath}**: ${displayVal}`);
      }
    }
    return res;
  };

  lines.push(...flatten(raw));

  return lines.join('\n');
}

function getAllFiles(dirPath: string, result: string[] = []): string[] {
  for (const file of fs.readdirSync(dirPath)) {
    const fPath = path.join(dirPath, file);
    if (fs.statSync(fPath).isDirectory()) getAllFiles(fPath, result);
    else result.push(fPath);
  }
  return result;
}

async function ingestFile(category: string, filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  const key = `${category}:${fileName}`;
  if (processedSet.has(key)) {
    console.log(`\x1b[90m[Ingester] Pulando: ${fileName}\x1b[0m`);
    return;
  }

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const jsonObj = parser.parse(fileContent);
    const rootTag = Object.keys(jsonObj).find(k => k !== '?xml');
    if (!rootTag) return;

    const list = jsonObj[rootTag];
    const entities: Array<Record<string, unknown>> = [];

    // Mapeamento de coleções que devem ser explodidas em entidades individuais
    const NESTED_COLLECTIONS: Record<string, string> = {
      'skillTree': 'skill',
      'list': 'item', // buylists, multisell
      'production': 'item',
    };

    const processJsonNode = (node: any, parentCtx: any = null) => {
      if (!node || typeof node !== 'object') return;

      for (const k of Object.keys(node)) {
        if (k.startsWith('@')) continue;
        const value = node[k];
        
        // Se este nó é uma coleção que deve ser explodida (ex: 'skill' dentro de 'skillTree')
        const childTag = NESTED_COLLECTIONS[k];
        if (childTag) {
           const nodes = Array.isArray(value) ? value : [value];
           nodes.forEach((nodeItem: any) => {
             const children = nodeItem[childTag];
             if (children) {
               const childList = Array.isArray(children) ? children : [children];
               childList.forEach((c: any) => {
                 entities.push({ _entityType: childTag, _parent: nodeItem, ...c });
               });
             }
           });
           continue; // Sucesso ao explodir
        }

        // Se o nó pai é um container global (ex: 'list' em buylists ou skillTrees)
        if (NESTED_COLLECTIONS[rootTag] && k !== 'npcs' && k !== '_parent') {
           const childTag = NESTED_COLLECTIONS[rootTag];
           // Se o valor já é o que queremos (ex: 'item' dentro de 'list')
           if (k === childTag) {
              const childList = Array.isArray(value) ? value : [value];
              childList.forEach((c: any) => {
                entities.push({ _entityType: childTag, _parent: node, ...c });
              });
              continue;
           }
           // Se é um nível intermediário (ex: 'skillTree' dentro de 'list'), descemos recursivamente
           if (typeof value === 'object') {
              const items = Array.isArray(value) ? value : [value];
              items.forEach(item => processJsonNode(item, node));
              continue;
           }
        }

        // Fallback para comportamento padrão
        if (Array.isArray(value)) {
          value.forEach(item => {
            if (typeof item === 'object') entities.push({ _entityType: k, ...item });
          });
        } else if (typeof value === 'object' && value !== null) {
          entities.push({ _entityType: k, ...value });
        }
      }
    };

    processJsonNode(list);

    if (entities.length === 0) entities.push({ _entityType: rootTag, ...list });

    console.log(`\x1b[34m[Ingester] ${fileName}: ${entities.length} entidades\x1b[0m`);

    const finalChunks: Chunk[] = [];
    for (const entity of entities) {
      const entityId = String(entity['id'] ?? entity['classId'] ?? entity['npcId'] ?? entity['name'] ?? 'N/A');
      const summary = generateSummary(category, fileName, entity);

      // Chunks grandes são divididos mantendo o cabeçalho
      if (summary.length > 20000) {
        const parts = splitBySize(summary, category, fileName, entityId, String(entity['_entityType'] ?? ''));
        finalChunks.push(...parts);
      } else {
        finalChunks.push({
          content: summary,
          metadata: { category, source_file: fileName, entity_id: entityId, type: String(entity['_entityType'] ?? '') },
          raw: entity,
        });
      }
    }

    await processChunks(finalChunks);
    processedSet.add(key);

  } catch (err) {
    console.error(`\x1b[31m[Ingester] Erro em ${filePath}: ${err}\x1b[0m`);
  }
}

function splitBySize(content: string, category: string, file: string, entityId: string, type: string): Chunk[] {
  const lines = content.split('\n');
  const header = lines.slice(0, 5).join('\n'); // primeiras 5 linhas = cabeçalho
  const body = lines.slice(5);
  const chunks: Chunk[] = [];
  let current: string[] = [];
  let part = 1;

  for (const line of body) {
    current.push(line);
    if ((header + '\n' + current.join('\n')).length > 15000) {
      chunks.push({
        content: `${header} [Part ${part}]\n${current.join('\n')}`,
        metadata: { category, source_file: file, entity_id: `${entityId}_p${part}`, type },
        raw: {},
      });
      current = [];
      part++;
    }
  }
  if (current.length > 0) {
    chunks.push({
      content: `${header} [Part ${part}]\n${current.join('\n')}`,
      metadata: { category, source_file: file, entity_id: `${entityId}_p${part}`, type },
      raw: {},
    });
  }
  return chunks;
}

async function processChunks(chunks: Chunk[]): Promise<void> {
  const batchSize = 10;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(chunks.length / batchSize);

    try {
      console.log(`\x1b[34m[Ingester] Embedding batch ${batchNum}/${totalBatches}...\x1b[0m`);
      const embeddings = await generateEmbeddingsBatch(batch.map(c => c.content));

      const placeholders = batch
        .map((_, idx) => `($${idx * 6 + 1}, $${idx * 6 + 2}, $${idx * 6 + 3}, $${idx * 6 + 4}, $${idx * 6 + 5}, $${idx * 6 + 6}::vector)`)
        .join(', ');

      const params = batch.flatMap((chunk, idx) => [
        chunk.metadata.category,
        chunk.metadata.source_file,
        chunk.metadata.entity_id,
        chunk.content,
        chunk.raw,
        `[${embeddings[idx].join(',')}]`,
      ]);

      await pool.query(
        `INSERT INTO detailed_knowledge (category, source_file, entity_id, content, raw_data, embedding) VALUES ${placeholders}`,
        params
      );
      console.log(`\x1b[32m[Ingester] Batch OK!\x1b[0m`);

    } catch (err: any) {
      console.error(`\x1b[31m[Ingester] Erro no batch: ${err.message}\x1b[0m`);
    }
  }
}

async function ingestFolder(folder: string): Promise<void> {
  const fullPath = path.join(BASE_PATH, folder);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[Ingester] Pasta não encontrada: ${fullPath}`);
    return;
  }
  const files = getAllFiles(fullPath).filter(f => f.endsWith('.xml'));
  console.log(`\x1b[36m[Ingester] ${folder} (${files.length} arquivos)\x1b[0m`);
  for (const file of files) await ingestFile(folder, file);
}

async function start(): Promise<void> {
  console.log('[Ingester] Iniciando...');

  // Carrega arquivos já processados para continuar de onde parou
  try {
    const clearCat = process.env.CLEAR_CATEGORY;
    if (clearCat) {
      console.log(`\x1b[31m[Ingester] LIMPANDO CATEGORIA: ${clearCat}\x1b[0m`);
      await pool.query('DELETE FROM detailed_knowledge WHERE category = $1', [clearCat]);
    }

    const res = await pool.query('SELECT DISTINCT category, source_file FROM detailed_knowledge');
    res.rows.forEach((r: { category: string; source_file: string }) => {
      processedSet.add(`${r.category}:${r.source_file}`);
    });
    console.log(`[Ingester] ${processedSet.size} arquivos já processados.`);
  } catch (e: any) {
    console.error('[Ingester] Erro ao checar arquivos processados:', e.message);
  }

  await preScanDefinitions();

  let foldersToProcess = TARGET_FOLDERS;
  const clearCat = process.env.CLEAR_CATEGORY;

  if (clearCat) {
    foldersToProcess = [clearCat];
  } else {
    // Modo Interativo
    const { selection } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selection',
        message: 'Selecione as categorias para ingestão (Espaço para marcar, Enter para confirmar):',
        choices: [
          { name: '--- TUDO ---', value: 'ALL' },
          ...TARGET_FOLDERS.map(f => ({ name: f, value: f }))
        ],
        pageSize: 15
      }
    ]);

    if (!selection || selection.length === 0) {
      console.log('Nenhuma categoria selecionada. Saindo.');
      process.exit(0);
    }

    if (!selection.includes('ALL')) {
      // Ordena por profundidade (comprimento) para garantir que o pai venha antes dos filhos
      const sorted = [...selection].sort((a, b) => a.length - b.length);
      const filtered: string[] = [];
      
      for (const folder of sorted) {
        // Se algum dos mantidos já é pai deste aqui, ignora
        const hasParent = filtered.some(p => folder.startsWith(p + '/'));
        if (!hasParent) {
          filtered.push(folder);
        } else {
          console.log(`\x1b[90m[Ingester] Ignorando redundância: ${folder} (já incluso em seu pai)\x1b[0m`);
        }
      }
      foldersToProcess = filtered;
    }
  }

  console.log(`\x1b[32m[Ingester] Processando ${foldersToProcess.length} categorias...\x1b[0m`);
  for (const folder of foldersToProcess) await ingestFolder(folder);

  console.log('[Ingester] Concluído!');
  await pool.end();
  process.exit(0);
}

start().catch(async (err) => {
  console.error('[Ingester] Erro fatal:', err);
  await pool.end();
  process.exit(1);
});