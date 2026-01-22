import OpenAI from "openai";
import { type RelayConfig, RelayConfigSchema } from "./config";
import { Neo4jDriver } from "./db/neo4j";
import { PostgresDriver } from "./db/postgres";
import { Extractor } from "./modules/Extractor";
import { HybridRetriever } from "./modules/HybridRetriever";

export class RelayGraph {
  private pg: PostgresDriver;
  private neo4j: Neo4jDriver;
  private extractor: Extractor;
  private retriever: HybridRetriever;

  constructor(config: RelayConfig) {
    const validConfig = RelayConfigSchema.parse(config);

    this.pg = new PostgresDriver(validConfig.pg);
    this.neo4j = new Neo4jDriver(validConfig.neo4j);

    const apiKey = validConfig.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAI API Key is required");

    this.extractor = new Extractor(apiKey, this.pg, this.neo4j);
    this.retriever = new HybridRetriever(apiKey, this.pg, this.neo4j);
  }

  async init() {
    await this.pg.connect();
    await this.pg.init();
    await this.neo4j.verifyConnectivity();
  }

  async close() {
    await this.pg.disconnect();
    await this.neo4j.close();
  }

  async addDocument(text: string): Promise<string> {
    return await this.extractor.process(text);
  }

  async ask(query: string) {
    const context = await this.retriever.retrieve(query);

    const synthesis = await this.synthesizeAnswer(query, context);
    return synthesis;
  }

  private async synthesizeAnswer(
    query: string,
    context: { chunks: any[]; knowledgeGraph: any[] },
  ): Promise<string> {
    if (context.chunks.length === 0)
      return "I couldn't find any relevant information.";

    const chunkText = context.chunks.map((c) => c.content).join("\n---\n");
    const graphText = context.knowledgeGraph
      .map((t) => `${t.source.name} -[${t.relationship}]-> ${t.target.name}`)
      .join("\n");

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Answer the user question based on the provided Context (Text Chunks and Graph Connections).",
        },
        {
          role: "user",
          content: `Query: ${query}\n\nContext Chunks:\n${chunkText}\n\nContext Graph:\n${graphText}`,
        },
      ],
    });

    return completion.choices[0].message.content || "No answer generated.";
  }
}
