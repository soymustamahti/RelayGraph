import { beforeEach, describe, expect, it } from "bun:test";
import {
  CrossEncoderReranker,
  HybridRetriever,
  MMRReranker,
  NoOpReranker,
  RRFReranker,
  createReranker,
} from "../../src/modules/retrieval";
import {
  createMockNeo4jDriver,
  createMockOpenAI,
  createMockPostgresDriver,
} from "../mocks";

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

    it("should accept default search methods", () => {
      const r = new HybridRetriever(mockPg as any, mockNeo4j as any, {
        apiKey: "test-key",
        defaultSearchMethods: ["bm25", "semantic"],
      });
      expect(r).toBeDefined();
    });

    it("should accept default reranker type", () => {
      const r = new HybridRetriever(mockPg as any, mockNeo4j as any, {
        apiKey: "test-key",
        defaultReranker: "cross-encoder",
      });
      expect(r).toBeDefined();
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

  it("should perform BFS search", async () => {
    const mockNeo4j = createMockNeo4jDriver();
    const results = await mockNeo4j.bfsSearch(["mustapha"], 2, 10);
    expect(results).toHaveLength(2);
    expect(results[0].entity.name).toBe("RelayGraph");
    expect(results[0].depth).toBe(1);
    expect(results[1].depth).toBe(2);
  });

  it("should perform fulltext search on entities", async () => {
    const mockNeo4j = createMockNeo4jDriver();
    const results = await mockNeo4j.fulltextSearchEntities("mustapha");
    expect(results).toHaveLength(1);
    expect(results[0].entity.name).toBe("Mustapha");
    expect(results[0].score).toBe(0.9);
  });

  it("should search entities with scores", async () => {
    const mockNeo4j = createMockNeo4jDriver();
    const results = await mockNeo4j.searchEntitiesWithScore("developer");
    expect(results).toHaveLength(2);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("should perform BM25 search on chunks", async () => {
    const mockPg = createMockPostgresDriver();
    const results = await mockPg.searchBM25("mustapha");
    expect(results).toHaveLength(2);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("should perform hybrid search on chunks", async () => {
    const mockPg = createMockPostgresDriver();
    const results = await mockPg.hybridSearch("mustapha", [0.1], {});
    expect(results).toHaveLength(1);
    expect(results[0].semanticScore).toBe(0.95);
    expect(results[0].bm25Score).toBe(0.8);
    expect(results[0].combinedScore).toBe(0.9);
  });
});

describe("Rerankers", () => {
  describe("RRFReranker", () => {
    it("should combine results using reciprocal rank fusion", async () => {
      const reranker = new RRFReranker(60);
      const results = [
        {
          item: { id: "a", content: "item a" },
          score: 0.9,
          source: "semantic" as const,
        },
        {
          item: { id: "b", content: "item b" },
          score: 0.8,
          source: "semantic" as const,
        },
        {
          item: { id: "a", content: "item a" },
          score: 0.7,
          source: "bm25" as const,
        },
        {
          item: { id: "c", content: "item c" },
          score: 0.6,
          source: "bm25" as const,
        },
      ];

      const ranked = await reranker.rerank("query", results);

      expect(ranked).toHaveLength(3);
      expect(ranked[0].item.id).toBe("a");
      expect(ranked[0].sources).toContain("semantic");
      expect(ranked[0].sources).toContain("bm25");
    });

    it("should give higher score to items appearing in multiple sources", async () => {
      const reranker = new RRFReranker(60);
      const results = [
        {
          item: { id: "a", content: "item a" },
          score: 0.5,
          source: "semantic" as const,
        },
        {
          item: { id: "b", content: "item b" },
          score: 0.9,
          source: "semantic" as const,
        },
        {
          item: { id: "a", content: "item a" },
          score: 0.5,
          source: "bm25" as const,
        },
      ];

      const ranked = await reranker.rerank("query", results);

      expect(ranked[0].item.id).toBe("a");
    });
  });

  describe("NoOpReranker", () => {
    it("should deduplicate and sort by max score", async () => {
      const reranker = new NoOpReranker();
      const results = [
        {
          item: { id: "a", content: "item a" },
          score: 0.7,
          source: "semantic" as const,
        },
        {
          item: { id: "a", content: "item a" },
          score: 0.9,
          source: "bm25" as const,
        },
        {
          item: { id: "b", content: "item b" },
          score: 0.8,
          source: "semantic" as const,
        },
      ];

      const ranked = await reranker.rerank("query", results);

      expect(ranked).toHaveLength(2);
      expect(ranked[0].item.id).toBe("a");
      expect(ranked[0].score).toBe(0.9);
    });
  });

  describe("createReranker", () => {
    it("should create RRF reranker", () => {
      const reranker = createReranker("rrf");
      expect(reranker).toBeInstanceOf(RRFReranker);
    });

    it("should create NoOp reranker for none", () => {
      const reranker = createReranker("none");
      expect(reranker).toBeInstanceOf(NoOpReranker);
    });

    it("should throw if cross-encoder without openai client", () => {
      expect(() => createReranker("cross-encoder")).toThrow(
        "OpenAI client required for cross-encoder",
      );
    });

    it("should throw if mmr without openai client", () => {
      expect(() => createReranker("mmr")).toThrow(
        "OpenAI client required for MMR",
      );
    });

    it("should create cross-encoder with openai client", () => {
      const mockOpenAI = createMockOpenAI();
      const reranker = createReranker("cross-encoder", mockOpenAI as any);
      expect(reranker).toBeInstanceOf(CrossEncoderReranker);
    });

    it("should create MMR reranker with openai client", () => {
      const mockOpenAI = createMockOpenAI();
      const reranker = createReranker("mmr", mockOpenAI as any);
      expect(reranker).toBeInstanceOf(MMRReranker);
    });
  });
});
