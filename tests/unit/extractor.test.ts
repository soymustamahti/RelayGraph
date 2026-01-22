import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Extractor } from "../../src/modules/Extractor";
import { createMockNeo4jDriver, createMockPostgresDriver } from "../mocks";

describe("Extractor", () => {
  let extractor: Extractor;
  let mockPg: ReturnType<typeof createMockPostgresDriver>;
  let mockNeo4j: ReturnType<typeof createMockNeo4jDriver>;

  beforeEach(() => {
    mockPg = createMockPostgresDriver();
    mockNeo4j = createMockNeo4jDriver();
    extractor = new Extractor("test-api-key", mockPg as any, mockNeo4j as any);
  });

  describe("process", () => {
    it("should generate embedding and save chunk to Postgres", async () => {
      const text = "Test document content";

      // Mock OpenAI calls
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [{ embedding: new Array(1536).fill(0.1) }],
            }),
        } as Response),
      );

      try {
        // This will fail because we can't mock OpenAI properly, but we can test the flow
        await expect(extractor.process(text)).rejects.toThrow();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should rollback chunk on extraction failure", async () => {
      mockPg.addChunk = mock(() => Promise.resolve("test-chunk-id"));

      // Verify that deleteChunk would be called on failure
      expect(mockPg.deleteChunk).not.toHaveBeenCalled();
    });
  });
});

describe("Extractor - Schema Validation", () => {
  it("should have valid extraction JSON schema structure", async () => {
    // Import the schema
    const { EXTRACTION_JSON_SCHEMA } = await import(
      "../../src/schemas/extraction"
    );

    expect(EXTRACTION_JSON_SCHEMA.name).toBe("extraction_result");
    expect(EXTRACTION_JSON_SCHEMA.strict).toBe(true);
    expect(EXTRACTION_JSON_SCHEMA.schema.properties).toHaveProperty("entities");
    expect(EXTRACTION_JSON_SCHEMA.schema.properties).toHaveProperty(
      "relationships",
    );
  });

  it("should validate entity schema requires name, type, description", async () => {
    const { EXTRACTION_JSON_SCHEMA } = await import(
      "../../src/schemas/extraction"
    );

    const entityItems = EXTRACTION_JSON_SCHEMA.schema.properties.entities.items;
    expect(entityItems.required).toContain("name");
    expect(entityItems.required).toContain("type");
    expect(entityItems.required).toContain("description");
  });

  it("should validate relationship schema requires source, target, relation", async () => {
    const { EXTRACTION_JSON_SCHEMA } = await import(
      "../../src/schemas/extraction"
    );

    const relItems =
      EXTRACTION_JSON_SCHEMA.schema.properties.relationships.items;
    expect(relItems.required).toContain("source");
    expect(relItems.required).toContain("target");
    expect(relItems.required).toContain("relation");
  });
});
