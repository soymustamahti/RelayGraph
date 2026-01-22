export interface IRetrievalChunk {
  id: string;
  content: string;
  similarity: number;
}

export interface IRetrievalEntity {
  id: string;
  name: string;
  type?: string;
  description?: string;
}

export interface IKnowledgeGraphTriple {
  source: { id: string; name: string; type: string };
  relationship: string;
  fact?: string;
  target: { id: string; name: string; type: string };
}

export interface IRetrievalResult {
  chunks: IRetrievalChunk[];
  entities: IRetrievalEntity[];
  knowledgeGraph: IKnowledgeGraphTriple[];
}

export interface IRetrievalOptions {
  maxChunks?: number;
  maxEntities?: number;
  chunkThreshold?: number;
}

export interface IRetriever {
  retrieve(
    query: string,
    options?: IRetrievalOptions,
  ): Promise<IRetrievalResult>;
}
