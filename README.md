# L2-AI-Brain

AI-powered Lineage 2 High Five Wiki Knowledge System with RAG (Retrieval-Augmented Generation).

## Features
- **Hybrid Search**: Combines PGVector semantic search with Postgres full-text search.
- **Dynamic Data Extraction**: Specialized in extracting technical data from Lineage 2 XMLs (Skills, Items, NPCs, etc.).
- **RAG Evaluation**: Integrated with `promptfoo` for testing and improving answer quality.

## Setup
1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Configure environment:
   Copy `.env.example` to `.env` and fill in your Supabase and OpenAI keys.
3. Run the ingestor:
   ```bash
   pnpm run ingester
   ```

## Usage
- **Chat with the Wiki**:
  ```bash
  pnpm run ask
  ```
- **Run Evaluations (Promptfoo)**:
  ```bash
  npx promptfoo eval
  npx promptfoo view
  ```

## Project Structure
- `src/rag/`: Core RAG logic (search and query).
- `src/ingestion/`: Parsers for Lineage 2 data.
- `promptfooconfig.yaml`: Evaluation test suite.
