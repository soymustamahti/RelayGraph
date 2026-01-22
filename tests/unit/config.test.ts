import { describe, expect, it } from "bun:test";
import {
  DEFAULT_MODEL_CONFIG,
  Neo4jConfigSchema,
  PostgresConfigSchema,
  RelayConfigSchema,
  resolveModelConfig,
} from "../../src/config";

describe("Configuration Schemas", () => {
  describe("PostgresConfigSchema", () => {
    it("should validate valid postgres config", () => {
      const config = { connectionString: "postgres://localhost:5432/db" };
      const result = PostgresConfigSchema.parse(config);
      expect(result.connectionString).toBe(config.connectionString);
    });

    it("should reject missing connectionString", () => {
      expect(() => PostgresConfigSchema.parse({})).toThrow();
    });

    it("should accept optional embeddingDimensions", () => {
      const config = {
        connectionString: "postgres://localhost:5432/db",
        embeddingDimensions: 1536,
      };
      const result = PostgresConfigSchema.parse(config);
      expect(result.embeddingDimensions).toBe(1536);
    });
  });

  describe("Neo4jConfigSchema", () => {
    it("should validate valid neo4j config", () => {
      const config = {
        uri: "neo4j://localhost:7687",
        user: "neo4j",
        password: "password",
      };
      const result = Neo4jConfigSchema.parse(config);
      expect(result.uri).toBe(config.uri);
    });

    it("should reject incomplete config", () => {
      expect(() => Neo4jConfigSchema.parse({ uri: "test" })).toThrow();
    });
  });

  describe("RelayConfigSchema", () => {
    it("should validate full relay config", () => {
      const config = {
        pg: { connectionString: "postgres://localhost:5432/db" },
        neo4j: {
          uri: "neo4j://localhost:7687",
          user: "neo4j",
          password: "pass",
        },
      };
      const result = RelayConfigSchema.parse(config);
      expect(result.pg.connectionString).toBeDefined();
      expect(result.neo4j.uri).toBeDefined();
    });

    it("should accept optional models config", () => {
      const config = {
        pg: { connectionString: "postgres://localhost:5432/db" },
        neo4j: {
          uri: "neo4j://localhost:7687",
          user: "neo4j",
          password: "pass",
        },
        models: { chatModel: "gpt-4o" },
      };
      const result = RelayConfigSchema.parse(config);
      expect(result.models?.chatModel).toBe("gpt-4o");
    });
  });
});

describe("Model Configuration", () => {
  describe("DEFAULT_MODEL_CONFIG", () => {
    it("should have gpt-4o-mini as chat model", () => {
      expect(DEFAULT_MODEL_CONFIG.chatModel).toBe("gpt-4o-mini");
    });

    it("should have text-embedding-3-small as embedding model", () => {
      expect(DEFAULT_MODEL_CONFIG.embeddingModel).toBe(
        "text-embedding-3-small",
      );
    });

    it("should have 1536 embedding dimensions", () => {
      expect(DEFAULT_MODEL_CONFIG.embeddingDimensions).toBe(1536);
    });

    it("should have temperature 0", () => {
      expect(DEFAULT_MODEL_CONFIG.temperature).toBe(0);
    });
  });

  describe("resolveModelConfig", () => {
    it("should return defaults when no input provided", () => {
      const resolved = resolveModelConfig();
      expect(resolved).toEqual(DEFAULT_MODEL_CONFIG);
    });

    it("should merge custom values with defaults", () => {
      const resolved = resolveModelConfig({ chatModel: "gpt-4o" });
      expect(resolved.chatModel).toBe("gpt-4o");
      expect(resolved.embeddingModel).toBe("text-embedding-3-small");
    });

    it("should override all provided values", () => {
      const custom = {
        chatModel: "gpt-4o",
        embeddingModel: "text-embedding-ada-002",
        embeddingDimensions: 1024,
        temperature: 0.5,
        maxRetries: 5,
      };
      const resolved = resolveModelConfig(custom);
      expect(resolved).toEqual(custom);
    });
  });
});
