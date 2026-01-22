import { z } from "zod";

export const EntitySchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
  attributes: z.record(z.string(), z.any()).optional(),
});

export const RelationshipSchema = z.object({
  source: z.string(),
  target: z.string(),
  relation: z.string(),
  fact: z
    .string()
    .describe("Natural language statement describing this relationship"),
  attributes: z.record(z.string(), z.any()).optional(),
});

export const ExtractionResultSchema = z.object({
  entities: z.array(EntitySchema),
  relationships: z.array(RelationshipSchema),
});

export type Entity = z.infer<typeof EntitySchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const EXTRACTION_JSON_SCHEMA = {
  name: "extraction_result",
  strict: true,
  schema: {
    type: "object",
    properties: {
      entities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "The name of the entity" },
            type: {
              type: "string",
              description: "Entity type: Person, Organization, Project, etc.",
            },
            description: {
              type: "string",
              description: "Brief description of the entity",
            },
          },
          required: ["name", "type", "description"],
          additionalProperties: false,
        },
      },
      relationships: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source: {
              type: "string",
              description: "Name of the source entity",
            },
            target: {
              type: "string",
              description: "Name of the target entity",
            },
            relation: {
              type: "string",
              description: "Relationship type: WORKS_FOR, BUILDS, etc.",
            },
            fact: {
              type: "string",
              description:
                "Natural language statement describing this relationship",
            },
          },
          required: ["source", "target", "relation", "fact"],
          additionalProperties: false,
        },
      },
    },
    required: ["entities", "relationships"],
    additionalProperties: false,
  },
} as const;
