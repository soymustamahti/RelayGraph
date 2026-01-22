import OpenAI from "openai";
import {
  DEFAULT_MODEL_CONFIG,
  type RelayConfig,
  RelayConfigSchema,
  type RelayConfigWithClient,
  type ResolvedModelConfig,
} from "./config";
import { Neo4jDriver } from "./db/neo4j";
import { PostgresDriver } from "./db/postgres";
import type {
  IChunkerConfig,
  IIngestionResult,
  IngestionProgressCallback,
} from "./interfaces";
import {
  DEFAULT_INGESTION_CONFIG,
  IngestionPipeline,
} from "./modules/ingestion";
import { HybridRetriever, type RetrieverOptions } from "./modules/retrieval";

export class RelayGraph {
  private pg: PostgresDriver;
  private neo4j: Neo4jDriver;
  private ingestion: IngestionPipeline;
  private retriever: HybridRetriever;
  private openai: OpenAI;
  private config: ResolvedModelConfig;

  constructor(config: RelayConfigWithClient) {
    const validConfig = RelayConfigSchema.parse(config);
    const modelConfig: ResolvedModelConfig = {
      ...DEFAULT_MODEL_CONFIG,
      ...validConfig.models,
    };

    this.pg = new PostgresDriver({
      ...validConfig.pg,
      embeddingDimensions: modelConfig.embeddingDimensions,
    });
    this.neo4j = new Neo4jDriver(validConfig.neo4j);
    this.config = modelConfig;

    if (config.openaiClient) {
      this.openai = config.openaiClient;
    } else {
      const apiKey = validConfig.openaiApiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OpenAI API Key is required");
      this.openai = new OpenAI({ apiKey });
    }

    this.ingestion = new IngestionPipeline(
      this.pg,
      this.neo4j,
      this.openai,
      modelConfig,
      validConfig.ingestion,
    );

    const moduleOptions: RetrieverOptions = {
      openaiClient: this.openai,
      models: modelConfig,
    };
    this.retriever = new HybridRetriever(this.pg, this.neo4j, moduleOptions);
  }

  async init(): Promise<void> {
    await this.pg.connect();
    await this.pg.init();
    await this.neo4j.verifyConnectivity();
    await this.neo4j.init();
  }

  async close(): Promise<void> {
    await this.pg.disconnect();
    await this.neo4j.close();
  }

  async addDocument(
    text: string,
    metadata?: { name?: string; source?: string; [key: string]: unknown },
    onProgress?: IngestionProgressCallback,
  ): Promise<IIngestionResult> {
    return await this.ingestion.ingest(text, metadata || {}, onProgress);
  }

  async ask(query: string): Promise<{
    answer: string;
    context: {
      chunks: Array<{ id: string; content: string; similarity: number }>;
      entities: Array<{ id: string; name: string; type?: string }>;
      graph: Array<{
        source: { name: string };
        relationship: string;
        target: { name: string };
      }>;
    };
  }> {
    const context = await this.retriever.retrieve(query);
    const answer = await this.synthesizeAnswer(query, context);

    return {
      answer,
      context: {
        chunks: context.chunks,
        entities: context.entities,
        graph: context.knowledgeGraph.map((t) => ({
          source: { name: t.source.name },
          relationship: t.relationship,
          target: { name: t.target.name },
        })),
      },
    };
  }

  getConfig(): ResolvedModelConfig {
    return { ...this.config };
  }

  getIngestionPipeline(): IngestionPipeline {
    return this.ingestion;
  }

  getRetriever(): HybridRetriever {
    return this.retriever;
  }

  getPostgresDriver(): PostgresDriver {
    return this.pg;
  }

  getNeo4jDriver(): Neo4jDriver {
    return this.neo4j;
  }

  setChunkerConfig(config: Partial<IChunkerConfig>): void {
    this.ingestion.setChunkerConfig(config);
  }

  async getStats(): Promise<{
    pg: { documentCount: number; chunkCount: number };
    neo4j: {
      entityCount: number;
      relationshipCount: number;
      entityTypes: Record<string, number>;
      relationshipTypes: Record<string, number>;
    };
  }> {
    const pgStats = await this.pg.getStats();
    const neo4jStats = await this.neo4j.getStats();
    return { pg: pgStats, neo4j: neo4jStats };
  }

  private async synthesizeAnswer(
    query: string,
    context: {
      chunks: Array<{ content: string }>;
      knowledgeGraph: Array<{
        source: { name: string };
        relationship: string;
        target: { name: string };
        fact?: string;
      }>;
    },
  ): Promise<string> {
    if (context.chunks.length === 0) {
      return "I couldn't find any relevant information.";
    }

    const chunkText = context.chunks.map((c) => c.content).join("\n---\n");
    const graphText = context.knowledgeGraph
      .map(
        (t) =>
          `${t.source.name} -[${t.relationship}]-> ${t.target.name}${
            t.fact ? `: ${t.fact}` : ""
          }`,
      )
      .join("\n");

    const completion = await this.openai.chat.completions.create({
      model: this.config.chatModel,
      temperature: this.config.temperature,
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that answers questions based on the provided context.
Use the text chunks and knowledge graph relationships to provide accurate, comprehensive answers.
If the context doesn't contain enough information, say so.
Cite specific facts from the context when relevant.`,
        },
        {
          role: "user",
          content: `Query: ${query}

Context (Text Chunks):
${chunkText}

Context (Knowledge Graph):
${graphText}

Please answer the query based on this context.`,
        },
      ],
    });

    return completion.choices[0].message.content || "No answer generated.";
  }
}
