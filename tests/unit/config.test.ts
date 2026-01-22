import { describe, expect, it } from "bun:test";
import { RelayConfigSchema } from "../../src/config";

describe("RelayConfigSchema", () => {
  describe("valid configurations", () => {
    it("should accept minimal valid config", () => {
      const config = {
        pg: { connectionString: "postgresql://localhost/test" },
        neo4j: {
          uri: "bolt://localhost:7687",
          user: "neo4j",
          password: "pass",
        },
      };
      expect(() => RelayConfigSchema.parse(config)).not.toThrow();
    });

    it("should accept config with optional openaiApiKey", () => {
      const config = {
        pg: { connectionString: "postgresql://localhost/test" },
        neo4j: {
          uri: "bolt://localhost:7687",
          user: "neo4j",
          password: "pass",
        },
        openaiApiKey: "sk-test-key",
      };
      expect(() => RelayConfigSchema.parse(config)).not.toThrow();
    });
  });

  describe("invalid configurations", () => {
    it("should reject missing pg config", () => {
      const config = {
        neo4j: {
          uri: "bolt://localhost:7687",
          user: "neo4j",
          password: "pass",
        },
      };
      expect(() => RelayConfigSchema.parse(config)).toThrow();
    });

    it("should reject missing neo4j config", () => {
      const config = {
        pg: { connectionString: "postgresql://localhost/test" },
      };
      expect(() => RelayConfigSchema.parse(config)).toThrow();
    });

    it("should reject missing connectionString in pg", () => {
      const config = {
        pg: {},
        neo4j: {
          uri: "bolt://localhost:7687",
          user: "neo4j",
          password: "pass",
        },
      };
      expect(() => RelayConfigSchema.parse(config)).toThrow();
    });

    it("should reject missing uri in neo4j", () => {
      const config = {
        pg: { connectionString: "postgresql://localhost/test" },
        neo4j: { user: "neo4j", password: "pass" },
      };
      expect(() => RelayConfigSchema.parse(config)).toThrow();
    });
  });
});
