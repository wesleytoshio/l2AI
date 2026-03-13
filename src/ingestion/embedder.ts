import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const generateEmbedding = async (text: string): Promise<number[]> => {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
};

export const generateEmbeddingsBatch = async (texts: string[], retries = 3): Promise<number[][]> => {
    try {
        const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: texts,
            encoding_format: 'float',
        }, { timeout: 30000 }); // 30 sec timeout
        return response.data.map(d => d.embedding);
    } catch (error: any) {
        if (retries > 0) {
            console.warn(`\x1b[33m[OpenAI] Embedding batch failed (${error.message}). Retrying in 3s... (${retries} left)\x1b[0m`);
            await new Promise(r => setTimeout(r, 3000));
            return generateEmbeddingsBatch(texts, retries - 1);
        }
        console.error(`\x1b[31m[OpenAI] Exhausted retries for embedding batch.\x1b[0m`);
        throw error;
    }
};
