import OpenAI from "openai";
import type { ModelConfigInput, ResolvedModelConfig } from "../config";
import { DEFAULT_MODEL_CONFIG } from "../config";
import type { Neo4jDriver } from "../db/neo4j";
import type { PostgresDriver } from "../db/postgres";

export interface RetrieverOptions {
  openaiClient?: OpenAI;
  apiKey?: string;
  models?: Partial<ModelConfigInput>;
}

export class HybridRetriever {
  private openai: OpenAI;
  private pg: PostgresDriver;
  private neo4j: Neo4jDriver;
  private config: ResolvedModelConfig;

  constructor(
    pg: PostgresDriver,
    neo4j: Neo4jDriver,
    options: RetrieverOptions,
  ) {
    if (options.openaiClient) {
      this.openai = options.openaiClient;
    } else if (options.apiKey) {
      this.openai = new OpenAI({ apiKey: options.apiKey });
    } else {
      throw new Error("Either openaiClient or apiKey must be provided");
    }

    this.pg = pg;
    this.neo4j = neo4j;
    this.config = { ...DEFAULT_MODEL_CONFIG, ...options.models };
  }

  async retrieve(query: string) {
    const embeddingResponse = await this.openai.embeddings.create({
      model: this.config.embeddingModel,
      input: query,
      encoding_format: "float",
    });
    const embedding = embeddingResponse.data[0].embedding;

    const chunks = await this.pg.findSimilarChunks(embedding, 5);
    const chunkIds = chunks.map((c) => c.id);

    if (chunkIds.length === 0) {
      return { chunks: [], knowledgeGraph: [] };
    }

    const entities = await this.neo4j.findEntitiesByChunks(chunkIds);
    const entityIds = entities.map((e) => e.id);
    let triples: any[] = [];
    if (entityIds.length > 0) {
      triples = await this.neo4j.getNeighbors(entityIds);
    }

    return {
      chunks,
      knowledgeGraph: triples,
    };
  }
}
