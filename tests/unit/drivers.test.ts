import { beforeEach, describe, expect, it } from "bun:test";
import { createMockNeo4jDriver, createMockPostgresDriver } from "../mocks";

describe("PostgresDriver", () => {
  let mockPg: ReturnType<typeof createMockPostgresDriver>;

  beforeEach(() => {
    mockPg = createMockPostgresDriver();
  });

  describe("connection", () => {
    it("should connect without error", async () => {
      await expect(mockPg.connect()).resolves.toBeUndefined();
    });

    it("should disconnect without error", async () => {
      await expect(mockPg.disconnect()).resolves.toBeUndefined();
    });

    it("should initialize without error", async () => {
      await expect(mockPg.init()).resolves.toBeUndefined();
    });
  });

  describe("document operations", () => {
    it("should upsert document and return id", async () => {
      const result = await mockPg.upsertDocument("Test", "content", {});
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("isNew");
    });

    it("should get document by id", async () => {
      const doc = await mockPg.getDocument("doc-123");
      expect(doc).toBeDefined();
      expect(doc?.name).toBe("Test Document");
    });

    it("should delete document", async () => {
      const result = await mockPg.deleteDocument("doc-123");
      expect(result).toBe(true);
    });
  });

  describe("chunk operations", () => {
    it("should add chunks and return ids", async () => {
      const chunkIds = await mockPg.addChunks("doc-123", [
        { content: "test", embedding: [], chunkIndex: 0 },
      ]);
      expect(chunkIds).toHaveLength(2);
    });

    it("should search chunks with similarity scores", async () => {
      const chunks = await mockPg.searchChunks([], 5, 0.5);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toHaveProperty("similarity");
    });
  });

  describe("stats", () => {
    it("should return document and chunk counts", async () => {
      const stats = await mockPg.getStats();
      expect(stats.documentCount).toBe(5);
      expect(stats.chunkCount).toBe(25);
    });
  });
});

describe("Neo4jDriver", () => {
  let mockNeo4j: ReturnType<typeof createMockNeo4jDriver>;

  beforeEach(() => {
    mockNeo4j = createMockNeo4jDriver();
  });

  describe("connection", () => {
    it("should verify connectivity", async () => {
      await expect(mockNeo4j.verifyConnectivity()).resolves.toBeUndefined();
    });

    it("should close without error", async () => {
      await expect(mockNeo4j.close()).resolves.toBeUndefined();
    });

    it("should initialize without error", async () => {
      await expect(mockNeo4j.init()).resolves.toBeUndefined();
    });
  });

  describe("entity operations", () => {
    it("should upsert entity", async () => {
      await expect(
        mockNeo4j.upsertEntity({
          id: "test",
          name: "Test",
          type: "Person",
        }),
      ).resolves.toBeUndefined();
    });

    it("should get entity by id", async () => {
      const entity = await mockNeo4j.getEntity("mustapha");
      expect(entity).toBeDefined();
      expect(entity?.name).toBe("Mustapha");
    });

    it("should search entities", async () => {
      const entities = await mockNeo4j.searchEntities("mustapha", 10);
      expect(entities).toHaveLength(2);
    });

    it("should delete entity", async () => {
      await expect(mockNeo4j.deleteEntity("test")).resolves.toBeUndefined();
    });
  });

  describe("relationship operations", () => {
    it("should upsert relationship", async () => {
      await expect(
        mockNeo4j.upsertRelationship({
          id: "test",
          sourceId: "a",
          targetId: "b",
          type: "RELATED_TO",
        }),
      ).resolves.toBeUndefined();
    });

    it("should get neighbors", async () => {
      const neighbors = await mockNeo4j.getNeighbors(["mustapha"]);
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].source.name).toBe("Mustapha");
      expect(neighbors[0].relationship).toBe("BUILDS");
    });
  });

  describe("stats", () => {
    it("should return graph statistics", async () => {
      const stats = await mockNeo4j.getStats();
      expect(stats.entityCount).toBe(10);
      expect(stats.relationshipCount).toBe(15);
      expect(stats.entityTypes).toHaveProperty("Person");
    });
  });
});
