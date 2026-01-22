import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  AskRequestSchema,
  ErrorSchema,
  IngestRequestSchema,
} from "../../src/schemas/api";
import {
  EntitySchema,
  ExtractionResultSchema,
  RelationshipSchema,
} from "../../src/schemas/extraction";

describe("Extraction Schemas", () => {
  describe("EntitySchema", () => {
    it("should accept valid entity", () => {
      const entity = {
        name: "Mustapha",
        type: "Person",
        description: "A developer",
      };
      expect(() => EntitySchema.parse(entity)).not.toThrow();
    });

    it("should require name field", () => {
      const entity = { type: "Person", description: "A developer" };
      expect(() => EntitySchema.parse(entity)).toThrow();
    });

    it("should require type field", () => {
      const entity = { name: "Mustapha", description: "A developer" };
      expect(() => EntitySchema.parse(entity)).toThrow();
    });
  });

  describe("RelationshipSchema", () => {
    it("should accept valid relationship", () => {
      const rel = {
        source: "Mustapha",
        target: "RelayGraph",
        relation: "BUILDS",
      };
      expect(() => RelationshipSchema.parse(rel)).not.toThrow();
    });

    it("should require all fields", () => {
      expect(() =>
        RelationshipSchema.parse({ source: "A", target: "B" }),
      ).toThrow();
      expect(() =>
        RelationshipSchema.parse({ source: "A", relation: "R" }),
      ).toThrow();
      expect(() =>
        RelationshipSchema.parse({ target: "B", relation: "R" }),
      ).toThrow();
    });
  });

  describe("ExtractionResultSchema", () => {
    it("should accept valid extraction result", () => {
      const result = {
        entities: [{ name: "Test", type: "Person", description: "Desc" }],
        relationships: [{ source: "A", target: "B", relation: "RELATED" }],
      };
      expect(() => ExtractionResultSchema.parse(result)).not.toThrow();
    });

    it("should accept empty arrays", () => {
      const result = { entities: [], relationships: [] };
      expect(() => ExtractionResultSchema.parse(result)).not.toThrow();
    });
  });
});

describe("API Schemas", () => {
  describe("IngestRequestSchema", () => {
    it("should accept valid ingest request", () => {
      const request = { text: "Some content to ingest" };
      expect(() => IngestRequestSchema.parse(request)).not.toThrow();
    });

    it("should accept request with metadata", () => {
      const request = { text: "Content", metadata: { source: "test" } };
      expect(() => IngestRequestSchema.parse(request)).not.toThrow();
    });

    it("should reject empty text", () => {
      const request = { text: "" };
      expect(() => IngestRequestSchema.parse(request)).toThrow();
    });
  });

  describe("AskRequestSchema", () => {
    it("should accept valid ask request", () => {
      const request = { query: "Who is Mustapha?" };
      expect(() => AskRequestSchema.parse(request)).not.toThrow();
    });

    it("should reject empty query", () => {
      const request = { query: "" };
      expect(() => AskRequestSchema.parse(request)).toThrow();
    });
  });

  describe("ErrorSchema", () => {
    it("should accept valid error response", () => {
      const error = { success: false, error: "Something went wrong" };
      expect(() => ErrorSchema.parse(error)).not.toThrow();
    });

    it("should reject success: true", () => {
      const error = { success: true, error: "Error message" };
      expect(() => ErrorSchema.parse(error)).toThrow();
    });
  });
});
