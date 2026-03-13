import { askWiki } from './rag/queryService';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Promptfoo custom provider
 * This function is called by promptfoo for each test case.
 */
export async function callApi(prompt: string, options?: any, context?: any) {
  try {
    const output = await askWiki(prompt);
    return {
      output,
    };
  } catch (err: any) {
    return {
      error: err.message || String(err),
    };
  }
}
