import OpenAI from "openai";
import type { Neo4jDriver } from "../db/neo4j";
import type { PostgresDriver } from "../db/postgres";
import {
  EXTRACTION_JSON_SCHEMA,
  type ExtractionResult,
  ExtractionResultSchema,
} from "../schemas/extraction";
import { slugify } from "../utils/text";

export class Extractor {
  private openai: OpenAI;
  private pg: PostgresDriver;
  private neo4j: Neo4jDriver;

  constructor(apiKey: string, pg: PostgresDriver, neo4j: Neo4jDriver) {
    this.openai = new OpenAI({ apiKey });
    this.pg = pg;
    this.neo4j = neo4j;
  }

  async process(text: string): Promise<string> {
    const embeddingResponse = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
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

  private async extract(text: string, retries = 3): Promise<ExtractionResult> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: "gpt-4o",
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
        if (attempt === retries) throw error;
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
