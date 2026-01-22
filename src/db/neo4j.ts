import neo4j, { type Driver, type Session } from "neo4j-driver";
import type { Neo4jConfig } from "../config";

export class Neo4jDriver {
  private driver: Driver;

  constructor(config: Neo4jConfig) {
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.user, config.password),
    );
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  async verifyConnectivity(): Promise<void> {
    await this.driver.verifyConnectivity();
  }

  async mergeNode(
    label: string,
    id: string,
    name: string,
    sourceChunkId: string,
    properties: Record<string, any> = {},
  ): Promise<void> {
    const session = this.driver.session();
    try {
      const query = `
        MERGE (n:${label} {id: $id})
        SET n.name = $name,
            n.source_chunk_id = $sourceChunkId,
            n += $properties,
            n:Entity
      `;

      await session.run(query, { id, name, sourceChunkId, properties });
    } finally {
      await session.close();
    }
  }

  async createRelationship(
    fromId: string,
    fromLabel: string,
    toId: string,
    toLabel: string,
    relationType: string,
    sourceChunkId: string,
  ): Promise<void> {
    const session = this.driver.session();
    try {
      const safeRelType = relationType.replace(/[^a-zA-Z0-9_]/g, "");

      const query = `
        MATCH (a:${fromLabel} {id: $fromId})
        MATCH (b:${toLabel} {id: $toId})
        MERGE (a)-[r:${safeRelType}]->(b)
        SET r.source_chunk_id = $sourceChunkId
      `;

      await session.run(query, { fromId, toId, sourceChunkId });
    } finally {
      await session.close();
    }
  }

  async findEntitiesByChunks(chunkIds: string[]): Promise<any[]> {
    const session = this.driver.session();
    try {
      const query = `
        MATCH (n:Entity)
        WHERE n.source_chunk_id IN $chunkIds
        RETURN n
      `;
      const result = await session.run(query, { chunkIds });
      return result.records.map((record) => record.get("n").properties);
    } finally {
      await session.close();
    }
  }

  async getNeighbors(entityIds: string[]): Promise<any[]> {
    const session = this.driver.session();
    try {
      const query = `
        MATCH (n:Entity)-[r]-(m:Entity)
        WHERE n.id IN $entityIds
        RETURN n, r, m
        LIMIT 100
      `;
      const result = await session.run(query, { entityIds });

      return result.records.map((record) => {
        const source = record.get("n").properties;
        const target = record.get("m").properties;
        const rel = record.get("r");
        return {
          source: {
            id: source.id,
            name: source.name,
            labels: record.get("n").labels,
          },
          relationship: rel.type,
          target: {
            id: target.id,
            name: target.name,
            labels: record.get("m").labels,
          },
        };
      });
    } finally {
      await session.close();
    }
  }
}
