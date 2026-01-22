import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import dotenv from "dotenv";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { RelayGraph } from "../RelayGraph";
import { registerHandlers } from "./handlers";

dotenv.config();

const app = new OpenAPIHono();
const startTime = Date.now();

app.use("*", logger());
app.use("*", cors());

const relay = new RelayGraph({
  pg: { connectionString: process.env.POSTGRES_URL! },
  neo4j: {
    uri: process.env.NEO4J_URI!,
    user: process.env.NEO4J_USER!,
    password: process.env.NEO4J_PASSWORD!,
  },
});

relay.init().then(() => console.log("✅ RelayGraph Initialized"));

registerHandlers(app, relay, startTime);

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "RelayGraph API",
    version: "1.0.0",
    description:
      "Hybrid Knowledge Graph API combining PostgreSQL (pgvector) and Neo4j.",
  },
  servers: [{ url: "http://localhost:3000", description: "Local development" }],
});

app.get("/docs", swaggerUI({ url: "/openapi.json" }));
app.get("/", (c) => c.redirect("/docs"));

console.log("🚀 Server running on http://localhost:3000");
console.log("📚 API Docs: http://localhost:3000/docs");

export default {
  port: 3000,
  fetch: app.fetch,
};
