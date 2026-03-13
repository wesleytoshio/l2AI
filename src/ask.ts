import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { askWiki } from './rag/queryService';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function chat() {
  console.log('--- L2 High Five AI Wiki (Type "exit" to quit) ---');
  
  const prompt = () => {
    rl.question('\nAsk about Lineage 2: ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        rl.close();
        return;
      }

      try {
        const answer = await askWiki(input);
        console.log('\nAI:', answer);
      } catch (error) {
        console.error('\nError:', error);
      }
      
      prompt();
    });
  };

  prompt();
}

chat();
