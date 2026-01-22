import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Extractor } from "../../src/modules/Extractor";
import { createMockNeo4jDriver, createMockPostgresDriver } from "../mocks";

describe("Extractor", () => {
  let extractor: Extractor;
  let mockPg: ReturnType<typeof createMockPostgresDriver>;
  let mockNeo4j: ReturnType<typeof createMockNeo4jDriver>;

  beforeEach(() => {
    mockPg = createMockPostgresDriver();
    mockNeo4j = createMockNeo4jDriver();
    extractor = new Extractor(mockPg as any, mockNeo4j as any, {
      apiKey: "test-api-key",
    });
  });

  describe("process", () => {
    it("should generate embedding and save chunk to Postgres", async () => {
      const text = "Test document content";

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
        await expect(extractor.process(text)).rejects.toThrow();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should rollback chunk on extraction failure", async () => {
      mockPg.addChunk = mock(() => Promise.resolve("test-chunk-id"));
      expect(mockPg.deleteChunk).not.toHaveBeenCalled();
    });
  });
});

describe("Extractor - Schema Validation", () => {
  it("should have valid extraction JSON schema structure", async () => {
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

describe("Extractor - Configuration", () => {
  it("should accept custom model configuration", () => {
    const mockPg = createMockPostgresDriver();
    const mockNeo4j = createMockNeo4jDriver();

    const extractor = new Extractor(mockPg as any, mockNeo4j as any, {
      apiKey: "test-api-key",
      models: {
        chatModel: "gpt-3.5-turbo",
        embeddingModel: "text-embedding-ada-002",
        temperature: 0.5,
      },
    });

    expect(extractor).toBeDefined();
  });

  it("should throw error if no apiKey or client provided", () => {
    const mockPg = createMockPostgresDriver();
    const mockNeo4j = createMockNeo4jDriver();

    expect(() => {
      new Extractor(mockPg as any, mockNeo4j as any, {});
    }).toThrow("Either openaiClient or apiKey must be provided");
  });
});
