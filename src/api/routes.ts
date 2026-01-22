import { createRoute } from "@hono/zod-openapi";
import {
  AskRequestSchema,
  AskResponseSchema,
  ErrorSchema,
  HealthResponseSchema,
  IngestRequestSchema,
  IngestResponseSchema,
} from "../schemas/api";

export const ingestRoute = createRoute({
  method: "post",
  path: "/api/ingest",
  tags: ["Ingestion"],
  summary: "Ingest text (JSON)",
  description:
    "Processes text, extracts entities and relationships, stores in Postgres and Neo4j.",
  request: {
    body: { content: { "application/json": { schema: IngestRequestSchema } } },
  },
  responses: {
    200: {
      description: "Successfully ingested",
      content: { "application/json": { schema: IngestResponseSchema } },
    },
    400: {
      description: "Bad request",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export const ingestRawRoute = createRoute({
  method: "post",
  path: "/api/ingest/raw",
  tags: ["Ingestion"],
  summary: "Ingest raw text (plain text)",
  description:
    "Upload raw text without JSON escaping. Just send the text body directly.",
  request: {
    body: { content: { "text/plain": { schema: { type: "string" } } } },
  },
  responses: {
    200: {
      description: "Successfully ingested",
      content: { "application/json": { schema: IngestResponseSchema } },
    },
    400: {
      description: "Bad request",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export const askRoute = createRoute({
  method: "post",
  path: "/api/ask",
  tags: ["Query"],
  summary: "Ask a question",
  description:
    "Performs hybrid search (vector + graph) and synthesizes an answer.",
  request: {
    body: { content: { "application/json": { schema: AskRequestSchema } } },
  },
  responses: {
    200: {
      description: "Answer generated",
      content: { "application/json": { schema: AskResponseSchema } },
    },
    400: {
      description: "Bad request",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Health check",
  responses: {
    200: {
      description: "Service healthy",
      content: { "application/json": { schema: HealthResponseSchema } },
    },
  },
});
