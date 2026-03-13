import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
import { generateEmbedding } from './ingestion/embedder';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debug() {
    const query = "em que level eu pego a habilidade guts";
    console.log(`Query: ${query}`);
    const embedding = await generateEmbedding(query);

    const { data: rpc, error: rpcError } = await supabase.rpc('match_knowledge', {
        query_embedding: embedding,
        match_threshold: -1, // NO THRESHOLD
        match_count: 5
    });

    console.log('--- RPC Results Details ---');
    rpc?.forEach((r: any, i: number) => {
        console.log(`Rank ${i+1} | Score: ${r.similarity}`);
        console.log(`Title: ${r.metadata?.name} | Chunk: ${r.content.substring(0, 150)}...`);
    });
}

debug();
