import { Pool } from 'pg';
import { generateEmbedding } from '../ingestion/embedder';
import { getSynonyms } from './synonymous';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.LOCAL_DB_URL });

export interface SearchResult {
    content: string;
    metadata: {
        type: string;
        name: string;
        source_file: string;
    };
    similarity: number;
}

const SYNONYM_MAP = getSynonyms('pt');

const STOP_WORDS = new Set([
    'onde', 'como', 'qual', 'quando', 'quem', 'pode',
    'mais', 'isso', 'este', 'esta', 'que', 'o', 'a', 'e',
    'do', 'da', 'de', 'para', 'com', 'sem', 'nos', 'nas',
    'um', 'uma', 'os', 'as', 'em', 'por', 'ao', 'aos',
    'tem', 'quantos', 'quais', 'qual', 'se', 'eu', 'meu', 'minha',
    'skill', 'ability', 'class',
]);

const embeddingCache = new Map<string, number[]>();

function tokenMatchScore(queryTokens: string[], entityId: string): number {
    const idLower = entityId.toLowerCase();
    const matches = queryTokens.filter(t => t.length > 2 && idLower.includes(t));
    if (matches.length === 0) return 0;
    return Math.min(0.2 + (matches.length - 1) * 0.1, 0.5);
}

// Boost forte quando o nome da entidade aparece no cabeçalho do chunk
// Resolve o caso onde vector score é baixo mas o nome bate exatamente
// ex: "baium" → header "## [npcs/npcs] Baium (id: 29020)" → boost 0.5
function nameMatchBoost(queryTokens: string[], content: string): number {
    const header = content.split('\n')[0].toLowerCase();
    const matches = queryTokens.filter(t => t.length > 2 && header.includes(t));
    if (matches.length === 0) return 0;
    return Math.min(0.5 + (matches.length - 1) * 0.15, 0.9);
}

export const searchKnowledge = async (queryText: string, limit = 8): Promise<SearchResult[]> => {

    const rawTokens = queryText
        .toLowerCase()
        .split(/\s+/)
        .map(w => w.replace(/[^a-záéíóúãõç0-9]/g, ''))
        .filter(w => w.length > 0);

    const keywordSet = new Set<string>();
    rawTokens.forEach(token => {
        if (!STOP_WORDS.has(token) && token.length > 1) {
            keywordSet.add(token);
            const syns = SYNONYM_MAP[token];
            if (syns) syns.forEach(s => keywordSet.add(s));
        }
    });

    const finalKeywords = Array.from(keywordSet);
    const cleanTokens = rawTokens.filter(t => !STOP_WORDS.has(t) && t.length > 2);
    console.log('[Search] Keywords:', finalKeywords);

    const cacheKey = queryText.trim().toLowerCase();
    let embedding = embeddingCache.get(cacheKey);
    if (!embedding) {
        embedding = await generateEmbedding(queryText);
        embeddingCache.set(cacheKey, embedding);
        console.log('[Search] Embedding gerado (novo)');
    } else {
        console.log('[Search] Embedding do cache');
    }
    const embeddingStr = `[${embedding.join(',')}]`;

    const vectorPromise = pool.query(
        `SELECT entity_id, category, source_file, content,
                1 - (embedding <=> $1::vector) AS vector_score
         FROM detailed_knowledge
         ORDER BY embedding <=> $1::vector
         LIMIT 100`,
        [embeddingStr]
    );

    let keywordPromise = Promise.resolve({ rows: [] as any[] });
    if (finalKeywords.length > 0) {
        const conditions = finalKeywords
            .map((_, i) => `content ILIKE $${i + 1} OR raw_data::text ILIKE $${i + 1}`)
            .join(' OR ');
        const params = finalKeywords.map(kw => `%${kw}%`);
        keywordPromise = pool.query(
            `SELECT entity_id, category, source_file, content
             FROM detailed_knowledge
             WHERE ${conditions}
             LIMIT 50`,
            params
        );
    }

    const [vectorRes, keywordRes] = await Promise.all([vectorPromise, keywordPromise]);

    const resultsMap = new Map<string, any>();

    keywordRes.rows.forEach((row: any) => {
        const key = `${row.category}_${row.entity_id}`;
        const idBoost = tokenMatchScore(cleanTokens, row.entity_id);
        const headerBoost = nameMatchBoost(cleanTokens, row.content);
        const boost = Math.max(idBoost, headerBoost);
        resultsMap.set(key, {
            content: row.content,
            metadata: { type: row.category, name: row.entity_id, source_file: row.source_file },
            vector_score: 0,
            keyword_score: 1.0,
            boost,
        });
    });

    vectorRes.rows.forEach((row: any) => {
        const key = `${row.category}_${row.entity_id}`;
        if (resultsMap.has(key)) {
            resultsMap.get(key).vector_score = Math.max(0, row.vector_score);
        } else {
            const idBoost = tokenMatchScore(cleanTokens, row.entity_id);
            const headerBoost = nameMatchBoost(cleanTokens, row.content);
            const boost = Math.max(idBoost, headerBoost);
            resultsMap.set(key, {
                content: row.content,
                metadata: { type: row.category, name: row.entity_id, source_file: row.source_file },
                vector_score: Math.max(0, row.vector_score),
                keyword_score: 0,
                boost,
            });
        }
    });

    const finalResults: SearchResult[] = Array.from(resultsMap.values())
        .map(r => ({
            content: r.content,
            metadata: r.metadata,
            similarity: (r.vector_score * 0.6) + (r.keyword_score * 0.4) + r.boost,
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

    console.log('[Search] Top 5:');
    finalResults.slice(0, 5).forEach((r, i) => {
        console.log(`  [${i + 1}] ${r.metadata.type} | ${r.metadata.name} | score: ${r.similarity.toFixed(3)}`);
    });

    return finalResults;
};

export const closePool = async (): Promise<void> => {
    await pool.end();
};