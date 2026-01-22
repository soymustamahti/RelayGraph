import { mock } from "bun:test";
import type {
  IChunkSearchResult,
  IDocumentRecord,
  IDocumentStats,
  IEntityNode,
  IGraphStats,
  INeighborResult,
} from "../../src/interfaces";

export function createMockPostgresDriver() {
  return {
    connect: mock(() => Promise.resolve()),
    disconnect: mock(() => Promise.resolve()),
    init: mock(() => Promise.resolve()),
    upsert: mock(() => Promise.resolve({ id: "doc-123", isNew: true })),
    upsertDocument: mock(() => Promise.resolve({ id: "doc-123", isNew: true })),
    getById: mock(() =>
      Promise.resolve<IDocumentRecord>({
        id: "doc-123",
        name: "Test Document",
        contentHash: "abc123",
        metadata: {},
        createdAt: new Date(),
      }),
    ),
    getDocument: mock(() =>
      Promise.resolve<IDocumentRecord>({
        id: "doc-123",
        name: "Test Document",
        contentHash: "abc123",
        metadata: {},
        createdAt: new Date(),
      }),
    ),
    delete: mock(() => Promise.resolve(true)),
    deleteDocument: mock(() => Promise.resolve(true)),
    add: mock(() => Promise.resolve(["chunk-1", "chunk-2"])),
    addChunks: mock(() => Promise.resolve(["chunk-1", "chunk-2"])),
    search: mock(() =>
      Promise.resolve<IChunkSearchResult[]>([
        {
          id: "chunk-1",
          documentId: "doc-123",
          content: "Sample content about Mustapha",
          embedding: [],
          chunkIndex: 0,
          metadata: {},
          createdAt: new Date(),
          similarity: 0.95,
        },
        {
          id: "chunk-2",
          documentId: "doc-123",
          content: "RelayGraph is a knowledge graph",
          embedding: [],
          chunkIndex: 1,
          metadata: {},
          createdAt: new Date(),
          similarity: 0.85,
        },
      ]),
    ),
    searchChunks: mock(() =>
      Promise.resolve<IChunkSearchResult[]>([
        {
          id: "chunk-1",
          documentId: "doc-123",
          content: "Sample content about Mustapha",
          embedding: [],
          chunkIndex: 0,
          metadata: {},
          createdAt: new Date(),
          similarity: 0.95,
        },
      ]),
    ),
    getByDocument: mock(() => Promise.resolve([])),
    getChunksByDocument: mock(() => Promise.resolve([])),
    getStats: mock(() =>
      Promise.resolve<IDocumentStats>({
        documentCount: 5,
        chunkCount: 25,
      }),
    ),
  };
}

export function createMockNeo4jDriver() {
  return {
    verifyConnectivity: mock(() => Promise.resolve()),
    close: mock(() => Promise.resolve()),
    init: mock(() => Promise.resolve()),
    upsertEntity: mock(() => Promise.resolve()),
    getEntity: mock(() =>
      Promise.resolve<IEntityNode>({
        id: "mustapha",
        name: "Mustapha",
        type: "Person",
        description: "A developer",
      }),
    ),
    getEntityByName: mock(() =>
      Promise.resolve<IEntityNode>({
        id: "mustapha",
        name: "Mustapha",
        type: "Person",
        description: "A developer",
      }),
    ),
    getEntitiesByType: mock(() =>
      Promise.resolve<IEntityNode[]>([
        { id: "mustapha", name: "Mustapha", type: "Person" },
      ]),
    ),
    searchEntities: mock(() =>
      Promise.resolve<IEntityNode[]>([
        {
          id: "mustapha",
          name: "Mustapha",
          type: "Person",
          description: "A developer",
        },
        {
          id: "relaygraph",
          name: "RelayGraph",
          type: "Project",
          description: "A knowledge graph",
        },
      ]),
    ),
    getEntitiesByChunks: mock(() =>
      Promise.resolve<IEntityNode[]>([
        { id: "mustapha", name: "Mustapha", type: "Person" },
      ]),
    ),
    deleteEntity: mock(() => Promise.resolve()),
    batchUpsertEntities: mock(() => Promise.resolve()),
    mergeEntitiesInGraph: mock(() => Promise.resolve()),
    upsertRelationship: mock(() => Promise.resolve()),
    getEntityRelationships: mock(() => Promise.resolve([])),
    getNeighbors: mock(() =>
      Promise.resolve<INeighborResult[]>([
        {
          source: { id: "mustapha", name: "Mustapha", type: "Person" },
          relationship: "BUILDS",
          fact: "Mustapha builds RelayGraph",
          target: { id: "relaygraph", name: "RelayGraph", type: "Project" },
        },
      ]),
    ),
    getEntityWithRelations: mock(() => Promise.resolve(null)),
    findPaths: mock(() => Promise.resolve([])),
    deleteRelationship: mock(() => Promise.resolve()),
    batchUpsertRelationships: mock(() => Promise.resolve()),
    getStats: mock(() =>
      Promise.resolve<IGraphStats>({
        entityCount: 10,
        relationshipCount: 15,
        entityTypes: { Person: 5, Project: 3, Organization: 2 },
        relationshipTypes: { BUILDS: 5, WORKS_FOR: 10 },
      }),
    ),
    runQuery: mock(() => Promise.resolve([])),
  };
}

export function createMockOpenAI() {
  return {
    embeddings: {
      create: mock(() =>
        Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.1) }],
        }),
      ),
    },
    chat: {
      completions: {
        create: mock(() =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    entities: [
                      {
                        name: "Mustapha",
                        type: "Person",
                        description: "A developer",
                      },
                      {
                        name: "RelayGraph",
                        type: "Project",
                        description: "A knowledge graph",
                      },
                    ],
                    relationships: [
                      {
                        source: "Mustapha",
                        target: "RelayGraph",
                        relation: "BUILDS",
                        fact: "Mustapha builds RelayGraph",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        ),
      },
    },
  };
}
