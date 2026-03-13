import { askWiki } from './rag/queryService';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env from the root directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Promptfoo provider interface for askWiki
 */
export async function callApi(prompt: string) {
  try {
    const response = await askWiki(prompt);
    return {
      output: response,
    };
  } catch (error: any) {
    return {
      error: error.message || String(error),
    };
  }
}

// Support running as a standalone script for simple testing
if (require.main === module) {
  const query = process.argv[2] || 'O que é a skill Prominence?';
  callApi(query).then(result => {
    console.log(JSON.stringify(result, null, 2));
  });
}
