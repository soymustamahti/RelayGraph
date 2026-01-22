import { beforeEach, describe, expect, it } from "bun:test";
import { createMockNeo4jDriver, createMockPostgresDriver } from "../mocks";

describe("PostgresDriver Mock", () => {
  let mockPg: ReturnType<typeof createMockPostgresDriver>;

  beforeEach(() => {
    mockPg = createMockPostgresDriver();
  });

  describe("connect", () => {
    it("should resolve without error", async () => {
      await expect(mockPg.connect()).resolves.toBeUndefined();
    });
  });

  describe("disconnect", () => {
    it("should resolve without error", async () => {
      await expect(mockPg.disconnect()).resolves.toBeUndefined();
    });
  });

  describe("init", () => {
    it("should resolve without error", async () => {
      await expect(mockPg.init()).resolves.toBeUndefined();
    });
  });

  describe("addChunk", () => {
    it("should return a chunk ID", async () => {
      const chunkId = await mockPg.addChunk("test content", [], {});
      expect(chunkId).toBe("test-chunk-id-123");
    });
  });

  describe("findSimilarChunks", () => {
    it("should return similar chunks with similarity scores", async () => {
      const chunks = await mockPg.findSimilarChunks([], 5);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toHaveProperty("id");
      expect(chunks[0]).toHaveProperty("content");
      expect(chunks[0]).toHaveProperty("similarity");
    });
  });

  describe("deleteChunk", () => {
    it("should resolve without error", async () => {
      await expect(mockPg.deleteChunk("chunk-id")).resolves.toBeUndefined();
    });
  });
});

describe("Neo4jDriver Mock", () => {
  let mockNeo4j: ReturnType<typeof createMockNeo4jDriver>;

  beforeEach(() => {
    mockNeo4j = createMockNeo4jDriver();
  });

  describe("verifyConnectivity", () => {
    it("should resolve without error", async () => {
      await expect(mockNeo4j.verifyConnectivity()).resolves.toBeUndefined();
    });
  });

  describe("close", () => {
    it("should resolve without error", async () => {
      await expect(mockNeo4j.close()).resolves.toBeUndefined();
    });
  });

  describe("mergeNode", () => {
    it("should resolve without error", async () => {
      await expect(
        mockNeo4j.mergeNode("Person", "john", "John", "chunk-1", {}),
      ).resolves.toBeUndefined();
    });
  });

  describe("createRelationship", () => {
    it("should resolve without error", async () => {
      await expect(
        mockNeo4j.createRelationship(
          "a-id",
          "Entity",
          "b-id",
          "Entity",
          "RELATED",
          "chunk-1",
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe("findEntitiesByChunks", () => {
    it("should return entities linked to chunks", async () => {
      const entities = await mockNeo4j.findEntitiesByChunks(["chunk-1"]);
      expect(entities).toHaveLength(2);
      expect(entities[0]).toHaveProperty("id");
      expect(entities[0]).toHaveProperty("name");
      expect(entities[0]).toHaveProperty("source_chunk_id");
    });
  });

  describe("getNeighbors", () => {
    it("should return graph triples", async () => {
      const triples = await mockNeo4j.getNeighbors(["entity-1"]);
      expect(triples).toHaveLength(1);
      expect(triples[0]).toHaveProperty("source");
      expect(triples[0]).toHaveProperty("relationship");
      expect(triples[0]).toHaveProperty("target");
    });
  });
});
