import type OpenAI from "openai";
import { z } from "zod";

export const PostgresConfigSchema = z.object({
  connectionString: z.string(),
});

export const Neo4jConfigSchema = z.object({
  uri: z.string(),
  user: z.string(),
  password: z.string(),
});

export const ModelConfigSchema = z.object({
  chatModel: z.string().optional(),
  embeddingModel: z.string().optional(),
  embeddingDimensions: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxRetries: z.number().optional(),
});

export const RelayConfigSchema = z.object({
  pg: PostgresConfigSchema,
  neo4j: Neo4jConfigSchema,
  openaiApiKey: z.string().optional(),
  models: ModelConfigSchema.optional(),
});

export type PostgresConfig = z.infer<typeof PostgresConfigSchema>;
export type Neo4jConfig = z.infer<typeof Neo4jConfigSchema>;
export type ModelConfigInput = z.infer<typeof ModelConfigSchema>;
export type RelayConfig = z.infer<typeof RelayConfigSchema>;

export interface RelayConfigWithClient extends RelayConfig {
  openaiClient?: OpenAI;
}

export interface ResolvedModelConfig {
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  temperature: number;
  maxRetries: number;
}

export const DEFAULT_MODEL_CONFIG: ResolvedModelConfig = {
  chatModel: "gpt-4o",
  embeddingModel: "text-embedding-3-small",
  embeddingDimensions: 1536,
  temperature: 0,
  maxRetries: 3,
};

export function resolveModelConfig(
  input?: ModelConfigInput,
): ResolvedModelConfig {
  return {
    ...DEFAULT_MODEL_CONFIG,
    ...input,
  };
}
