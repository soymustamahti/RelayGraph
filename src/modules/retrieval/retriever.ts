import OpenAI from "openai";
import type { ModelConfigInput, ResolvedModelConfig } from "../../config";
import { DEFAULT_MODEL_CONFIG } from "../../config";
import type { Neo4jDriver } from "../../db/neo4j";
import type { PostgresDriver } from "../../db/postgres";
import type {
  IRetrievalOptions,
  IRetrievalResult,
  IRetriever,
} from "../../interfaces";

export interface RetrieverOptions {
  openaiClient?: OpenAI;
  apiKey?: string;
  models?: Partial<ModelConfigInput>;
}

export class HybridRetriever implements IRetriever {
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

  async retrieve(
    query: string,
    options?: IRetrievalOptions,
  ): Promise<IRetrievalResult> {
    const maxChunks = options?.maxChunks ?? 5;
    const maxEntities = options?.maxEntities ?? 10;
    const chunkThreshold = options?.chunkThreshold ?? 0.3;

    const embedding = await this.getEmbedding(query);
    const chunks = await this.pg.searchChunks(
      embedding,
      maxChunks,
      chunkThreshold,
    );
    const entities = await this.neo4j.searchEntities(query, maxEntities);

    const knowledgeGraph: IRetrievalResult["knowledgeGraph"] = [];

    if (entities.length > 0) {
      const entityIds = entities.slice(0, 5).map((e) => e.id);
      const neighbors = await this.neo4j.getNeighbors(entityIds);

      for (const rel of neighbors) {
        knowledgeGraph.push({
          source: rel.source,
          relationship: rel.relationship,
          fact: rel.fact,
          target: rel.target,
        });
      }
    }

    return {
      chunks: chunks.map((c) => ({
        id: c.id,
        content: c.content,
        similarity: c.similarity,
      })),
      entities: entities.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        description: e.description,
      })),
      knowledgeGraph,
    };
  }

  async searchChunks(
    query: string,
    limit = 5,
  ): Promise<Array<{ id: string; content: string; similarity: number }>> {
    const embedding = await this.getEmbedding(query);
    return this.pg.searchChunks(embedding, limit, 0.3);
  }

  async searchEntities(query: string, limit = 10) {
    return this.neo4j.searchEntities(query, limit);
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: this.config.embeddingModel,
      input: text,
      encoding_format: "float",
    });
    return response.data[0].embedding;
  }
}
