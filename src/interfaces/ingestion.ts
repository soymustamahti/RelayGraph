import type { IChunkerConfig } from "./chunker";

export interface IIngestionConfig {
  chunker?: Partial<IChunkerConfig>;
  embeddingBatchSize: number;
  parallelExtractions: number;
}

export interface IIngestionResult {
  documentId: string;
  isNewDocument: boolean;
  chunkCount: number;
  entityCount: number;
  relationCount: number;
  processingTimeMs: number;
}

export interface IIngestionProgress {
  stage: "chunking" | "embedding" | "extracting" | "storing";
  message: string;
}

export type IngestionProgressCallback = (progress: IIngestionProgress) => void;

export interface IIngestionPipeline {
  ingest(
    text: string,
    metadata?: { name?: string; source?: string },
    onProgress?: IngestionProgressCallback,
  ): Promise<IIngestionResult>;
}
