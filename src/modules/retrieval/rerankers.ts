import type OpenAI from "openai";
import type {
  IRankedResult,
  IReranker,
  ISearchResult,
  SearchMethod,
} from "../../interfaces";

export class RRFReranker implements IReranker {
  private k: number;

  constructor(k = 60) {
    this.k = k;
  }

  async rerank<T extends { content?: string; name?: string }>(
    _query: string,
    results: Array<ISearchResult<T>>,
  ): Promise<Array<IRankedResult<T>>> {
    const itemScores = new Map<
      string,
      { item: T; score: number; sources: Set<SearchMethod> }
    >();
    const resultsBySource = new Map<SearchMethod, Array<ISearchResult<T>>>();

    for (const result of results) {
      if (!resultsBySource.has(result.source)) {
        resultsBySource.set(result.source, []);
      }
      resultsBySource.get(result.source)!.push(result);
    }

    for (const [source, sourceResults] of resultsBySource) {
      const sorted = [...sourceResults].sort((a, b) => b.score - a.score);

      for (let rank = 0; rank < sorted.length; rank++) {
        const result = sorted[rank];
        const rrfScore = 1 / (this.k + rank + 1);
        const key = JSON.stringify(result.item);

        if (!itemScores.has(key)) {
          itemScores.set(key, {
            item: result.item,
            score: 0,
            sources: new Set(),
          });
        }

        const entry = itemScores.get(key)!;
        entry.score += rrfScore;
        entry.sources.add(source);
      }
    }

    const ranked = Array.from(itemScores.values())
      .map(({ item, score, sources }) => ({
        item,
        score,
        sources: Array.from(sources),
      }))
      .sort((a, b) => b.score - a.score);

    return ranked;
  }
}

export class CrossEncoderReranker implements IReranker {
  private openai: OpenAI;
  private model: string;
  private threshold: number;

  constructor(openai: OpenAI, model = "gpt-4o-mini", threshold = 0.5) {
    this.openai = openai;
    this.model = model;
    this.threshold = threshold;
  }

  async rerank<
    T extends { content?: string; name?: string; description?: string },
  >(
    query: string,
    results: Array<ISearchResult<T>>,
  ): Promise<Array<IRankedResult<T>>> {
    if (results.length === 0) return [];

    const uniqueItems = this.deduplicateResults(results);

    const scoredItems = await Promise.all(
      uniqueItems.map(async ({ item, sources }) => {
        const text = this.getTextFromItem(item);
        const score = await this.scoreRelevance(query, text);
        return { item, score, sources };
      }),
    );

    return scoredItems
      .filter((item) => item.score >= this.threshold)
      .sort((a, b) => b.score - a.score);
  }

  private deduplicateResults<T>(
    results: Array<ISearchResult<T>>,
  ): Array<{ item: T; sources: SearchMethod[] }> {
    const seen = new Map<string, { item: T; sources: Set<SearchMethod> }>();

    for (const result of results) {
      const key = JSON.stringify(result.item);
      if (!seen.has(key)) {
        seen.set(key, { item: result.item, sources: new Set() });
      }
      seen.get(key)!.sources.add(result.source);
    }

    return Array.from(seen.values()).map(({ item, sources }) => ({
      item,
      sources: Array.from(sources),
    }));
  }

  private getTextFromItem<
    T extends { content?: string; name?: string; description?: string },
  >(item: T): string {
    if (item.content) return item.content;
    if (item.name && item.description)
      return `${item.name}: ${item.description}`;
    if (item.name) return item.name;
    return JSON.stringify(item);
  }

  private async scoreRelevance(
    query: string,
    passage: string,
  ): Promise<number> {
    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: `You are a relevance scoring system. Score how relevant the PASSAGE is to the QUERY on a scale of 0 to 1.
Output ONLY a decimal number between 0 and 1, nothing else.
- 0.0 = completely irrelevant
- 0.5 = somewhat relevant
- 1.0 = highly relevant and directly answers the query`,
        },
        {
          role: "user",
          content: `QUERY: ${query}\n\nPASSAGE: ${passage.slice(0, 1000)}`,
        },
      ],
      temperature: 0,
      max_tokens: 10,
    });

    const scoreStr = response.choices[0]?.message?.content?.trim() || "0";
    const score = Number.parseFloat(scoreStr);
    return Number.isNaN(score) ? 0 : Math.max(0, Math.min(1, score));
  }
}

