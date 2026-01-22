import OpenAI from "openai";
import type { ModelConfigInput, ResolvedModelConfig } from "../config";
import { DEFAULT_MODEL_CONFIG } from "../config";
import type { Neo4jDriver } from "../db/neo4j";
import type { PostgresDriver } from "../db/postgres";
import {
  EXTRACTION_JSON_SCHEMA,
  type ExtractionResult,
  ExtractionResultSchema,
} from "../schemas/extraction";
import { slugify } from "../utils/text";

export interface ExtractorOptions {
  openaiClient?: OpenAI;
  apiKey?: string;
  models?: Partial<ModelConfigInput>;
}

export class Extractor {
  private openai: OpenAI;
  private pg: PostgresDriver;
  private neo4j: Neo4jDriver;
  private config: ResolvedModelConfig;

  constructor(
    pg: PostgresDriver,
    neo4j: Neo4jDriver,
    options: ExtractorOptions,
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

  async process(text: string): Promise<string> {
    const embeddingResponse = await this.openai.embeddings.create({
      model: this.config.embeddingModel,
      input: text,
      encoding_format: "float",
    });
    const embedding = embeddingResponse.data[0].embedding;

    const chunkId = await this.pg.addChunk(text, embedding, {
      source: "user-upload",
    });

    try {
      const extraction = await this.extract(text);
      await this.writeToGraph(extraction, chunkId);
      return chunkId;
    } catch (error) {
      console.error("Extraction failed, rolling back chunk:", error);
      await this.pg.deleteChunk(chunkId);
      throw error;
    }
  }

  private async extract(text: string): Promise<ExtractionResult> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: this.config.chatModel,
          temperature: this.config.temperature,
          messages: [
            {
              role: "system",
              content:
                "You are a knowledge graph extraction expert. Extract all entities and relationships from the text.",
            },
            {
              role: "user",
              content: `Extract entities and relationships from:\n\n"${text}"`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: EXTRACTION_JSON_SCHEMA,
          },
        });

        const rawJson = completion.choices[0].message.content;
        if (!rawJson) throw new Error("Empty LLM response");

        const parsed = JSON.parse(rawJson);
        return ExtractionResultSchema.parse(parsed);
      } catch (error) {
        if (attempt === this.config.maxRetries) throw error;
        console.warn(`Extraction attempt ${attempt} failed, retrying...`);
      }
    }
    throw new Error("Extraction failed after all retries");
  }

  private async writeToGraph(
    data: ExtractionResult,
    chunkId: string,
  ): Promise<void> {
    for (const entity of data.entities) {
      const id = slugify(entity.name);
      await this.neo4j.mergeNode(entity.type, id, entity.name, chunkId, {
        description: entity.description,
      });
    }

    for (const rel of data.relationships) {
      await this.neo4j.createRelationship(
        slugify(rel.source),
        "Entity",
        slugify(rel.target),
        "Entity",
        rel.relation,
        chunkId,
      );
    }
  }
}
