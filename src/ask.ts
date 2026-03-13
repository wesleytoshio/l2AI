import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { askWiki } from './rag/queryService';
import { closePool } from './rag/searchService';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function shutdown() {
  console.log('\nEncerrando conexões...');
  await closePool();
  rl.close();
  process.exit(0);
}

// Fecha o pool corretamente em Ctrl+C
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function chat() {
  console.log('--- L2 High Five AI Wiki (digite "sair" para encerrar) ---');

  const prompt = () => {
    rl.question('\nPergunta: ', async (input) => {
      const question = input.trim();

      if (!question) {
        prompt();
        return;
      }

      if (question.toLowerCase() === 'sair' || question.toLowerCase() === 'exit') {
        await shutdown();
        return;
      }

      try {
        const answer = await askWiki(question);
        console.log('\nWiki:', answer);
      } catch (error: any) {
        console.error('\nErro:', error?.message ?? error);
      }

      prompt();
    });
  };

  prompt();
}

chat();