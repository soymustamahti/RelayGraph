export type EntityConfig = {
  label: string;
  description: string;
};

export type RelationConfig = {
  type: string;
  description: string;
};

export class SchemaManager {
  private entities: EntityConfig[];
  private relations: RelationConfig[];

  constructor() {
    this.entities = [
      { label: "Person", description: "Individuals, people, humans." },
      {
        label: "Organization",
        description: "Companies, agencies, institutions.",
      },
      { label: "Location", description: "Physical places, cities, countries." },
      {
        label: "Technology",
        description: "Software, hardware, tools, frameworks.",
      },
      { label: "Project", description: "Projects, initiatives, products." },
      {
        label: "Concept",
        description: "Abstract ideas, theories, methodologies.",
      },
      { label: "Event", description: "Occurrences, meetings, conferences." },
    ];

    this.relations = [
      { type: "WORKS_FOR", description: "Person works for Organization." },
      { type: "WORKS_WITH", description: "Person works with another Person." },
      { type: "LOCATED_IN", description: "Entity is located in Location." },
      { type: "CREATED", description: "Something was created by someone." },
      { type: "USES", description: "Entity uses another entity." },
      { type: "PART_OF", description: "Entity is part of another entity." },
      { type: "RELATED_TO", description: "Generic relationship." },
    ];
  }

  getEntityTypes(): EntityConfig[] {
    return [...this.entities];
  }

  getRelationTypes(): RelationConfig[] {
    return [...this.relations];
  }

  addEntityType(label: string, description: string): void {
    if (!this.entities.find((e) => e.label === label)) {
      this.entities.push({ label, description });
    }
  }

  addRelationType(type: string, description: string): void {
    if (!this.relations.find((r) => r.type === type)) {
      this.relations.push({ type, description });
    }
  }

  getEntityTypesPrompt(): string {
    return this.entities.map((e) => `${e.label}: ${e.description}`).join("\n");
  }

  getRelationTypesPrompt(): string {
    return this.relations.map((r) => `${r.type}: ${r.description}`).join("\n");
  }
}
