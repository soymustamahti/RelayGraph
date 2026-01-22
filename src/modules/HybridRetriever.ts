import OpenAI from "openai";
import type { Neo4jDriver } from "../db/neo4j";
import type { PostgresDriver } from "../db/postgres";

export class HybridRetriever {
  private openai: OpenAI;
  private pg: PostgresDriver;
  private neo4j: Neo4jDriver;

  constructor(apiKey: string, pg: PostgresDriver, neo4j: Neo4jDriver) {
    this.openai = new OpenAI({ apiKey });
    this.pg = pg;
    this.neo4j = neo4j;
  }

  async retrieve(query: string) {
    const embeddingResponse = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
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
      chunks: chunks,
      knowledgeGraph: triples,
    };
  }
}
