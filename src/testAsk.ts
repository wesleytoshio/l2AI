import { searchKnowledge } from './rag/searchService'; 
async function test() { 
    try {
        const r = await searchKnowledge('em que level eu pego a habilidade guts'); 
        console.log(JSON.stringify(r.map(x => ({
            name: x.metadata?.name || x.metadata?.entity_id, 
            sim: x.similarity, 
            cat: x.metadata?.category
        })), null, 2)); 
    } catch(e) {
        console.error(e);
    }
    process.exit(0); 
} 
test();
