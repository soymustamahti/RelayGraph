import type { Driver } from "neo4j-driver";
import type {
  IEntityNode,
  IEntityWithRelations,
  INeighborResult,
  IRelationship,
  IRelationshipRepository,
} from "../../interfaces";
import { BaseNeo4jRepository } from "./connection";

export class RelationshipRepository
  extends BaseNeo4jRepository
  implements IRelationshipRepository
{
  async upsert(data: IRelationship): Promise<void> {
    const session = this.getSession();
    try {
      const safeRelType = this.sanitizeLabel(data.type);
      const query = `
        MATCH (source:Entity {id: $sourceId})
        MATCH (target:Entity {id: $targetId})
        MERGE (source)-[r:${safeRelType}]->(target)
        ON CREATE SET 
          r.id = $id,
          r.fact = $fact,
          r.attributes = $attributes,
          r.source_chunk_ids = $sourceChunkIds,
          r.created_at = datetime()
        ON MATCH SET
          r.fact = COALESCE($fact, r.fact),
          r.attributes = $attributes,
          r.source_chunk_ids = [x IN r.source_chunk_ids + $sourceChunkIds WHERE x IS NOT NULL | x],
          r.updated_at = datetime()
      `;
      await session.run(query, {
        id: data.id,
        sourceId: data.sourceId,
        targetId: data.targetId,
        fact: data.fact || null,
        attributes: JSON.stringify(data.attributes || {}),
        sourceChunkIds: data.sourceChunkIds || [],
      });
    } finally {
      await session.close();
    }
  }

  async getByEntity(entityId: string): Promise<IRelationship[]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (n:Entity {id: $entityId})-[r]-(m:Entity)
         RETURN n, r, m, 
                CASE WHEN startNode(r) = n THEN 'outgoing' ELSE 'incoming' END as direction`,
        { entityId },
      );

      return result.records.map((record) => {
        const rel = record.get("r");
        const source = record.get("n").properties;
        const target = record.get("m").properties;
        const direction = record.get("direction");

        return {
          id: rel.properties.id || `${source.id}-${rel.type}-${target.id}`,
          sourceId: direction === "outgoing" ? source.id : target.id,
          targetId: direction === "outgoing" ? target.id : source.id,
          type: rel.type,
          fact: rel.properties.fact,
          attributes: rel.properties.attributes
            ? JSON.parse(rel.properties.attributes)
            : {},
          sourceChunkIds: rel.properties.source_chunk_ids || [],
        };
      });
    } finally {
      await session.close();
    }
  }

  async getNeighbors(entityIds: string[]): Promise<INeighborResult[]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (n:Entity)-[r]-(m:Entity)
         WHERE n.id IN $entityIds
         RETURN n, r, m
         LIMIT 100`,
        { entityIds },
      );

      return result.records.map((record) => {
        const source = record.get("n").properties;
        const target = record.get("m").properties;
        const rel = record.get("r");
        return {
          source: {
            id: source.id,
            name: source.name,
            type: source.type,
          },
          relationship: rel.type,
          fact: rel.properties.fact,
          target: {
            id: target.id,
            name: target.name,
            type: target.type,
          },
        };
      });
    } finally {
      await session.close();
    }
  }

  async getEntityWithRelations(
    entityId: string,
  ): Promise<IEntityWithRelations | null> {
    const session = this.getSession();
    try {
      const entityResult = await session.run(
        "MATCH (n:Entity {id: $entityId}) RETURN n",
        { entityId },
      );

      if (entityResult.records.length === 0) return null;

      const entity = this.mapEntityNode(entityResult.records[0].get("n"));

      const relResult = await session.run(
        `MATCH (n:Entity {id: $entityId})-[r]-(m:Entity)
         RETURN r, m, 
                CASE WHEN startNode(r) = n THEN 'outgoing' ELSE 'incoming' END as direction`,
        { entityId },
      );

      const relations = relResult.records.map((record) => ({
        type: record.get("r").type,
        fact: record.get("r").properties.fact,
        direction: record.get("direction") as "outgoing" | "incoming",
        relatedEntity: this.mapEntityNode(record.get("m")),
      }));

      return { entity, relations };
    } finally {
      await session.close();
    }
  }

  async findPaths(
    sourceId: string,
    targetId: string,
    maxHops = 3,
  ): Promise<Array<{ nodes: IEntityNode[]; relationships: string[] }>> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH path = shortestPath((source:Entity {id: $sourceId})-[*1..${maxHops}]-(target:Entity {id: $targetId}))
         RETURN nodes(path) as nodes, relationships(path) as rels
         LIMIT 5`,
        { sourceId, targetId },
      );

      return result.records.map((record) => ({
        nodes: record
          .get("nodes")
          .map((n: { properties: Record<string, unknown> }) =>
            this.mapEntityNode(n),
          ),
        relationships: record.get("rels").map((r: { type: string }) => r.type),
      }));
    } finally {
      await session.close();
    }
  }

  async delete(
    sourceId: string,
    targetId: string,
    type: string,
  ): Promise<void> {
    const session = this.getSession();
    try {
      const safeType = this.sanitizeLabel(type);
      await session.run(
        `MATCH (source:Entity {id: $sourceId})-[r:${safeType}]->(target:Entity {id: $targetId})
         DELETE r`,
        { sourceId, targetId },
      );
    } finally {
      await session.close();
    }
  }

  async batchUpsert(relationships: IRelationship[]): Promise<void> {
    const session = this.getSession();
    try {
      const tx = session.beginTransaction();
      try {
        for (const rel of relationships) {
          const safeType = this.sanitizeLabel(rel.type);
          await tx.run(
            `MATCH (source:Entity {id: $sourceId})
             MATCH (target:Entity {id: $targetId})
             MERGE (source)-[r:${safeType}]->(target)
             ON CREATE SET 
               r.id = $id,
               r.fact = $fact,
               r.attributes = $attributes,
               r.source_chunk_ids = $sourceChunkIds,
               r.created_at = datetime()
             ON MATCH SET
               r.fact = COALESCE($fact, r.fact),
               r.attributes = $attributes,
               r.source_chunk_ids = [x IN r.source_chunk_ids + $sourceChunkIds WHERE x IS NOT NULL | x],
               r.updated_at = datetime()`,
            {
              id: rel.id,
              sourceId: rel.sourceId,
              targetId: rel.targetId,
              fact: rel.fact || null,
              attributes: JSON.stringify(rel.attributes || {}),
              sourceChunkIds: rel.sourceChunkIds || [],
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
}
