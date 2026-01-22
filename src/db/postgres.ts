import crypto from "node:crypto";
import pg from "pg";
import type { PostgresConfig } from "../config";
import type {
  IChunkRecord,
  IChunkRepository,
  IChunkSearchResult,
  IDocumentRecord,
  IDocumentRepository,
  IDocumentStats,
  IVectorDatabase,
} from "../interfaces";

export class PostgresDriver
  implements IDocumentRepository, IChunkRepository, IVectorDatabase
{
  private pool: pg.Pool;
  private embeddingDimensions: number;

  constructor(config: PostgresConfig & { embeddingDimensions?: number }) {
    this.pool = new pg.Pool({
      connectionString: config.connectionString,
    });
    this.embeddingDimensions = config.embeddingDimensions || 1536;
  }

  async connect(): Promise<void> {
    const client = await this.pool.connect();
    client.release();
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");

      await client.query(`
        CREATE TABLE IF NOT EXISTS relay_documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(1024) NOT NULL,
          content_hash VARCHAR(64) NOT NULL UNIQUE,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS relay_documents_hash_idx 
        ON relay_documents(content_hash);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS relay_chunks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          document_id UUID REFERENCES relay_documents(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          embedding VECTOR(${this.embeddingDimensions}),
          chunk_index INTEGER NOT NULL DEFAULT 0,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS relay_chunks_embedding_idx 
        ON relay_chunks 
        USING hnsw (embedding vector_cosine_ops);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS relay_chunks_document_idx 
        ON relay_chunks(document_id);
      `);
    } finally {
      client.release();
    }
  }

  private hashContent(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  async upsert(
    name: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<{ id: string; isNew: boolean }> {
    const contentHash = this.hashContent(content);

    const existing = await this.pool.query(
      "SELECT id FROM relay_documents WHERE content_hash = $1",
      [contentHash],
    );

    if (existing.rows.length > 0) {
      return { id: existing.rows[0].id, isNew: false };
    }

    const result = await this.pool.query(
      `INSERT INTO relay_documents (name, content_hash, metadata) 
       VALUES ($1, $2, $3) 
       RETURNING id`,
      [name, contentHash, metadata],
    );

    return { id: result.rows[0].id, isNew: true };
  }

  async upsertDocument(
    name: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<{ id: string; isNew: boolean }> {
    return this.upsert(name, content, metadata);
  }

  async getById(id: string): Promise<IDocumentRecord | null> {
    const result = await this.pool.query(
      "SELECT * FROM relay_documents WHERE id = $1",
      [id],
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      contentHash: row.content_hash,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }

  async getDocument(id: string): Promise<IDocumentRecord | null> {
    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM relay_documents WHERE id = $1",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteDocument(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async add(
    documentId: string,
    chunks: Array<{
      content: string;
      embedding: number[];
      chunkIndex: number;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<string[]> {
    if (chunks.length === 0) return [];

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const chunkIds: string[] = [];
      for (const chunk of chunks) {
        const result = await client.query(
          `INSERT INTO relay_chunks (document_id, content, embedding, chunk_index, metadata)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            documentId,
            chunk.content,
            `[${chunk.embedding.join(",")}]`,
            chunk.chunkIndex,
            chunk.metadata || {},
          ],
        );
        chunkIds.push(result.rows[0].id);
      }

      await client.query("COMMIT");
      return chunkIds;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addChunks(
    documentId: string,
    chunks: Array<{
      content: string;
      embedding: number[];
      chunkIndex: number;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<string[]> {
    return this.add(documentId, chunks);
  }

  async search(
    embedding: number[],
    limit = 5,
    threshold = 0.7,
  ): Promise<IChunkSearchResult[]> {
    const result = await this.pool.query(
      `SELECT *, 1 - (embedding <=> $1::vector) as similarity
       FROM relay_chunks
       WHERE 1 - (embedding <=> $1::vector) >= $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [`[${embedding.join(",")}]`, threshold, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      embedding: row.embedding,
      chunkIndex: row.chunk_index,
      metadata: row.metadata,
      createdAt: row.created_at,
      similarity: Number.parseFloat(row.similarity),
    }));
  }

  async searchChunks(
    embedding: number[],
    limit = 5,
    threshold = 0.7,
  ): Promise<IChunkSearchResult[]> {
    return this.search(embedding, limit, threshold);
  }

  async getByDocument(documentId: string): Promise<IChunkRecord[]> {
    const result = await this.pool.query(
      "SELECT * FROM relay_chunks WHERE document_id = $1 ORDER BY chunk_index",
      [documentId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      embedding: row.embedding,
      chunkIndex: row.chunk_index,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  }

  async getChunksByDocument(documentId: string): Promise<IChunkRecord[]> {
    return this.getByDocument(documentId);
  }

  async getStats(): Promise<IDocumentStats> {
    const docs = await this.pool.query("SELECT COUNT(*) FROM relay_documents");
    const chunks = await this.pool.query("SELECT COUNT(*) FROM relay_chunks");

    return {
      documentCount: Number.parseInt(docs.rows[0].count),
      chunkCount: Number.parseInt(chunks.rows[0].count),
    };
  }
}

export type { IDocumentRecord as DocumentRecord, IChunkRecord as ChunkRecord };
