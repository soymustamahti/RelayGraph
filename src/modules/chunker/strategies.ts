import type {
  IChunk,
  IChunkerConfig,
  IChunkingStrategy,
} from "../../interfaces";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function createChunk(
  content: string,
  index: number,
  startPos: number,
  endPos: number,
): IChunk {
  return {
    content,
    index,
    startPos,
    endPos,
    charCount: content.length,
    tokenCount: estimateTokens(content),
  };
}

export class FixedSizeStrategy implements IChunkingStrategy {
  chunk(text: string, config: IChunkerConfig): IChunk[] {
    const chunks: IChunk[] = [];
    const { chunkSize, chunkOverlap } = config;
    const step = chunkSize - chunkOverlap;

    let index = 0;
    for (let start = 0; start < text.length; start += step) {
      const end = Math.min(start + chunkSize, text.length);
      const content = text.slice(start, end);
      chunks.push(createChunk(content, index++, start, end));
      if (end >= text.length) break;
    }

    return chunks;
  }
}

export class TokenBasedStrategy implements IChunkingStrategy {
  private fixedStrategy = new FixedSizeStrategy();

  chunk(text: string, config: IChunkerConfig): IChunk[] {
    const charSize = config.chunkSize * 4;
    const charOverlap = config.chunkOverlap * 4;

    return this.fixedStrategy.chunk(text, {
      ...config,
      chunkSize: charSize,
      chunkOverlap: charOverlap,
    });
  }
}

export class SentenceBasedStrategy implements IChunkingStrategy {
  chunk(text: string, config: IChunkerConfig): IChunk[] {
    const sentenceRegex = /(?<=[.!?])\s+(?=[A-Z])/g;
    const sentences = text.split(sentenceRegex);
    return this.groupIntoChunks(sentences, text, config);
  }

  groupIntoChunks(
    segments: string[],
    originalText: string,
    config: IChunkerConfig,
  ): IChunk[] {
    const chunks: IChunk[] = [];
    let currentChunk = "";
    let searchPos = 0;

    for (const segment of segments) {
      if (currentChunk.length + segment.length + 1 <= config.chunkSize) {
        currentChunk += (currentChunk ? " " : "") + segment;
      } else {
        if (currentChunk.length > 0) {
          const startPos = originalText.indexOf(
            currentChunk.split(" ")[0],
            searchPos,
          );
          chunks.push(
            createChunk(
              currentChunk,
              chunks.length,
              startPos,
              startPos + currentChunk.length,
            ),
          );
          searchPos = startPos + currentChunk.length;
        }
        currentChunk = segment;
      }
    }

    if (currentChunk.length > 0) {
      const startPos = originalText.indexOf(
        currentChunk.split(" ")[0],
        searchPos,
      );
      chunks.push(
        createChunk(
          currentChunk,
          chunks.length,
          startPos,
          startPos + currentChunk.length,
        ),
      );
    }

    return chunks;
  }
}

export class ParagraphBasedStrategy implements IChunkingStrategy {
  private sentenceStrategy = new SentenceBasedStrategy();

  chunk(text: string, config: IChunkerConfig): IChunk[] {
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    return this.sentenceStrategy.groupIntoChunks(paragraphs, text, config);
  }
}

export class RecursiveStrategy implements IChunkingStrategy {
  chunk(text: string, config: IChunkerConfig): IChunk[] {
    return this.chunkRecursive(text, config.separators || [], config, 0);
  }

  private chunkRecursive(
    text: string,
    separators: string[],
    config: IChunkerConfig,
    startPos: number,
  ): IChunk[] {
    const { chunkSize, chunkOverlap } = config;

    if (text.length <= chunkSize) {
      return [createChunk(text, 0, startPos, startPos + text.length)];
    }

    let separator = separators[separators.length - 1] || "";
    let newSeparators = separators;

    for (let i = 0; i < separators.length; i++) {
      const sep = separators[i];
      if (sep === "") {
        separator = sep;
        break;
      }
      if (text.includes(sep)) {
        separator = sep;
        newSeparators = separators.slice(i + 1);
        break;
      }
    }

    const splits = separator
      ? text.split(separator).filter((s) => s.length > 0)
      : text.split("");

    const chunks: IChunk[] = [];
    let currentChunk = "";
    let currentStart = startPos;

    for (const split of splits) {
      const piece = currentChunk ? separator + split : split;

      if (currentChunk.length + piece.length <= chunkSize) {
        currentChunk += piece;
      } else {
        if (currentChunk.length > 0) {
          if (currentChunk.length > chunkSize && newSeparators.length > 0) {
            const subChunks = this.chunkRecursive(
              currentChunk,
              newSeparators,
              config,
              currentStart,
            );
            chunks.push(...subChunks);
          } else {
            chunks.push(
              createChunk(
                currentChunk,
                chunks.length,
                currentStart,
                currentStart + currentChunk.length,
              ),
            );
          }
        }

        if (chunkOverlap > 0 && currentChunk.length > chunkOverlap) {
          const overlapText = currentChunk.slice(-chunkOverlap);
          currentChunk = overlapText + separator + split;
          currentStart =
            startPos + text.indexOf(overlapText, currentStart - startPos);
        } else {
          currentChunk = split;
          currentStart =
            startPos + text.indexOf(split, currentStart - startPos);
        }
      }
    }

    if (currentChunk.length > 0) {
      if (currentChunk.length > chunkSize && newSeparators.length > 0) {
        const subChunks = this.chunkRecursive(
          currentChunk,
          newSeparators,
          config,
          currentStart,
        );
        chunks.push(...subChunks);
      } else {
        chunks.push(
          createChunk(
            currentChunk,
            chunks.length,
            currentStart,
            currentStart + currentChunk.length,
          ),
        );
      }
    }

    return chunks;
  }
}
