import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { XMLParser } from 'fast-xml-parser';
import * as dotenv from 'dotenv';
import { generateEmbeddingsBatch } from './ingestion/embedder';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.LOCAL_DB_URL
});

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
});

const BASE_PATH = 'f:/L2 extract/game/data/stats';

const TARGET_FOLDERS = [
  'chars/classes',
  'skills/skillTrees',
  'skills/augmentation',
  'skills/options',
  'skills/skills',
  'npcs/npcs',
  'transformations',
  'regions/zones',
  'residences/castle',
  'residences/clanhall',
  'npcs/buylists',
  'npcs/multisell',
  'npcs/pets',
  'npcs/spawns',
  'npcs/spawnZones',
  'quests',
  'enchanting',
  'instances',
  'admin'
];

let processedSet = new Set<string>();

async function ingestFolder(folder: string) {
  const fullPath = path.join(BASE_PATH, folder);
  if (!fs.existsSync(fullPath)) {
    console.warn(`Folder not found: ${fullPath}`);
    return;
  }

  const files = getAllFiles(fullPath).filter(f => f.endsWith('.xml'));
  console.log(`\x1b[36mProcessing folder: ${folder} (${files.length} XML files)\x1b[0m`);

  for (const file of files) {
    await ingestFile(folder, file);
  }
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const fPath = path.join(dirPath, file);
    if (fs.statSync(fPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fPath);
    }
  });
  return arrayOfFiles;
}

async function ingestFile(category: string, filePath: string) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  const key = `${category}:${fileName}`;
  if (processedSet.has(key)) {
    console.log(`\x1b[90m  - Skipping already processed file: ${fileName}\x1b[0m`);
    return;
  }

  try {
    const jsonObj = parser.parse(fileContent);
    const rootTag = Object.keys(jsonObj).find(k => k !== '?xml');
    if (!rootTag) return;

    const list = jsonObj[rootTag];
    const entities: any[] = [];

    const keys = Object.keys(list || {});
    for (const k of keys) {
      if (k.startsWith('@')) continue;
      const value = list[k];
      if (Array.isArray(value)) {
        value.forEach(item => entities.push({ type: k, ...item }));
      } else if (typeof value === 'object') {
        entities.push({ type: k, ...value });
      }
    }

    if (entities.length === 0) {
      entities.push({ type: rootTag, ...list });
    }

    console.log(`\x1b[34m  - Parsing ${fileName}: ${entities.length} entities found.\x1b[0m`);

    const finalChunks: any[] = [];
    for (const entity of entities) {
      const entityId = entity.id || entity.classId || entity.npcId || entity.name || 'N/A';
      const summary = generateSummary(category, fileName, entity);

      if (summary.length > 20000) {
        console.log(`    !! Entity ${entityId} is too large (${summary.length} chars). Splitting...`);
        const subChunks = splitLargeEntity(category, fileName, entity);
        finalChunks.push(...subChunks);
      } else {
        finalChunks.push({
          content: summary,
          metadata: { category, source_file: fileName, entity_id: String(entityId), type: entity.type },
          raw: entity
        });
      }
    }

    await processChunks(finalChunks);
    processedSet.add(key);

  } catch (err) {
    console.error(`\x1b[31mError parsing ${filePath}: ${err}\x1b[0m`);
  }
}

function splitLargeEntity(category: string, file: string, entity: any): any[] {
  const baseLines: string[] = [];
  const entityName = entity.nameEn || entity.name || entity.id || entity.type || 'Entity';
  const entityId = entity.id || entity.classId || entity.npcId || 'N/A';

  baseLines.push(`## [${category}] ${entityName} (id: ${entityId}) [Part %P%]`);
  baseLines.push(`**Source File:** ${file}`);
  baseLines.push(`**Category:** ${category}`);
  if (entity.nameEn) baseLines.push(`**Name:** ${entity.nameEn}`);

  const allProps = flattenObject(entity);
  const subChunks: any[] = [];
  let currentLines: string[] = [];
  let part = 1;

  for (const prop of allProps) {
    currentLines.push(prop);
    if (currentLines.join('\n').length > 15000) {
      subChunks.push({
        content: baseLines.join('\n').replace('%P%', String(part)) + '\n' + currentLines.join('\n'),
        metadata: { category, source_file: file, entity_id: `${entityId}_p${part}`, type: entity.type },
        raw: entity
      });
      currentLines = [];
      part++;
    }
  }

  if (currentLines.length > 0) {
    subChunks.push({
      content: baseLines.join('\n').replace('%P%', String(part)) + '\n' + currentLines.join('\n'),
      metadata: { category, source_file: file, entity_id: `${entityId}_p${part}`, type: entity.type },
      raw: entity
    });
  }

  return subChunks;
}

