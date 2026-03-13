import { askWiki } from './rag/queryService';
import * as dotenv from 'dotenv';
dotenv.config();

async function test() {
    const question = "qual classe tem a habilidade dash?";
    console.log(`\n--- TESTING QUESTION: "${question}" ---`);
    const answer = await askWiki(question);
    console.log(`\nAI ANSWER:\n${answer}`);
    process.exit(0);
}

test().catch(console.error);
