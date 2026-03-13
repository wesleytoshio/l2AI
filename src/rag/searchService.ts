import { Pool } from 'pg';
import { generateEmbedding } from '../ingestion/embedder';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.LOCAL_DB_URL
});

export interface SearchResult {
    content: string;
    metadata: {
        type: string;
        name: string;
        source_file: string;
    };
    similarity: number;
}

// ✅ FIX 1: Apenas termos ESPECÍFICOS de L2 — sem 'skill'/'ability' que são genéricos demais
const SYNONYM_MAP: Record<string, string[]> = {
    'rainha': ['freya', 'queen'],
    'gelo': ['freya', 'ice'],
    'mago': ['mystic', 'wizard', 'mage', 'sorcerer'],
    'feiticeiro': ['sorcerer', 'wizard', 'mystic'],
    'guerreiro': ['warrior', 'fighter'],
    'arqueiro': ['archer', 'hawkeye'],
    'raider': ['orc raider'],
    'humano': ['human'],
    'elfo': ['elf', 'elven'],
    'anao': ['dwarf', 'dwarven'],
    'orc': ['orc', 'orcish'],
    'level': ['lvl'],
    'nivel': ['level', 'lvl'],
    'niveis': ['levels', 'level'],
    'pega': ['learn', 'acquire', 'learns'],
    'pegar': ['learn', 'acquire', 'learns'],
    'aprende': ['learn', 'acquire', 'learns'],
    'aprender': ['learn', 'acquire'],
    'dropa': ['drop', 'drops', 'loot'],
    'dropar': ['drop', 'drops', 'loot'],
    'mata': ['kill', 'slay'],
    'matar': ['kill', 'slay'],
    'quest': ['quest', 'mission'],
    'magia': ['magic', 'spell'],
    'arma': ['weapon', 'sword', 'bow'],
    'armadura': ['armor', 'armour'],
};

// ✅ FIX 2: 'habilidade', 'skill', 'ability', 'classe', 'tem' viram stopwords contextuais
// São tão genéricos que poluem o keyword search com centenas de falsos positivos
const STOP_WORDS = new Set([
    'onde', 'como', 'qual', 'quando', 'quem', 'pode',
    'mais', 'isso', 'este', 'esta', 'que', 'o', 'a', 'e',
    'do', 'da', 'de', 'para', 'com', 'sem', 'nos', 'nas',
    'um', 'uma', 'os', 'as', 'em', 'por', 'ao', 'aos',
    // Termos genéricos de jogo — deixar o vector search resolver
    'habilidade', 'skill', 'ability', 'classe', 'class',
    'tem', 'quantos', 'quais', 'qual',
]);

export const searchKnowledge = async (queryText: string, limit: number = 8): Promise<SearchResult[]> => {

    // ==========================================
    // ① EXTRAÇÃO DE KEYWORDS & SINÔNIMOS
    // ==========================================
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
    console.log('KEYWORDS FINAIS:', finalKeywords);

    // ==========================================
    // ② BUSCA HÍBRIDA (Vector + Keyword em paralelo)
    // ==========================================

    const embedding = await generateEmbedding(queryText);
    const embeddingStr = `[${embedding.join(',')}]`;

    // ✅ FIX 3: Vector search com LIMIT maior para não perder resultados relevantes
    const vectorPromise = pool.query(
        `SELECT entity_id, category, source_file, content,
            1 - (embedding <=> $1::vector) AS vector_score
     FROM detailed_knowledge
     ORDER BY embedding <=> $1::vector
     LIMIT 100`,
        [embeddingStr]
    );

    let keywordPromise = Promise.resolve({ rows: [] } as any);
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

    // ==========================================
    // ③ RANKING & DIVERSITY
    // ==========================================
    const resultsMap = new Map<string, any>();

    // Process Keyword Results first (they often have exact matches)
    keywordRes.rows.forEach((row: any) => {
        const key = `${row.category}_${row.entity_id}`;
        
        // Exact Match Boost: Se o ID ou Categoria aparecem inteiros na query
        const isExactId = queryText.toLowerCase().includes(row.entity_id.toLowerCase());
        const exactBoost = isExactId ? 0.8 : 0.2;

        resultsMap.set(key, {
            content: row.content,
            metadata: {
                type: row.category,
                name: row.entity_id,
                source_file: row.source_file,
            },
            vector_score: 0,
            keyword_score: 1.0,
            boost: exactBoost
        });
    });

    // Process Vector Results
    vectorRes.rows.forEach((row: any) => {
        const key = `${row.category}_${row.entity_id}`;
        if (resultsMap.has(key)) {
            resultsMap.get(key).vector_score = Math.max(0, row.vector_score);
        } else {
            resultsMap.set(key, {
                content: row.content,
                metadata: {
                    type: row.category,
                    name: row.entity_id,
                    source_file: row.source_file,
                },
                vector_score: Math.max(0, row.vector_score),
                keyword_score: 0,
                boost: 0
            });
        }
    });

    const finalResults: SearchResult[] = Array.from(resultsMap.values())
        .map(r => ({
            content: r.content,
            metadata: r.metadata,
            // Híbrido: Vector (peso 0.6) + Keyword (0.4) + Boost de exatidão
            similarity: (r.vector_score * 0.6) + (r.keyword_score * 0.4) + r.boost,
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

    console.log('--- FINAL RANKING ---');
    finalResults.slice(0, 5).forEach((r, i) => {
        console.log(`  [${i + 1}] ${r.metadata.type} | ID: ${r.metadata.name} | Score: ${r.similarity.toFixed(3)} | File: ${r.metadata.source_file}`);
    });

    return finalResults;
};
