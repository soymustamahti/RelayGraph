import { z } from "@hono/zod-openapi";

export const ErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export const IngestRequestSchema = z.object({
  text: z.string().min(1).openapi({ example: "Mustapha builds RelayGraph." }),
  metadata: z
    .record(z.string(), z.any())
    .optional()
    .openapi({ example: { source: "manual" } }),
});

export const IngestResponseSchema = z.object({
  success: z.literal(true),
  chunkId: z.object({
    documentId: z.string(),
    isNewDocument: z.boolean(),
    chunkCount: z.number(),
    entityCount: z.number(),
    relationCount: z.number(),
    processingTimeMs: z.number(),
  }),
  message: z.string(),
});

export const AskRequestSchema = z.object({
  query: z.string().min(1).openapi({ example: "Who is building RelayGraph?" }),
});

export const AskResponseSchema = z.object({
  success: z.literal(true),
  answer: z.object({
    answer: z.string(),
    context: z.object({
      chunks: z.array(
        z.object({
          id: z.string(),
          content: z.string(),
          similarity: z.number(),
        }),
      ),
      entities: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          type: z.string().optional(),
        }),
      ),
      graph: z.array(
        z.object({
          source: z.object({ name: z.string() }),
          relationship: z.string(),
          target: z.object({ name: z.string() }),
        }),
      ),
    }),
  }),
});

export const HealthResponseSchema = z.object({
  status: z.string(),
  version: z.string(),
  uptime: z.number(),
});

export const StatsResponseSchema = z.object({
  success: z.literal(true),
  postgres: z.object({ chunks: z.number() }),
  neo4j: z.object({ nodes: z.number() }),
});
