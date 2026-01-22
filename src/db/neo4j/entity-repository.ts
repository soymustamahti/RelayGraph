import neo4j from "neo4j-driver";
import type { Driver } from "neo4j-driver";
import type { IEntityNode, IEntityRepository } from "../../interfaces";
import { BaseNeo4jRepository } from "./connection";

export class EntityRepository
  extends BaseNeo4jRepository
  implements IEntityRepository
{
  async upsert(data: IEntityNode): Promise<void> {
    const session = this.getSession();
    try {
      const safeType = this.sanitizeLabel(data.type);
      const query = `
        MERGE (n:Entity:${safeType} {id: $id})
        ON CREATE SET 
          n.name = $name,
          n.type = $type,
          n.description = $description,
          n.attributes = $attributes,
          n.source_chunk_ids = $sourceChunkIds,
          n.created_at = datetime()
        ON MATCH SET
          n.name = $name,
          n.type = $type,
          n.description = COALESCE($description, n.description),
          n.attributes = $attributes,
          n.source_chunk_ids = [x IN n.source_chunk_ids + $sourceChunkIds WHERE x IS NOT NULL | x],
          n.updated_at = datetime()
      `;
      await session.run(query, {
        id: data.id,
        name: data.name,
        type: data.type,
        description: data.description || null,
        attributes: JSON.stringify(data.attributes || {}),
        sourceChunkIds: data.sourceChunkIds || [],
      });
    } finally {
      await session.close();
    }
  }

  async getById(id: string): Promise<IEntityNode | null> {
    const session = this.getSession();
    try {
      const result = await session.run("MATCH (n:Entity {id: $id}) RETURN n", {
        id,
      });
      if (result.records.length === 0) return null;
      return this.mapEntityNode(result.records[0].get("n"));
    } finally {
      await session.close();
    }
  }

  async getByName(name: string): Promise<IEntityNode | null> {
    const session = this.getSession();
    try {
      const result = await session.run(
        "MATCH (n:Entity) WHERE toLower(n.name) = toLower($name) RETURN n LIMIT 1",
        { name },
      );
      if (result.records.length === 0) return null;
      return this.mapEntityNode(result.records[0].get("n"));
    } finally {
      await session.close();
    }
  }

  async getByType(type: string): Promise<IEntityNode[]> {
    const session = this.getSession();
    try {
      const safeType = this.sanitizeLabel(type);
      const result = await session.run(`MATCH (n:Entity:${safeType}) RETURN n`);
      return result.records.map((r) => this.mapEntityNode(r.get("n")));
    } finally {
      await session.close();
    }
  }

  async search(query: string, limit = 10): Promise<IEntityNode[]> {
    const session = this.getSession();
    try {
      const words = query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3);

      if (words.length === 0) {
        return [];
      }

      const conditions = words
        .map(
          (_, i) =>
            `toLower(n.name) CONTAINS $word${i} OR toLower(n.description) CONTAINS $word${i}`,
        )
        .join(" OR ");

      const params: Record<string, unknown> = { limit: neo4j.int(limit) };
      words.forEach((w, i) => {
        params[`word${i}`] = w;
      });

      const result = await session.run(
        `MATCH (n:Entity)
         WHERE ${conditions}
         RETURN n
         LIMIT $limit`,
        params,
      );
      return result.records.map((r) => this.mapEntityNode(r.get("n")));
    } finally {
      await session.close();
    }
  }

  async getByChunks(chunkIds: string[]): Promise<IEntityNode[]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (n:Entity)
         WHERE ANY(id IN $chunkIds WHERE id IN n.source_chunk_ids)
         RETURN n`,
        { chunkIds },
      );
      return result.records.map((r) => this.mapEntityNode(r.get("n")));
    } finally {
      await session.close();
    }
  }

  async delete(id: string): Promise<void> {
    const session = this.getSession();
    try {
      await session.run("MATCH (n:Entity {id: $id}) DETACH DELETE n", { id });
    } finally {
      await session.close();
    }
  }

  async batchUpsert(entities: IEntityNode[]): Promise<void> {
    const session = this.getSession();
    try {
      const tx = session.beginTransaction();
      try {
        for (const entity of entities) {
          const safeType = this.sanitizeLabel(entity.type);
          await tx.run(
            `MERGE (n:Entity:${safeType} {id: $id})
             ON CREATE SET 
               n.name = $name,
               n.type = $type,
               n.description = $description,
               n.attributes = $attributes,
               n.source_chunk_ids = $sourceChunkIds,
               n.created_at = datetime()
             ON MATCH SET
               n.name = $name,
               n.type = $type,
               n.description = COALESCE($description, n.description),
               n.attributes = $attributes,
               n.source_chunk_ids = [x IN n.source_chunk_ids + $sourceChunkIds WHERE x IS NOT NULL | x],
               n.updated_at = datetime()`,
            {
              id: entity.id,
              name: entity.name,
              type: entity.type,
              description: entity.description || null,
              attributes: JSON.stringify(entity.attributes || {}),
              sourceChunkIds: entity.sourceChunkIds || [],
            },
          );
        }
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    } finally {
      await session.close();
    }
  }

  async merge(sourceIds: string[], targetId: string): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(
        `MATCH (source:Entity)-[r]->(n:Entity)
         WHERE n.id IN $sourceIds AND source.id <> $targetId
         MATCH (target:Entity {id: $targetId})
         MERGE (source)-[newR:RELATES_TO]->(target)
         SET newR = properties(r)
         DELETE r`,
        { sourceIds, targetId },
      );

      await session.run(
        `MATCH (n:Entity)-[r]->(dest:Entity)
         WHERE n.id IN $sourceIds AND dest.id <> $targetId
         MATCH (target:Entity {id: $targetId})
         MERGE (target)-[newR:RELATES_TO]->(dest)
         SET newR = properties(r)
         DELETE r`,
        { sourceIds, targetId },
      );

      await session.run(
        `MATCH (source:Entity)
         WHERE source.id IN $sourceIds
         WITH collect(source.source_chunk_ids) as allChunks
         MATCH (target:Entity {id: $targetId})
         SET target.source_chunk_ids = 
           [x IN reduce(acc = [], chunks IN allChunks | acc + chunks) + target.source_chunk_ids 
            WHERE x IS NOT NULL | x]`,
        { sourceIds, targetId },
      );

      await session.run(
        `MATCH (n:Entity)
         WHERE n.id IN $sourceIds AND n.id <> $targetId
         DETACH DELETE n`,
        { sourceIds, targetId },
      );
    } finally {
      await session.close();
    }
  }

  async bfsSearch(
    startEntityIds: string[],
    maxDepth = 2,
    limit = 50,
  ): Promise<
    Array<{
      entity: IEntityNode;
      depth: number;
      path: string[];
    }>
  > {
    const session = this.getSession();
    try {
      const result = await session.run(
        `UNWIND $startIds AS startId
         MATCH path = (start:Entity {id: startId})-[*1..${maxDepth}]-(n:Entity)
         WHERE n.id <> startId
         WITH n, min(length(path)) as depth, 
              [rel in relationships(path) | type(rel)] as relTypes
         RETURN DISTINCT n, depth, relTypes
         ORDER BY depth ASC
         LIMIT $limit`,
        { startIds: startEntityIds, limit: neo4j.int(limit) },
      );

      return result.records.map((record) => ({
        entity: this.mapEntityNode(record.get("n")),
        depth: record.get("depth").toNumber
          ? record.get("depth").toNumber()
          : record.get("depth"),
        path: record.get("relTypes"),
      }));
    } finally {
      await session.close();
    }
  }

  async fulltextSearch(
    query: string,
    limit = 10,
  ): Promise<Array<{ entity: IEntityNode; score: number }>> {
    const session = this.getSession();
    try {
      await session.run(`
        CREATE FULLTEXT INDEX entity_fulltext IF NOT EXISTS
        FOR (n:Entity)
        ON EACH [n.name, n.description]
      `);

      const sanitizedQuery = query
        .replace(/[^a-zA-Z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2)
        .map((w) => `${w}~`)
        .join(" OR ");

      if (!sanitizedQuery) {
        return [];
      }

      const result = await session.run(
        `CALL db.index.fulltext.queryNodes('entity_fulltext', $query)
         YIELD node, score
         RETURN node, score
         ORDER BY score DESC
         LIMIT $limit`,
        { query: sanitizedQuery, limit: neo4j.int(limit) },
      );

      return result.records.map((record) => ({
        entity: this.mapEntityNode(record.get("node")),
        score: this.toNumber(record.get("score")),
      }));
    } finally {
      await session.close();
    }
  }

  async searchWithScore(
    query: string,
    limit = 10,
  ): Promise<Array<{ entity: IEntityNode; score: number }>> {
    const session = this.getSession();
    try {
      const words = query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3);

      if (words.length === 0) {
        return [];
      }

      const conditions = words
        .map(
          (_, i) =>
            `(CASE WHEN toLower(n.name) CONTAINS $word${i} THEN 2 ELSE 0 END + 
              CASE WHEN toLower(n.description) CONTAINS $word${i} THEN 1 ELSE 0 END)`,
        )
        .join(" + ");

      const params: Record<string, unknown> = { limit: neo4j.int(limit) };
      words.forEach((w, i) => {
        params[`word${i}`] = w;
      });

      const result = await session.run(
        `MATCH (n:Entity)
         WITH n, ${conditions} AS score
         WHERE score > 0
         RETURN n, score
         ORDER BY score DESC
         LIMIT $limit`,
        params,
      );

      return result.records.map((record) => ({
        entity: this.mapEntityNode(record.get("n")),
        score: this.toNumber(record.get("score")),
      }));
    } finally {
      await session.close();
    }
  }
}
