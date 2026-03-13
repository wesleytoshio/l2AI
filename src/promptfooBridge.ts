import { askWiki } from './rag/queryService';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const prompt = process.argv[2];
  if (!prompt) return;
  
  try {
    const response = await askWiki(prompt);
    process.stdout.write(response);
  } catch (err) {
    process.stderr.write(String(err));
    process.exit(1);
  }
}

main();