export class MMRReranker implements IReranker {
  private lambda: number;
  private openai: OpenAI;
  private embeddingModel: string;

  constructor(
    openai: OpenAI,
    lambda = 0.5,
    embeddingModel = "text-embedding-3-small",
  ) {
    this.lambda = lambda;
    this.openai = openai;
    this.embeddingModel = embeddingModel;
  }

  async rerank<
    T extends { content?: string; name?: string; description?: string },
  >(
    query: string,
    results: Array<ISearchResult<T>>,
  ): Promise<Array<IRankedResult<T>>> {
    if (results.length === 0) return [];

    const uniqueItems = this.deduplicateResults(results);

    const texts = uniqueItems.map(({ item }) => this.getTextFromItem(item));
    const allTexts = [query, ...texts];

    const embeddings = await this.getEmbeddings(allTexts);
    const queryEmbedding = embeddings[0];
    const itemEmbeddings = embeddings.slice(1);

    const selected: Array<IRankedResult<T>> = [];
    const remaining = uniqueItems.map((item, idx) => ({
      ...item,
      embedding: itemEmbeddings[idx],
      relevance: this.cosineSimilarity(queryEmbedding, itemEmbeddings[idx]),
    }));

    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        let maxSimilarity = 0;

        for (const sel of selected) {
          const selEmb =
            itemEmbeddings[uniqueItems.findIndex((u) => u.item === sel.item)];
          const sim = this.cosineSimilarity(candidate.embedding, selEmb);
          maxSimilarity = Math.max(maxSimilarity, sim);
        }

        const mmrScore =
          this.lambda * candidate.relevance - (1 - this.lambda) * maxSimilarity;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      const best = remaining.splice(bestIdx, 1)[0];
      selected.push({
        item: best.item,
        score: best.relevance,
        sources: best.sources,
      });
    }

    return selected;
  }

  private deduplicateResults<T>(
    results: Array<ISearchResult<T>>,
  ): Array<{ item: T; sources: SearchMethod[] }> {
    const seen = new Map<string, { item: T; sources: Set<SearchMethod> }>();

    for (const result of results) {
      const key = JSON.stringify(result.item);
      if (!seen.has(key)) {
        seen.set(key, { item: result.item, sources: new Set() });
      }
      seen.get(key)!.sources.add(result.source);
    }

    return Array.from(seen.values()).map(({ item, sources }) => ({
      item,
      sources: Array.from(sources),
    }));
  }

  private getTextFromItem<
    T extends { content?: string; name?: string; description?: string },
  >(item: T): string {
    if (item.content) return item.content;
    if (item.name && item.description)
      return `${item.name}: ${item.description}`;
    if (item.name) return item.name;
    return JSON.stringify(item);
  }

  private async getEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: texts,
      encoding_format: "float",
    });
    return response.data.map((d) => d.embedding);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export class NoOpReranker implements IReranker {
  async rerank<T extends { content?: string; name?: string }>(
    _query: string,
    results: Array<ISearchResult<T>>,
  ): Promise<Array<IRankedResult<T>>> {
    const itemMap = new Map<
      string,
      { item: T; score: number; sources: Set<SearchMethod> }
    >();

    for (const result of results) {
      const key = JSON.stringify(result.item);
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          item: result.item,
          score: result.score,
          sources: new Set(),
        });
      }
      const entry = itemMap.get(key)!;
      entry.score = Math.max(entry.score, result.score);
      entry.sources.add(result.source);
    }

    return Array.from(itemMap.values())
      .map(({ item, score, sources }) => ({
        item,
        score,
        sources: Array.from(sources),
      }))
      .sort((a, b) => b.score - a.score);
  }
}

export function createReranker(
  type: "rrf" | "cross-encoder" | "mmr" | "none",
  openai?: OpenAI,
  options?: { k?: number; threshold?: number; lambda?: number },
): IReranker {
  switch (type) {
    case "rrf":
      return new RRFReranker(options?.k ?? 60);
    case "cross-encoder":
      if (!openai) throw new Error("OpenAI client required for cross-encoder");
      return new CrossEncoderReranker(
        openai,
        "gpt-4o-mini",
        options?.threshold ?? 0.5,
      );
    case "mmr":
      if (!openai) throw new Error("OpenAI client required for MMR");
      return new MMRReranker(openai, options?.lambda ?? 0.5);
    default:
      return new NoOpReranker();
  }
}
