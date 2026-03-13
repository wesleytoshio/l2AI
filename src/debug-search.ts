import * as dotenv from 'dotenv';
dotenv.config();
import { searchKnowledge } from './rag/searchService';

async function debug() {
    const query = "em que level eu pego a habilidade guts";
    console.log(`Debugging search for: "${query}"`);
    try {
        const results = await searchKnowledge(query, 10);
        console.log('Results count:', results.length);
        results.forEach((r, i) => {
            console.log(`--- Result ${i + 1} (Similarity: ${r.similarity}) ---`);
            console.log(`Type: ${r.metadata?.type}, Name: ${r.metadata?.name}`);
            console.log('Content Start:', r.content.substring(0, 100));
        });
    } catch (e) {
        console.error('Debug Error:', e);
    }
}

debug();
