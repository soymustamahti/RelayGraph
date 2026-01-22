import { z } from "zod";

export const PostgresConfigSchema = z.object({
  connectionString: z.string(),
});

export const Neo4jConfigSchema = z.object({
  uri: z.string(),
  user: z.string(),
  password: z.string(),
});

export const RelayConfigSchema = z.object({
  pg: PostgresConfigSchema,
  neo4j: Neo4jConfigSchema,
  openaiApiKey: z.string().optional(),
});

export type PostgresConfig = z.infer<typeof PostgresConfigSchema>;
export type Neo4jConfig = z.infer<typeof Neo4jConfigSchema>;
export type RelayConfig = z.infer<typeof RelayConfigSchema>;
