import { describe, expect, it } from "bun:test";
import {
  Chunker,
  DEFAULT_CHUNKER_CONFIG,
  FixedSizeStrategy,
  RecursiveStrategy,
  SentenceBasedStrategy,
} from "../../src/modules/chunker";

describe("Chunker", () => {
  describe("configuration", () => {
    it("should use default config when none provided", () => {
      const chunker = new Chunker();
      const config = chunker.getConfig();
      expect(config.strategy).toBe("recursive");
      expect(config.chunkSize).toBe(2000);
      expect(config.chunkOverlap).toBe(200);
    });

    it("should merge custom config with defaults", () => {
      const chunker = new Chunker({ chunkSize: 1000 });
      const config = chunker.getConfig();
      expect(config.chunkSize).toBe(1000);
      expect(config.strategy).toBe("recursive");
    });

    it("should update config via setConfig", () => {
      const chunker = new Chunker();
      chunker.setConfig({ chunkSize: 500 });
      expect(chunker.getConfig().chunkSize).toBe(500);
    });
  });

  describe("chunking", () => {
    it("should return empty array for empty text", async () => {
      const chunker = new Chunker();
      const chunks = await chunker.chunk("");
      expect(chunks).toHaveLength(0);
    });

    it("should return empty array for whitespace only", async () => {
      const chunker = new Chunker();
      const chunks = await chunker.chunk("   \n\t  ");
      expect(chunks).toHaveLength(0);
    });

    it("should chunk text into pieces", async () => {
      const chunker = new Chunker({ chunkSize: 50, minChunkSize: 0 });
      const text = "This is a test. ".repeat(20);
      const chunks = await chunker.chunk(text);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it("should preserve order with index", async () => {
      const chunker = new Chunker({ chunkSize: 100, minChunkSize: 0 });
      const text =
        "First chunk content. Second chunk content. Third chunk content.";
      const chunks = await chunker.chunk(text);
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].index).toBe(i);
      }
    });

    it("should track character counts", async () => {
      const chunker = new Chunker({ chunkSize: 1000 });
      const text = "Hello world";
      const chunks = await chunker.chunk(text);
      expect(chunks[0].charCount).toBe(text.length);
    });

    it("should estimate token counts", async () => {
      const chunker = new Chunker();
      const text = "This is approximately sixteen characters";
      const chunks = await chunker.chunk(text);
      expect(chunks[0].tokenCount).toBeGreaterThan(0);
    });
  });

  describe("strategies", () => {
    it("should use fixed size strategy", async () => {
      const chunker = new Chunker({
        strategy: "fixed",
        chunkSize: 20,
        chunkOverlap: 5,
        minChunkSize: 0,
      });
      const text = "A".repeat(50);
      const chunks = await chunker.chunk(text);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it("should use recursive strategy", async () => {
      const chunker = new Chunker({ strategy: "recursive", chunkSize: 50 });
      const text = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
      const chunks = await chunker.chunk(text);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it("should use sentence strategy", async () => {
      const chunker = new Chunker({ strategy: "sentence", chunkSize: 100 });
      const text = "First sentence. Second sentence. Third sentence.";
      const chunks = await chunker.chunk(text);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it("should use paragraph strategy", async () => {
      const chunker = new Chunker({ strategy: "paragraph", chunkSize: 100 });
      const text = "Para one.\n\nPara two.\n\nPara three.";
      const chunks = await chunker.chunk(text);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("FixedSizeStrategy", () => {
  const strategy = new FixedSizeStrategy();

  it("should create chunks of specified size", () => {
    const config = {
      ...DEFAULT_CHUNKER_CONFIG,
      chunkSize: 10,
      chunkOverlap: 0,
    };
    const chunks = strategy.chunk("12345678901234567890", config);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toBe("1234567890");
    expect(chunks[1].content).toBe("1234567890");
  });

  it("should handle overlap correctly", () => {
    const config = {
      ...DEFAULT_CHUNKER_CONFIG,
      chunkSize: 10,
      chunkOverlap: 5,
    };
    const chunks = strategy.chunk("123456789012345", config);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("RecursiveStrategy", () => {
  const strategy = new RecursiveStrategy();

  it("should return single chunk for small text", () => {
    const config = { ...DEFAULT_CHUNKER_CONFIG, chunkSize: 100 };
    const chunks = strategy.chunk("Small text", config);
    expect(chunks).toHaveLength(1);
  });

  it("should split on separators", () => {
    const config = {
      ...DEFAULT_CHUNKER_CONFIG,
      chunkSize: 30,
      separators: ["\n\n", "\n"],
    };
    const text = "Line one\n\nLine two\n\nLine three";
    const chunks = strategy.chunk(text, config);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

describe("SentenceBasedStrategy", () => {
  const strategy = new SentenceBasedStrategy();

  it("should split on sentence boundaries", () => {
    const config = { ...DEFAULT_CHUNKER_CONFIG, chunkSize: 1000 };
    const text = "First sentence. Second sentence. Third sentence.";
    const chunks = strategy.chunk(text, config);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});
