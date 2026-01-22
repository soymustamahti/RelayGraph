import { beforeEach, describe, expect, it } from "bun:test";
import { HybridRetriever } from "../../src/modules/retrieval";
import { createMockNeo4jDriver, createMockPostgresDriver } from "../mocks";

describe("HybridRetriever", () => {
  let retriever: HybridRetriever;
  let mockPg: ReturnType<typeof createMockPostgresDriver>;
  let mockNeo4j: ReturnType<typeof createMockNeo4jDriver>;

  beforeEach(() => {
    mockPg = createMockPostgresDriver();
    mockNeo4j = createMockNeo4jDriver();
    retriever = new HybridRetriever(mockPg as any, mockNeo4j as any, {
      apiKey: "test-api-key",
    });
  });

  describe("configuration", () => {
    it("should accept apiKey option", () => {
      const r = new HybridRetriever(mockPg as any, mockNeo4j as any, {
        apiKey: "test-key",
      });
      expect(r).toBeDefined();
    });

    it("should accept custom model configuration", () => {
      const r = new HybridRetriever(mockPg as any, mockNeo4j as any, {
        apiKey: "test-key",
        models: { embeddingModel: "text-embedding-ada-002" },
      });
      expect(r).toBeDefined();
    });

    it("should throw error if no apiKey or client provided", () => {
      expect(() => {
        new HybridRetriever(mockPg as any, mockNeo4j as any, {});
      }).toThrow("Either openaiClient or apiKey must be provided");
    });
  });

  describe("searchEntities", () => {
    it("should search entities in neo4j", async () => {
      const entities = await retriever.searchEntities("mustapha", 10);
      expect(entities).toHaveLength(2);
      expect(entities[0].name).toBe("Mustapha");
    });
  });
});

describe("HybridRetriever Mock Integration", () => {
  it("should search entities by name", async () => {
    const mockNeo4j = createMockNeo4jDriver();
    const entities = await mockNeo4j.searchEntities("mustapha");
    expect(entities).toHaveLength(2);
    expect(entities[0].name).toBe("Mustapha");
  });

  it("should return graph neighbors", async () => {
    const mockNeo4j = createMockNeo4jDriver();
    const neighbors = await mockNeo4j.getNeighbors(["mustapha"]);
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].source.name).toBe("Mustapha");
    expect(neighbors[0].relationship).toBe("BUILDS");
    expect(neighbors[0].target.name).toBe("RelayGraph");
  });
});
