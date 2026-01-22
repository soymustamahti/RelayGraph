import { z } from "zod";

export type EntityConfig = {
  label: string;
  description: string;
};

export type RelationConfig = {
  type: string;
  description: string;
};

export class SchemaManager {
  private entities: EntityConfig[];
  private relations: RelationConfig[];

  constructor() {
    this.entities = [
      { label: "Person", description: "Available for individuals." },
      {
        label: "Organization",
        description: "Companies, agencies, institutions.",
      },
      { label: "Location", description: "Physical places, cities, countries." },
    ];

    this.relations = [
      { type: "WORKS_FOR", description: "Person works for Organization." },
      { type: "LOCATED_IN", description: "Entity is located in Location." },
      { type: "RELATED_TO", description: "Generic relationship." },
    ];
  }

  extend(
    customEntities: EntityConfig[],
    customRelations: RelationConfig[],
  ): void {
    this.entities.push(...customEntities);
    this.relations.push(...customRelations);
  }

  getZodSchema() {
    return z.object({
      nodes: z.array(
        z.object({
          name: z.string(),
          label: z.enum([
            this.entities[0].label,
            ...this.entities.slice(1).map((e) => e.label),
          ]),
          description: z.string().optional(),
        }),
      ),
      edges: z.array(
        z.object({
          source: z
            .string()
            .describe("Name of the source node (must exist in nodes list)"),
          target: z
            .string()
            .describe("Name of the target node (must exist in nodes list)"),
          relation: z.enum([
            this.relations[0].type,
            ...this.relations.slice(1).map((r) => r.type),
          ]),
          description: z.string().optional(),
        }),
      ),
    });
  }

  getSystemPrompt(): string {
    const entityList = this.entities
      .map((e) => `- ${e.label}: ${e.description}`)
      .join("\n");
    const relationList = this.relations
      .map((r) => `- ${r.type}: ${r.description}`)
      .join("\n");

    return `
You are a top-tier Knowledge Graph Extractor.
Target Ontology:
Entities:
${entityList}

Relationships:
${relationList}

Rules:
1. Identify entities and relationships from the text.
2. Use ONLY the provided labels and relationship types.
3. Return JSON satisfying the schema.
    `.trim();
  }
}
