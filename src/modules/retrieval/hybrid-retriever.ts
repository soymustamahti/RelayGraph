import OpenAI from "openai";
import type { ModelConfigInput, ResolvedModelConfig } from "../../config";
import { DEFAULT_MODEL_CONFIG } from "../../config";
import type { Neo4jDriver } from "../../db/neo4j";
import type { PostgresDriver } from "../../db/postgres";
import type {
  IKnowledgeGraphTriple,
  IRankedResult,
  IReranker,
  IRetrievalChunk,
  IRetrievalEntity,
  IRetrievalOptions,
  IRetrievalResult,
  IRetriever,
  ISearchResult,
  RerankerType,
  SearchMethod,
} from "../../interfaces";
import { createReranker } from "./rerankers";

export interface RetrieverOptions {
  openaiClient?: OpenAI;
  apiKey?: string;
  models?: Partial<ModelConfigInput>;
  defaultSearchMethods?: SearchMethod[];
  defaultReranker?: RerankerType;
}

interface ChunkSearchResult {
  id: string;
  content: string;
  score: number;
}

interface EntitySearchResult {
  id: string;
  name: string;
  type?: string;
  description?: string;
  score: number;
}

export class HybridRetriever implements IRetriever {
  private openai: OpenAI;
  private pg: PostgresDriver;
  private neo4j: Neo4jDriver;
  private config: ResolvedModelConfig;
  private defaultSearchMethods: SearchMethod[];
  private defaultReranker: RerankerType;

  constructor(
    pg: PostgresDriver,
    neo4j: Neo4jDriver,
    options: RetrieverOptions,
  ) {
    if (options.openaiClient) {
      this.openai = options.openaiClient;
    } else if (options.apiKey) {
      this.openai = new OpenAI({ apiKey: options.apiKey });
    } else {
      throw new Error("Either openaiClient or apiKey must be provided");
    }

    this.pg = pg;
    this.neo4j = neo4j;
    this.config = { ...DEFAULT_MODEL_CONFIG, ...options.models };
    this.defaultSearchMethods = options.defaultSearchMethods ?? [
      "bm25",
      "semantic",
      "graph",
    ];
    this.defaultReranker = options.defaultReranker ?? "rrf";
  }

  async retrieve(
    query: string,
    options?: IRetrievalOptions,
  ): Promise<IRetrievalResult> {
    const maxChunks = options?.maxChunks ?? 10;
    const maxEntities = options?.maxEntities ?? 15;
    const maxGraphTriples = options?.maxGraphTriples ?? 20;
    const chunkThreshold = options?.chunkThreshold ?? 0.3;
    const searchMethods = options?.searchMethods ?? this.defaultSearchMethods;
    const rerankerType = options?.reranker ?? this.defaultReranker;
    const bfsDepth = options?.bfsDepth ?? 2;
    const rrfK = options?.rrfK ?? 60;
    const crossEncoderThreshold = options?.crossEncoderThreshold ?? 0.5;

    const reranker = createReranker(rerankerType, this.openai, {
      k: rrfK,
      threshold: crossEncoderThreshold,
    });

    const [chunkResults, entityResults] = await Promise.all([
      this.searchChunksMultiMethod(
        query,
        searchMethods,
        maxChunks * 3,
        chunkThreshold,
      ),
      this.searchEntitiesMultiMethod(query, searchMethods, maxEntities * 2),
    ]);

    const [rankedChunks, rankedEntities] = await Promise.all([
      this.rerankChunks(query, chunkResults, reranker),
      this.rerankEntities(query, entityResults, reranker),
    ]);

    const topChunks = rankedChunks.slice(0, maxChunks);
    const topEntities = rankedEntities.slice(0, maxEntities);

    let knowledgeGraph: IKnowledgeGraphTriple[] = [];

    if (searchMethods.includes("graph") && topEntities.length > 0) {
      knowledgeGraph = await this.buildKnowledgeGraph(
        topEntities.map((e) => e.item.id),
        bfsDepth,
        maxGraphTriples,
      );
    }

    return {
      chunks: topChunks.map((r) => ({
        id: r.item.id,
        content: r.item.content,
        similarity: r.score,
        combinedScore: r.score,
      })),
      entities: topEntities.map((r) => ({
        id: r.item.id,
        name: r.item.name,
        type: r.item.type,
        description: r.item.description,
        score: r.score,
      })),
      knowledgeGraph,
    };
  }

  private async searchChunksMultiMethod(
    query: string,
    methods: SearchMethod[],
    limit: number,
    threshold: number,
  ): Promise<Array<ISearchResult<ChunkSearchResult>>> {
    const results: Array<ISearchResult<ChunkSearchResult>> = [];
    const searches: Array<Promise<void>> = [];

    if (methods.includes("semantic")) {
      searches.push(
        (async () => {
          const embedding = await this.getEmbedding(query);
          const chunks = await this.pg.searchChunks(
            embedding,
            limit,
            threshold,
          );
          for (const chunk of chunks) {
            results.push({
              item: {
                id: chunk.id,
                content: chunk.content,
                score: chunk.similarity,
              },
              score: chunk.similarity,
              source: "semantic",
            });
          }
        })(),
      );
    }

    if (methods.includes("bm25")) {
      searches.push(
        (async () => {
          const chunks = await this.pg.searchBM25(query, limit);
          const maxScore = Math.max(...chunks.map((c) => c.score), 1);
          for (const chunk of chunks) {
            results.push({
              item: {
                id: chunk.id,
                content: chunk.content,
                score: chunk.score / maxScore,
              },
              score: chunk.score / maxScore,
              source: "bm25",
            });
          }
        })(),
      );
    }

    await Promise.all(searches);
    return results;
  }

