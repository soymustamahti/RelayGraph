export type ChunkingStrategyType =
  | "fixed"
  | "token"
  | "sentence"
  | "paragraph"
  | "recursive"
  | "semantic";

export interface IChunk {
  id?: string;
  content: string;
  index: number;
  startPos: number;
  endPos: number;
  tokenCount: number;
  charCount: number;
}

export interface IChunkerConfig {
  strategy: ChunkingStrategyType;
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
  minChunkSize?: number;
  trimWhitespace?: boolean;
  semanticThreshold?: number;
}

export interface IChunkingStrategy {
  chunk(text: string, config: IChunkerConfig): IChunk[] | Promise<IChunk[]>;
}

export interface IChunker {
  chunk(text: string): Promise<IChunk[]>;
  getConfig(): IChunkerConfig;
  setConfig(config: Partial<IChunkerConfig>): void;
}
