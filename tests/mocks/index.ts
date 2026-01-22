import { mock } from "bun:test";

export function createMockPostgresDriver() {
  return {
    connect: mock(() => Promise.resolve()),
    disconnect: mock(() => Promise.resolve()),
    init: mock(() => Promise.resolve()),
    addChunk: mock(() => Promise.resolve("test-chunk-id-123")),
    findSimilarChunks: mock(() =>
      Promise.resolve([
        {
          id: "chunk-1",
          content: "Sample content about Mustapha",
          similarity: 0.95,
        },
        {
          id: "chunk-2",
          content: "RelayGraph is a knowledge graph",
          similarity: 0.85,
        },
      ]),
    ),
    deleteChunk: mock(() => Promise.resolve()),
  };
}

export function createMockNeo4jDriver() {
  return {
    verifyConnectivity: mock(() => Promise.resolve()),
    close: mock(() => Promise.resolve()),
    mergeNode: mock(() => Promise.resolve()),
    createRelationship: mock(() => Promise.resolve()),
    findEntitiesByChunks: mock(() =>
      Promise.resolve([
        { id: "mustapha", name: "Mustapha", source_chunk_id: "chunk-1" },
        { id: "relaygraph", name: "RelayGraph", source_chunk_id: "chunk-1" },
      ]),
    ),
    getNeighbors: mock(() =>
      Promise.resolve([
        {
          source: { id: "mustapha", name: "Mustapha", labels: ["Person"] },
          relationship: "BUILDS",
          target: { id: "relaygraph", name: "RelayGraph", labels: ["Project"] },
        },
      ]),
    ),
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