function generateSummary(category: string, file: string, entity: any): string {
  const lines: string[] = [];
  const entityName = entity.nameEn || entity.name || entity.id || entity.type || 'Entity';
  const entityId = entity.id || entity.classId || entity.npcId || 'N/A';

  lines.push(`## [${category}] ${entityName} (id: ${entityId})`);
  lines.push(`**Source File:** ${file}`);
  lines.push(`**Category:** ${category}`);
  if (entity.nameEn) lines.push(`**Name:** ${entity.nameEn}`);
  if (entity.nameRu) lines.push(`**Name (RU):** ${entity.nameRu}`);

  flattenObject(entity).forEach(l => lines.push(l));

  return lines.join('\n');
}

function flattenObject(obj: any, prefix = ''): string[] {
  let result: string[] = [];
  if (obj === null || typeof obj !== 'object') return result;

  for (const key in obj) {
    if (key === 'type' || key === 'name' || key === 'nameEn' || key === 'nameRu') continue;
    const val = obj[key];
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(val)) {
      val.forEach((item, idx) => {
        const itemKey = `${fullKey}[${idx}]`;
        if (typeof item === 'object' && item !== null) {
          result = result.concat(flattenObject(item, itemKey));
        } else {
          result.push(`- **${itemKey}**: ${item}`);
        }
      });
    } else if (typeof val === 'object' && val !== null) {
      result = result.concat(flattenObject(val, fullKey));
    } else {
      result.push(`- **${fullKey}**: ${val}`);
    }
  }
  return result;
}

async function processChunks(chunks: any[]) {
  // Small batches to stay within token limits per request
  const batchSize = 10;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const contents = batch.map(c => c.content);

    try {
      console.log(`\x1b[34m    -> Embedding batch ${i / batchSize + 1} / ${Math.ceil(chunks.length / batchSize)}...\x1b[0m`);
      const embeddings = await generateEmbeddingsBatch(contents);

      const insertQuery = `INSERT INTO detailed_knowledge (category, source_file, entity_id, content, raw_data, embedding) VALUES ` +
        batch.map((_, idx) => `($${idx * 6 + 1}, $${idx * 6 + 2}, $${idx * 6 + 3}, $${idx * 6 + 4}, $${idx * 6 + 5}, $${idx * 6 + 6}::vector)`).join(', ');

      // Re-fixing the query string syntax error in my head before typing
      const placeholders = batch.map((_, idx) => `($${idx * 6 + 1}, $${idx * 6 + 2}, $${idx * 6 + 3}, $${idx * 6 + 4}, $${idx * 6 + 5}, $${idx * 6 + 6}::vector)`).join(', ');
      const finalQuery = `INSERT INTO detailed_knowledge (category, source_file, entity_id, content, raw_data, embedding) VALUES ${placeholders}`;

      const params = batch.flatMap((chunk, idx) => [
        chunk.metadata.category,
        chunk.metadata.source_file,
        chunk.metadata.entity_id,
        chunk.content,
        chunk.raw,
        `[${embeddings[idx].join(',')}]`
      ]);

      console.log(`\x1b[36m    -> Inserting batch...\x1b[0m`);
      await pool.query(finalQuery, params);
      console.log(`\x1b[32m    -> Batch Success!\x1b[0m`);
    } catch (err: any) {
      console.error(`\x1b[31m    !! Batch Error: ${err.message}\x1b[0m`);
    }
  }
}

async function start() {
  console.log('--- STARTING UNIVERSAL LINEAR INGESTION ---');

  try {
    const res = await pool.query('SELECT DISTINCT category, source_file FROM detailed_knowledge');
    res.rows.forEach(r => {
      processedSet.add(`${r.category}:${r.source_file}`);
    });
    console.log(`Loaded ${processedSet.size} completed files. Scrape will resume from where it left off!`);
  } catch (e: any) {
    console.error('Error fetching processed files:', e.message);
  }

  for (const folder of TARGET_FOLDERS) {
    await ingestFolder(folder);
  }

  console.log('--- UNIVERSAL INGESTION COMPLETE ---');
  process.exit(0);
}

start().catch(console.error);