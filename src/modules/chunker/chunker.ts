import type OpenAI from "openai";
import type {
  ChunkingStrategyType,
  IChunk,
  IChunker,
  IChunkerConfig,
} from "../../interfaces";
import { SemanticStrategy } from "./semantic-strategy";
import {
  FixedSizeStrategy,
  ParagraphBasedStrategy,
  RecursiveStrategy,
  SentenceBasedStrategy,
  TokenBasedStrategy,
  estimateTokens,
} from "./strategies";

export const DEFAULT_CHUNKER_CONFIG: IChunkerConfig = {
  strategy: "recursive",
  chunkSize: 2000,
  chunkOverlap: 200,
  separators: ["\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " ", ""],
  minChunkSize: 100,
  trimWhitespace: true,
};

export class Chunker implements IChunker {
  private config: IChunkerConfig;
  private strategies: Map<
    ChunkingStrategyType,
    {
      chunk: (
        text: string,
        config: IChunkerConfig,
      ) => IChunk[] | Promise<IChunk[]>;
    }
  >;
  private semanticStrategy?: SemanticStrategy;

  constructor(config: Partial<IChunkerConfig> = {}, openai?: OpenAI) {
    this.config = { ...DEFAULT_CHUNKER_CONFIG, ...config };

    this.strategies = new Map([
      ["fixed", new FixedSizeStrategy()],
      ["token", new TokenBasedStrategy()],
      ["sentence", new SentenceBasedStrategy()],
      ["paragraph", new ParagraphBasedStrategy()],
      ["recursive", new RecursiveStrategy()],
    ]);

    if (openai) {
      this.semanticStrategy = new SemanticStrategy(openai);
      this.strategies.set("semantic", this.semanticStrategy);
    }
  }

  async chunk(text: string): Promise<IChunk[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const strategy = this.strategies.get(this.config.strategy);
    if (!strategy) {
      const fallback = this.strategies.get("recursive")!;
      return this.postProcess(await fallback.chunk(text, this.config));
    }

    const chunks = await strategy.chunk(text, this.config);
    return this.postProcess(chunks);
  }

  private postProcess(chunks: IChunk[]): IChunk[] {
    let result = chunks;

    if (this.config.minChunkSize && this.config.minChunkSize > 0) {
      result = this.mergeSmallChunks(result);
    }

    if (this.config.trimWhitespace) {
      result = result.map((chunk) => ({
        ...chunk,
        content: chunk.content.trim(),
        charCount: chunk.content.trim().length,
        tokenCount: estimateTokens(chunk.content.trim()),
      }));
    }

    result = result.filter((chunk) => chunk.content.length > 0);

    return result.map((chunk, index) => ({ ...chunk, index }));
  }

  private mergeSmallChunks(chunks: IChunk[]): IChunk[] {
    if (chunks.length <= 1) return chunks;

    const minSize = this.config.minChunkSize || 0;
    const merged: IChunk[] = [];
    let current: IChunk | null = null;

    for (const chunk of chunks) {
      if (!current) {
        current = { ...chunk };
        continue;
      }

      if (current.charCount < minSize || chunk.charCount < minSize) {
        current.content += ` ${chunk.content}`;
        current.endPos = chunk.endPos;
        current.charCount = current.content.length;
        current.tokenCount = estimateTokens(current.content);
      } else {
        merged.push(current);
        current = { ...chunk };
      }
    }

    if (current) {
      merged.push(current);
    }

    return merged;
  }

  getConfig(): IChunkerConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<IChunkerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
