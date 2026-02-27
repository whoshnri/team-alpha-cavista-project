// vector.ts — ChromaDB vector store for NIMI health knowledge base

import { ChromaClient, Collection, CloudClient } from "chromadb";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";

let collection: Collection | null = null;

export async function getCollection(): Promise<Collection> {
  if (collection) return collection;

  const client = new CloudClient({
    apiKey: 'ck-HVxB5BycEgg2usLho3vaG1q7UMDvMAzCHtAxh1ccjvLF',
    tenant: '59b79731-5004-4d0c-8acb-29979fd3dcfb',
    database: 'alpha'
  });

  collection = await client.getOrCreateCollection({
    name: "nimi_health_kb",
    metadata: { "hnsw:space": "cosine" },
  });

  return collection;
}

export async function retrieve(
  query: string,
  _apiKey?: string,
  topK = 5
): Promise<string> {
  const col = await getCollection();

  const embeddings = new HuggingFaceInferenceEmbeddings({
    apiKey: process.env.HUGGINGFACE_API_KEY,
    model: "sentence-transformers/all-MiniLM-L6-v2",
  });

  const queryEmbedding = await embeddings.embedQuery(query);

  const results = await col.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
  });

  const docs = results.documents?.[0] ?? [];
  return docs.filter(Boolean).join("\n\n---\n\n");
}

