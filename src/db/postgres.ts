import pg from "pg";
import type { PostgresConfig } from "../config";

export class PostgresDriver {
  private pool: pg.Pool;

  constructor(config: PostgresConfig) {
    this.pool = new pg.Pool({
      connectionString: config.connectionString,
    });
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
        CREATE TABLE IF NOT EXISTS relay_chunks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          content TEXT NOT NULL,
          embedding VECTOR(1536), 
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS relay_chunks_embedding_idx 
        ON relay_chunks 
        USING hnsw (embedding vector_cosine_ops);
      `);
    } finally {
      client.release();
    }
  }

  async addChunk(
    content: string,
    embedding: number[],
    metadata: object = {},
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        `INSERT INTO relay_chunks (content, embedding, metadata) 
         VALUES ($1, $2, $3) 
         RETURNING id`,
        [content, JSON.stringify(embedding), JSON.stringify(metadata)],
      );
      return res.rows[0].id;
    } finally {
      client.release();
    }
  }

  async findSimilarChunks(
    embedding: number[],
    limit = 5,
  ): Promise<Array<{ id: string; content: string; similarity: number }>> {
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        `SELECT id, content, 1 - (embedding <=> $1) as similarity
         FROM relay_chunks
         ORDER BY embedding <=> $1
         LIMIT $2`,
        [JSON.stringify(embedding), limit],
      );
      return res.rows;
    } finally {
      client.release();
    }
  }

  async deleteChunk(id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("DELETE FROM relay_chunks WHERE id = $1", [id]);
    } finally {
      client.release();
    }
  }
}
