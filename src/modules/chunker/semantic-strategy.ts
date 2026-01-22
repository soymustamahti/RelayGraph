import type OpenAI from "openai";
import type {
  IChunk,
  IChunkerConfig,
  IChunkingStrategy,
} from "../../interfaces";
import { RecursiveStrategy, createChunk, estimateTokens } from "./strategies";

export class SemanticStrategy implements IChunkingStrategy {
  private openai: OpenAI;
  private fallback = new RecursiveStrategy();

  constructor(openai: OpenAI) {
    this.openai = openai;
  }

  async chunk(text: string, config: IChunkerConfig): Promise<IChunk[]> {
    const threshold = config.semanticThreshold || 0.5;

    const sentenceRegex = /(?<=[.!?])\s+/g;
    const sentences = text
      .split(sentenceRegex)
      .filter((s) => s.trim().length > 0);

    if (sentences.length <= 1) {
      return this.fallback.chunk(text, config);
    }

    const response = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input: sentences,
      encoding_format: "float",
    });

    const embeddings = response.data.map((d) => d.embedding);

    const breakpoints: number[] = [0];
    for (let i = 1; i < embeddings.length; i++) {
      const similarity = this.cosineSimilarity(
        embeddings[i - 1],
        embeddings[i],
      );
      if (similarity < threshold) {
        breakpoints.push(i);
      }
    }
    breakpoints.push(sentences.length);

    const chunks: IChunk[] = [];
    let currentPos = 0;

    for (let i = 0; i < breakpoints.length - 1; i++) {
      const start = breakpoints[i];
      const end = breakpoints[i + 1];
      const chunkSentences = sentences.slice(start, end);
      const content = chunkSentences.join(" ");

      const startPos = text.indexOf(chunkSentences[0], currentPos);
      const endPos = startPos + content.length;

      chunks.push(createChunk(content, i, startPos, endPos));
      currentPos = endPos;
    }

    const finalChunks: IChunk[] = [];
    for (const chunk of chunks) {
      if (chunk.charCount > config.chunkSize) {
        const subChunks = this.fallback.chunk(chunk.content, config);
        finalChunks.push(
          ...subChunks.map((sc) => ({
            ...sc,
            startPos: chunk.startPos + sc.startPos,
            endPos: chunk.startPos + sc.endPos,
          })),
        );
      } else {
        finalChunks.push(chunk);
      }
    }

    return finalChunks;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
