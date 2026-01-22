import type { Neo4jConfig } from "../../config";
import type {
  IEntityNode,
  IEntityWithRelations,
  IGraphStats,
  INeighborResult,
  IRelationship,
} from "../../interfaces";
import { Neo4jConnection } from "./connection";
import { EntityRepository } from "./entity-repository";
import { RelationshipRepository } from "./relationship-repository";

export class Neo4jDriver {
  private connection: Neo4jConnection;
  private entities: EntityRepository;
  private relationships: RelationshipRepository;

  constructor(config: Neo4jConfig) {
    this.connection = new Neo4jConnection(config);
    const driver = this.connection.getDriver();
    this.entities = new EntityRepository(driver);
    this.relationships = new RelationshipRepository(driver);
  }

  async close(): Promise<void> {
    await this.connection.close();
  }

  async verifyConnectivity(): Promise<void> {
    await this.connection.verifyConnectivity();
  }

  async init(): Promise<void> {
    await this.connection.init();
  }

  async getStats(): Promise<IGraphStats> {
    return this.connection.getStats();
  }

  async runQuery(
    query: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown[]> {
    return this.connection.runQuery(query, params);
  }

  async upsertEntity(data: IEntityNode): Promise<void> {
    return this.entities.upsert(data);
  }

  async getEntity(id: string): Promise<IEntityNode | null> {
    return this.entities.getById(id);
  }

  async getEntityByName(name: string): Promise<IEntityNode | null> {
    return this.entities.getByName(name);
  }

  async getEntitiesByType(type: string): Promise<IEntityNode[]> {
    return this.entities.getByType(type);
  }

  async searchEntities(query: string, limit = 10): Promise<IEntityNode[]> {
    return this.entities.search(query, limit);
  }

  async getEntitiesByChunks(chunkIds: string[]): Promise<IEntityNode[]> {
    return this.entities.getByChunks(chunkIds);
  }

  async deleteEntity(id: string): Promise<void> {
    return this.entities.delete(id);
  }

  async batchUpsertEntities(entities: IEntityNode[]): Promise<void> {
    return this.entities.batchUpsert(entities);
  }

  async mergeEntitiesInGraph(
    sourceIds: string[],
    targetId: string,
  ): Promise<void> {
    return this.entities.merge(sourceIds, targetId);
  }

  async upsertRelationship(data: IRelationship): Promise<void> {
    return this.relationships.upsert(data);
  }

  async getEntityRelationships(entityId: string): Promise<IRelationship[]> {
    return this.relationships.getByEntity(entityId);
  }

  async getNeighbors(entityIds: string[]): Promise<INeighborResult[]> {
    return this.relationships.getNeighbors(entityIds);
  }

  async getEntityWithRelations(
    entityId: string,
  ): Promise<IEntityWithRelations | null> {
    return this.relationships.getEntityWithRelations(entityId);
  }

  async findPaths(
    sourceId: string,
    targetId: string,
    maxHops = 3,
  ): Promise<Array<{ nodes: IEntityNode[]; relationships: string[] }>> {
    return this.relationships.findPaths(sourceId, targetId, maxHops);
  }

  async deleteRelationship(
    sourceId: string,
    targetId: string,
    type: string,
  ): Promise<void> {
    return this.relationships.delete(sourceId, targetId, type);
  }

  async batchUpsertRelationships(
    relationships: IRelationship[],
  ): Promise<void> {
    return this.relationships.batchUpsert(relationships);
  }
}
