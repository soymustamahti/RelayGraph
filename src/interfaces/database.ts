export interface IEntityNode {
  id: string;
  name: string;
  type: string;
  description?: string;
  attributes?: Record<string, unknown>;
  sourceChunkIds?: string[];
}

export interface IRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  fact?: string;
  attributes?: Record<string, unknown>;
  sourceChunkIds?: string[];
}

export interface IEntityWithRelations {
  entity: IEntityNode;
  relations: Array<{
    type: string;
    fact?: string;
    direction: "outgoing" | "incoming";
    relatedEntity: IEntityNode;
  }>;
}

export interface INeighborResult {
  source: { id: string; name: string; type: string };
  relationship: string;
  fact?: string;
  target: { id: string; name: string; type: string };
}

export interface IGraphStats {
  entityCount: number;
  relationshipCount: number;
  entityTypes: Record<string, number>;
  relationshipTypes: Record<string, number>;
}

export interface IDocumentRecord {
  id: string;
  name: string;
  contentHash: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface IChunkRecord {
  id: string;
  documentId: string;
  content: string;
  embedding: number[];
  chunkIndex: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface IChunkSearchResult extends IChunkRecord {
  similarity: number;
}

export interface IDocumentStats {
  documentCount: number;
  chunkCount: number;
}

export interface IEntityRepository {
  upsert(data: IEntityNode): Promise<void>;
  getById(id: string): Promise<IEntityNode | null>;
  getByName(name: string): Promise<IEntityNode | null>;
  getByType(type: string): Promise<IEntityNode[]>;
  search(query: string, limit?: number): Promise<IEntityNode[]>;
  getByChunks(chunkIds: string[]): Promise<IEntityNode[]>;
  delete(id: string): Promise<void>;
  batchUpsert(entities: IEntityNode[]): Promise<void>;
}

export interface IRelationshipRepository {
  upsert(data: IRelationship): Promise<void>;
  getByEntity(entityId: string): Promise<IRelationship[]>;
  getNeighbors(entityIds: string[]): Promise<INeighborResult[]>;
  getEntityWithRelations(
    entityId: string,
  ): Promise<IEntityWithRelations | null>;
  findPaths(
    sourceId: string,
    targetId: string,
    maxHops?: number,
  ): Promise<
    Array<{
      nodes: IEntityNode[];
      relationships: string[];
    }>
  >;
  delete(sourceId: string, targetId: string, type: string): Promise<void>;
  batchUpsert(relationships: IRelationship[]): Promise<void>;
}

export interface IGraphDriver {
  init(): Promise<void>;
  close(): Promise<void>;
  verifyConnectivity(): Promise<void>;
  getStats(): Promise<IGraphStats>;
  runQuery(query: string, params?: Record<string, unknown>): Promise<unknown[]>;
}

export interface IDocumentRepository {
  upsert(
    name: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ id: string; isNew: boolean }>;
  getById(id: string): Promise<IDocumentRecord | null>;
  delete(id: string): Promise<boolean>;
}

export interface IChunkRepository {
  add(
    documentId: string,
    chunks: Array<{
      content: string;
      embedding: number[];
      chunkIndex: number;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<string[]>;
  search(
    embedding: number[],
    limit?: number,
    threshold?: number,
  ): Promise<IChunkSearchResult[]>;
  getByDocument(documentId: string): Promise<IChunkRecord[]>;
}

export interface IVectorDatabase {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  init(): Promise<void>;
  getStats(): Promise<IDocumentStats>;
}
