import { describe, expect, it } from "bun:test";
import type {
  IChunk,
  IEntityNode,
  IIngestionResult,
  IRelationship,
  IRetrievalResult,
} from "../../src/interfaces";

describe("Interface Types", () => {
  describe("IEntityNode", () => {
    it("should match expected structure", () => {
      const entity: IEntityNode = {
        id: "test-id",
        name: "Test Entity",
        type: "Person",
        description: "A test entity",
        attributes: { key: "value" },
        sourceChunkIds: ["chunk-1"],
      };
      expect(entity.id).toBe("test-id");
      expect(entity.name).toBe("Test Entity");
      expect(entity.type).toBe("Person");
    });

    it("should allow optional fields", () => {
      const entity: IEntityNode = {
        id: "test-id",
        name: "Test Entity",
        type: "Person",
      };
      expect(entity.description).toBeUndefined();
      expect(entity.attributes).toBeUndefined();
    });
  });

  describe("IRelationship", () => {
    it("should match expected structure", () => {
      const rel: IRelationship = {
        id: "rel-1",
        sourceId: "entity-a",
        targetId: "entity-b",
        type: "KNOWS",
        fact: "A knows B",
      };
      expect(rel.sourceId).toBe("entity-a");
      expect(rel.targetId).toBe("entity-b");
    });
  });

  describe("IChunk", () => {
    it("should match expected structure", () => {
      const chunk: IChunk = {
        content: "Test content",
        index: 0,
        startPos: 0,
        endPos: 12,
        tokenCount: 3,
        charCount: 12,
      };
      expect(chunk.content).toBe("Test content");
      expect(chunk.charCount).toBe(12);
    });
  });

  describe("IRetrievalResult", () => {
    it("should contain chunks, entities, and graph", () => {
      const result: IRetrievalResult = {
        chunks: [{ id: "c1", content: "test", similarity: 0.9 }],
        entities: [{ id: "e1", name: "Entity" }],
        knowledgeGraph: [
          {
            source: { id: "a", name: "A", type: "Person" },
            relationship: "KNOWS",
            target: { id: "b", name: "B", type: "Person" },
          },
        ],
      };
      expect(result.chunks).toHaveLength(1);
      expect(result.entities).toHaveLength(1);
      expect(result.knowledgeGraph).toHaveLength(1);
    });
  });

  describe("IIngestionResult", () => {
    it("should contain ingestion metrics", () => {
      const result: IIngestionResult = {
        documentId: "doc-1",
        isNewDocument: true,
        chunkCount: 5,
        entityCount: 10,
        relationCount: 15,
        processingTimeMs: 1234,
      };
      expect(result.isNewDocument).toBe(true);
      expect(result.processingTimeMs).toBe(1234);
    });
  });
});
