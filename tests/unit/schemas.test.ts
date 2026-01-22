import { describe, expect, it } from "bun:test";
import {
  EXTRACTION_JSON_SCHEMA,
  ExtractionResultSchema,
} from "../../src/schemas/extraction";

describe("Extraction Schema", () => {
  describe("EXTRACTION_JSON_SCHEMA", () => {
    it("should have correct name", () => {
      expect(EXTRACTION_JSON_SCHEMA.name).toBe("extraction_result");
    });

    it("should be strict mode", () => {
      expect(EXTRACTION_JSON_SCHEMA.strict).toBe(true);
    });

    it("should define entities array", () => {
      expect(EXTRACTION_JSON_SCHEMA.schema.properties).toHaveProperty(
        "entities",
      );
      expect(EXTRACTION_JSON_SCHEMA.schema.properties.entities.type).toBe(
        "array",
      );
    });

    it("should define relationships array", () => {
      expect(EXTRACTION_JSON_SCHEMA.schema.properties).toHaveProperty(
        "relationships",
      );
      expect(EXTRACTION_JSON_SCHEMA.schema.properties.relationships.type).toBe(
        "array",
      );
    });

    it("should require name, type, description for entities", () => {
      const entityItems =
        EXTRACTION_JSON_SCHEMA.schema.properties.entities.items;
      expect(entityItems.required).toContain("name");
      expect(entityItems.required).toContain("type");
      expect(entityItems.required).toContain("description");
    });

    it("should require source, target, relation, fact for relationships", () => {
      const relItems =
        EXTRACTION_JSON_SCHEMA.schema.properties.relationships.items;
      expect(relItems.required).toContain("source");
      expect(relItems.required).toContain("target");
      expect(relItems.required).toContain("relation");
      expect(relItems.required).toContain("fact");
    });
  });

  describe("ExtractionResultSchema (Zod)", () => {
    it("should validate valid extraction result", () => {
      const result = ExtractionResultSchema.parse({
        entities: [
          { name: "Test", type: "Person", description: "A test entity" },
        ],
        relationships: [
          { source: "A", target: "B", relation: "KNOWS", fact: "A knows B" },
        ],
      });
      expect(result.entities).toHaveLength(1);
      expect(result.relationships).toHaveLength(1);
    });

    it("should validate empty arrays", () => {
      const result = ExtractionResultSchema.parse({
        entities: [],
        relationships: [],
      });
      expect(result.entities).toHaveLength(0);
    });

    it("should reject invalid entity", () => {
      expect(() =>
        ExtractionResultSchema.parse({
          entities: [{ name: "Test" }],
          relationships: [],
        }),
      ).toThrow();
    });
  });
});
