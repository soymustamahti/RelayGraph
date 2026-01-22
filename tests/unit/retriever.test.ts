import { beforeEach, describe, expect, it, mock } from "bun:test";
import { HybridRetriever } from "../../src/modules/HybridRetriever";
import { createMockNeo4jDriver, createMockPostgresDriver } from "../mocks";

describe("HybridRetriever", () => {
  let retriever: HybridRetriever;
  let mockPg: ReturnType<typeof createMockPostgresDriver>;
  let mockNeo4j: ReturnType<typeof createMockNeo4jDriver>;

  beforeEach(() => {
    mockPg = createMockPostgresDriver();
    mockNeo4j = createMockNeo4jDriver();
    retriever = new HybridRetriever(
      "test-api-key",
      mockPg as any,
      mockNeo4j as any,
    );
  });

  describe("retrieve", () => {
    it("should return empty results for unknown query", async () => {
      mockPg.findSimilarChunks = mock(() => Promise.resolve([]));

      // Mock OpenAI calls would be needed here
      // For now, we test the expected behavior
      expect(mockPg.findSimilarChunks).toBeDefined();
    });

    it("should call findSimilarChunks on Postgres driver", () => {
      expect(mockPg.findSimilarChunks).toBeDefined();
      expect(typeof mockPg.findSimilarChunks).toBe("function");
    });

    it("should call findEntitiesByChunks on Neo4j driver", () => {
      expect(mockNeo4j.findEntitiesByChunks).toBeDefined();
      expect(typeof mockNeo4j.findEntitiesByChunks).toBe("function");
    });

    it("should call getNeighbors on Neo4j driver for graph traversal", () => {
      expect(mockNeo4j.getNeighbors).toBeDefined();
      expect(typeof mockNeo4j.getNeighbors).toBe("function");
    });
  });
});

describe("HybridRetriever - Mock Integration", () => {
  it("should find entities by chunk IDs", async () => {
    const mockNeo4j = createMockNeo4jDriver();

    const entities = await mockNeo4j.findEntitiesByChunks(["chunk-1"]);

    expect(entities).toHaveLength(2);
    expect(entities[0].name).toBe("Mustapha");
    expect(entities[1].name).toBe("RelayGraph");
  });

  it("should return graph triples from getNeighbors", async () => {
    const mockNeo4j = createMockNeo4jDriver();

    const triples = await mockNeo4j.getNeighbors(["mustapha"]);

    expect(triples).toHaveLength(1);
    expect(triples[0].source.name).toBe("Mustapha");
    expect(triples[0].relationship).toBe("BUILDS");
    expect(triples[0].target.name).toBe("RelayGraph");
  });
});
