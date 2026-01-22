import neo4j, { type Driver, type Session } from "neo4j-driver";
import type { Neo4jConfig } from "../../config";
import type {
  IEntityNode,
  IGraphDriver,
  IGraphStats,
  IRelationship,
} from "../../interfaces";

export abstract class BaseNeo4jRepository {
  protected driver: Driver;

  constructor(driver: Driver) {
    this.driver = driver;
  }

  protected getSession(): Session {
    return this.driver.session();
  }

  protected sanitizeLabel(label: string): string {
    return label.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  protected mapEntityNode(node: {
    properties: Record<string, unknown>;
  }): IEntityNode {
    const props = node.properties;
    return {
      id: props.id as string,
      name: props.name as string,
      type: props.type as string,
      description: props.description as string | undefined,
      attributes: props.attributes
        ? JSON.parse(props.attributes as string)
        : {},
      sourceChunkIds: (props.source_chunk_ids as string[]) || [],
    };
  }
}

export class Neo4jConnection implements IGraphDriver {
  private driver: Driver;

  constructor(config: Neo4jConfig) {
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.user, config.password),
    );
  }

  getDriver(): Driver {
    return this.driver;
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  async verifyConnectivity(): Promise<void> {
    await this.driver.verifyConnectivity();
  }

  async init(): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(`
        CREATE CONSTRAINT entity_id_unique IF NOT EXISTS
        FOR (e:Entity) REQUIRE e.id IS UNIQUE
      `);
      await session.run(`
        CREATE INDEX entity_name_idx IF NOT EXISTS
        FOR (e:Entity) ON (e.name)
      `);
      await session.run(`
        CREATE INDEX entity_type_idx IF NOT EXISTS
        FOR (e:Entity) ON (e.type)
      `);
      try {
        await session.run(`
          CREATE FULLTEXT INDEX entity_fulltext_idx IF NOT EXISTS
          FOR (e:Entity) ON EACH [e.name, e.description]
        `);
      } catch {
        console.log("Fulltext index already exists or not supported");
      }
    } finally {
      await session.close();
    }
  }

  async getStats(): Promise<IGraphStats> {
    const session = this.driver.session();
    try {
      const entityCountResult = await session.run(
        "MATCH (n:Entity) RETURN count(n) as count",
      );
      const relCountResult = await session.run(
        "MATCH ()-[r]->() RETURN count(r) as count",
      );
      const entityTypesResult = await session.run(
        "MATCH (n:Entity) RETURN n.type as type, count(*) as count",
      );
      const relTypesResult = await session.run(
        "MATCH ()-[r]->() RETURN type(r) as type, count(*) as count",
      );

      const entityTypes: Record<string, number> = {};
      entityTypesResult.records.forEach((r) => {
        entityTypes[r.get("type")] = r.get("count").toNumber();
      });

      const relationshipTypes: Record<string, number> = {};
      relTypesResult.records.forEach((r) => {
        relationshipTypes[r.get("type")] = r.get("count").toNumber();
      });

      return {
        entityCount: entityCountResult.records[0].get("count").toNumber(),
        relationshipCount: relCountResult.records[0].get("count").toNumber(),
        entityTypes,
        relationshipTypes,
      };
    } finally {
      await session.close();
    }
  }

  async runQuery(
    query: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(query, params);
      return result.records;
    } finally {
      await session.close();
    }
  }
}
