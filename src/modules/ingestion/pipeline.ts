import type OpenAI from "openai";
import type { ResolvedModelConfig } from "../../config";
import type { Neo4jDriver } from "../../db/neo4j";
import type { PostgresDriver } from "../../db/postgres";
import type {
  IChunkerConfig,
  IExtractionResult,
  IIngestionConfig,
  IIngestionPipeline,
  IIngestionResult,
  IngestionProgressCallback,
} from "../../interfaces";
import {
  EXTRACTION_JSON_SCHEMA,
  ExtractionResultSchema,
} from "../../schemas/extraction";
import { slugify } from "../../utils/text";
import { Chunker } from "../chunker";

export const DEFAULT_INGESTION_CONFIG: IIngestionConfig = {
  embeddingBatchSize: 20,
  parallelExtractions: 5,
};

export class IngestionPipeline implements IIngestionPipeline {
  private pg: PostgresDriver;
  private neo4j: Neo4jDriver;
  private openai: OpenAI;
  private modelConfig: ResolvedModelConfig;
  private config: IIngestionConfig;
  private chunker: Chunker;

  constructor(
    pg: PostgresDriver,
    neo4j: Neo4jDriver,
    openai: OpenAI,
    modelConfig: ResolvedModelConfig,
    config: Partial<IIngestionConfig> = {},
  ) {
    this.pg = pg;
    this.neo4j = neo4j;
    this.openai = openai;
    this.modelConfig = modelConfig;
    this.config = { ...DEFAULT_INGESTION_CONFIG, ...config };
    this.chunker = new Chunker(this.config.chunker, openai);
  }

  async ingest(
    text: string,
    metadata: { name?: string; source?: string } = {},
    onProgress?: IngestionProgressCallback,
  ): Promise<IIngestionResult> {
    const startTime = Date.now();

    onProgress?.({ stage: "storing", message: "Checking document..." });
    const docResult = await this.pg.upsertDocument(
      metadata.name || "Untitled",
      text,
      metadata,
    );

    if (!docResult.isNew) {
      return this.createResult(docResult.id, false, 0, 0, 0, startTime);
    }

    onProgress?.({ stage: "chunking", message: "Chunking text..." });
    const chunks = await this.chunker.chunk(text);

    if (chunks.length === 0) {
      return this.createResult(docResult.id, true, 0, 0, 0, startTime);
    }

    onProgress?.({
      stage: "embedding",
      message: `Embedding ${chunks.length} chunks...`,
    });
    const embeddings = await this.batchEmbed(chunks.map((c) => c.content));

    await this.pg.addChunks(
      docResult.id,
      chunks.map((chunk, i) => ({
        content: chunk.content,
        embedding: embeddings[i],
        chunkIndex: chunk.index,
      })),
    );

    onProgress?.({
      stage: "extracting",
      message: `Extracting from ${chunks.length} chunks...`,
    });

    const { entities, relations } = await this.extractFromChunks(
      chunks,
      onProgress,
    );

    onProgress?.({
      stage: "storing",
      message: `Storing ${entities.size} entities, ${relations.length} relations...`,
    });

    const relationsCreated = await this.storeInNeo4j(entities, relations);

    return this.createResult(
      docResult.id,
      true,
      chunks.length,
      entities.size,
      relationsCreated,
      startTime,
    );
  }

  private createResult(
    documentId: string,
    isNewDocument: boolean,
    chunkCount: number,
    entityCount: number,
    relationCount: number,
    startTime: number,
  ): IIngestionResult {
    return {
      documentId,
      isNewDocument,
      chunkCount,
      entityCount,
      relationCount,
      processingTimeMs: Date.now() - startTime,
    };
  }