  private async searchEntitiesMultiMethod(
    query: string,
    methods: SearchMethod[],
    limit: number,
  ): Promise<Array<ISearchResult<EntitySearchResult>>> {
    const results: Array<ISearchResult<EntitySearchResult>> = [];
    const searches: Array<Promise<void>> = [];

    if (methods.includes("semantic") || methods.includes("bm25")) {
      searches.push(
        (async () => {
          const entities = await this.neo4j.searchEntitiesWithScore(
            query,
            limit,
          );
          const maxScore = Math.max(...entities.map((e) => e.score), 1);
          for (const { entity, score } of entities) {
            results.push({
              item: {
                id: entity.id,
                name: entity.name,
                type: entity.type,
                description: entity.description,
                score: score / maxScore,
              },
              score: score / maxScore,
              source: "bm25",
            });
          }
        })(),
      );
    }

    if (methods.includes("graph")) {
      searches.push(
        (async () => {
          const entities = await this.neo4j.searchEntities(
            query,
            Math.ceil(limit / 3),
          );
          if (entities.length > 0) {
            const bfsResults = await this.neo4j.bfsSearch(
              entities.slice(0, 3).map((e) => e.id),
              2,
              limit,
            );
            for (const { entity, depth } of bfsResults) {
              const depthScore = 1 / (depth + 1);
              results.push({
                item: {
                  id: entity.id,
                  name: entity.name,
                  type: entity.type,
                  description: entity.description,
                  score: depthScore,
                },
                score: depthScore,
                source: "graph",
              });
            }
          }
        })(),
      );
    }

    await Promise.all(searches);
    return results;
  }

  private async rerankChunks(
    query: string,
    results: Array<ISearchResult<ChunkSearchResult>>,
    reranker: IReranker,
  ): Promise<Array<IRankedResult<ChunkSearchResult>>> {
    const mapped = results.map((r) => ({
      item: { ...r.item, content: r.item.content },
      score: r.score,
      source: r.source,
    }));
    return reranker.rerank(query, mapped);
  }

  private async rerankEntities(
    query: string,
    results: Array<ISearchResult<EntitySearchResult>>,
    reranker: IReranker,
  ): Promise<Array<IRankedResult<EntitySearchResult>>> {
    const mapped = results.map((r) => ({
      item: { ...r.item, name: r.item.name, description: r.item.description },
      score: r.score,
      source: r.source,
    }));
    return reranker.rerank(query, mapped);
  }

  private async buildKnowledgeGraph(
    entityIds: string[],
    depth: number,
    limit: number,
  ): Promise<IKnowledgeGraphTriple[]> {
    const neighbors = await this.neo4j.getNeighbors(entityIds);
    const triples: IKnowledgeGraphTriple[] = [];

    for (const rel of neighbors.slice(0, limit)) {
      triples.push({
        source: rel.source,
        relationship: rel.relationship,
        fact: rel.fact,
        target: rel.target,
      });
    }

    if (depth > 1 && entityIds.length > 0) {
      const bfsResults = await this.neo4j.bfsSearch(
        entityIds.slice(0, 5),
        depth,
        limit,
      );
      const additionalEntityIds = bfsResults.map((r) => r.entity.id);

      if (additionalEntityIds.length > 0) {
        const additionalNeighbors = await this.neo4j.getNeighbors(
          additionalEntityIds.slice(0, 10),
        );

        for (const rel of additionalNeighbors) {
          const exists = triples.some(
            (t) =>
              t.source.id === rel.source.id &&
              t.target.id === rel.target.id &&
              t.relationship === rel.relationship,
          );
          if (!exists && triples.length < limit) {
            triples.push({
              source: rel.source,
              relationship: rel.relationship,
              fact: rel.fact,
              target: rel.target,
            });
          }
        }
      }
    }

    return triples;
  }

  async searchChunks(
    query: string,
    limit = 5,
  ): Promise<Array<{ id: string; content: string; similarity: number }>> {
    const embedding = await this.getEmbedding(query);
    return this.pg.searchChunks(embedding, limit, 0.3);
  }

  async searchChunksHybrid(
    query: string,
    options?: {
      limit?: number;
      semanticWeight?: number;
      bm25Weight?: number;
    },
  ): Promise<
    Array<{
      id: string;
      content: string;
      semanticScore: number;
      bm25Score: number;
      combinedScore: number;
    }>
  > {
    const embedding = await this.getEmbedding(query);
    return this.pg.hybridSearch(query, embedding, options);
  }

  async searchEntities(query: string, limit = 10) {
    return this.neo4j.searchEntities(query, limit);
  }

  async searchEntitiesWithGraph(
    query: string,
    options?: { limit?: number; bfsDepth?: number },
  ): Promise<{
    entities: IRetrievalEntity[];
    graph: IKnowledgeGraphTriple[];
  }> {
    const limit = options?.limit ?? 10;
    const bfsDepth = options?.bfsDepth ?? 2;

    const entities = await this.neo4j.searchEntities(query, limit);
    const entityIds = entities.map((e) => e.id);

    const graph = await this.buildKnowledgeGraph(
      entityIds,
      bfsDepth,
      limit * 2,
    );

    return {
      entities: entities.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        description: e.description,
      })),
      graph,
    };
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: this.config.embeddingModel,
      input: text,
      encoding_format: "float",
    });
    return response.data[0].embedding;
  }
}
