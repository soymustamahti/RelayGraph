export interface IExtractedEntity {
  name: string;
  type: string;
  description: string;
  attributes?: Record<string, unknown>;
}

export interface IExtractedRelationship {
  source: string;
  target: string;
  relation: string;
  fact?: string;
  attributes?: Record<string, unknown>;
}

export interface IExtractionResult {
  entities: IExtractedEntity[];
  relationships: IExtractedRelationship[];
}

export interface IExtractor {
  extract(text: string): Promise<IExtractionResult>;
}