  private async extractFromChunks(
    chunks: { content: string }[],
    onProgress?: IngestionProgressCallback,
  ): Promise<{
    entities: Map<string, { name: string; type: string; description: string }>;
    relations: Array<{
      sourceId: string;
      targetId: string;
      type: string;
      fact: string;
    }>;
  }> {
    const entities = new Map<
      string,
      { name: string; type: string; description: string }
    >();
    const relations: Array<{
      sourceId: string;
      targetId: string;
      type: string;
      fact: string;
    }> = [];

    for (let i = 0; i < chunks.length; i += this.config.parallelExtractions) {
      const batch = chunks.slice(i, i + this.config.parallelExtractions);
      const extractions = await Promise.all(
        batch.map((chunk) => this.extract(chunk.content)),
      );

      for (const extraction of extractions) {
        for (const entity of extraction.entities) {
          const id = slugify(entity.name);
          const existing = entities.get(id);
          if (existing) {
            if (
              entity.description &&
              !existing.description.includes(entity.description)
            ) {
              existing.description += ` ${entity.description}`;
            }
          } else {
            entities.set(id, {
              name: entity.name,
              type: entity.type,
              description: entity.description || "",
            });
          }
        }

        for (const rel of extraction.relationships) {
          relations.push({
            sourceId: slugify(rel.source),
            targetId: slugify(rel.target),
            type: rel.relation,
            fact: rel.fact || "",
          });
        }
      }

      onProgress?.({
        stage: "extracting",
        message: `Extracted ${i + batch.length}/${chunks.length} chunks...`,
      });
    }

    return { entities, relations };
  }

  private async storeInNeo4j(
    entities: Map<string, { name: string; type: string; description: string }>,
    relations: Array<{
      sourceId: string;
      targetId: string;
      type: string;
      fact: string;
    }>,
  ): Promise<number> {
    for (const [id, entity] of entities) {
      await this.neo4j.upsertEntity({
        id,
        name: entity.name,
        type: entity.type,
        description: entity.description,
      });
    }

    const nameToId = new Map<string, string>();
    for (const [id, entity] of entities) {
      nameToId.set(entity.name.toLowerCase(), id);
      nameToId.set(id, id);
    }

    const findEntityId = (name: string): string | null => {
      const directId = slugify(name);
      if (entities.has(directId)) return directId;

      const lowered = name.toLowerCase();
      if (nameToId.has(lowered)) return nameToId.get(lowered)!;

      for (const [key, id] of nameToId) {
        if (key.includes(lowered) || lowered.includes(key)) {
          return id;
        }
      }
      return null;
    };

    let relationsCreated = 0;
    let relationsFailed = 0;

    for (const rel of relations) {
      const sourceId = findEntityId(rel.sourceId) || rel.sourceId;
      const targetId = findEntityId(rel.targetId) || rel.targetId;

      if (entities.has(sourceId) && entities.has(targetId)) {
        try {
          await this.neo4j.upsertRelationship({
            id: `${sourceId}-${rel.type}-${targetId}`,
            sourceId,
            targetId,
            type: rel.type,
            fact: rel.fact,
          });
          relationsCreated++;
        } catch {
          relationsFailed++;
        }
      } else {
        relationsFailed++;
      }
    }

    console.log(
      `Relations: ${relationsCreated} created, ${relationsFailed} failed (missing entities)`,
    );
    return relationsCreated;
  }

  private async batchEmbed(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    const batchSize = this.config.embeddingBatchSize;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.openai.embeddings.create({
        model: this.modelConfig.embeddingModel,
        input: batch,
        encoding_format: "float",
      });
      embeddings.push(...response.data.map((d) => d.embedding));
    }

    return embeddings;
  }

  private async extract(text: string): Promise<IExtractionResult> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.modelConfig.chatModel,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `Extract entities and relationships from the text.

Entity types: Person, Organization, Location, Technology, Project, Concept, Event
Relation types: WORKS_FOR, WORKS_WITH, USES, CREATED, LOCATED_IN, PART_OF, KNOWS, RELATED_TO, PARTICIPATES_IN, MEMBER_OF

IMPORTANT: 
- Extract ALL entities and relationships
- For relationships, use the EXACT entity names as source and target
- Keep entity names SHORT and consistent (e.g., "Kiyotaka" not "Kiyotaka Ayanokoji")`,
          },
          { role: "user", content: text },
        ],
        response_format: {
          type: "json_schema",
          json_schema: EXTRACTION_JSON_SCHEMA,
        },
      });

      const json = response.choices[0].message.content;
      if (!json) {
        return { entities: [], relationships: [] };
      }

      return ExtractionResultSchema.parse(JSON.parse(json));
    } catch (error) {
      console.error("Extraction error:", error);
      return { entities: [], relationships: [] };
    }
  }

  setChunkerConfig(config: Partial<IChunkerConfig>): void {
    this.chunker.setConfig(config);
  }
}
