export interface IRetrievalChunk {
  id: string;
  content: string;
  similarity: number;
  bm25Score?: number;
  combinedScore?: number;
  rerankScore?: number;
}

export interface IRetrievalEntity {
  id: string;
  name: string;
  type?: string;
  description?: string;
  score?: number;
}

export interface IKnowledgeGraphTriple {
  source: { id: string; name: string; type: string };
  relationship: string;
  fact?: string;
  target: { id: string; name: string; type: string };
  score?: number;
}

export interface IRetrievalResult {
  chunks: IRetrievalChunk[];
  entities: IRetrievalEntity[];
  knowledgeGraph: IKnowledgeGraphTriple[];
}

export type SearchMethod = "bm25" | "semantic" | "graph";
export type RerankerType = "rrf" | "cross-encoder" | "mmr" | "none";

export interface IRetrievalOptions {
  maxChunks?: number;
  maxEntities?: number;
  maxGraphTriples?: number;
  chunkThreshold?: number;
  searchMethods?: SearchMethod[];
  reranker?: RerankerType;
  bfsDepth?: number;
  rrfK?: number;
  crossEncoderThreshold?: number;
}

export interface ISearchResult<T> {
  item: T;
  score: number;
  source: SearchMethod;
}

export interface IRankedResult<T> {
  item: T;
  score: number;
  sources: SearchMethod[];
}

export interface IReranker {
  rerank<T extends { content?: string; name?: string; description?: string }>(
    query: string,
    results: Array<ISearchResult<T>>,
  ): Promise<Array<IRankedResult<T>>>;
}

export interface IRetriever {
  retrieve(
    query: string,
    options?: IRetrievalOptions,
  ): Promise<IRetrievalResult>;
}
