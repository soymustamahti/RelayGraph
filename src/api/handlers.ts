import type { OpenAPIHono } from "@hono/zod-openapi";
import type { RelayGraph } from "../RelayGraph";
import { askRoute, healthRoute, ingestRawRoute, ingestRoute } from "./routes";

export function registerHandlers(
  app: OpenAPIHono,
  relay: RelayGraph,
  startTime: number,
) {
  app.openapi(healthRoute, (c) => {
    return c.json(
      {
        status: "ok",
        version: "1.0.0",
        uptime: Math.floor((Date.now() - startTime) / 1000),
      },
      200,
    );
  });

  app.openapi(ingestRoute, async (c) => {
    try {
      const { text } = c.req.valid("json");
      const chunkId = await relay.addDocument(text);
      return c.json(
        {
          success: true as const,
          chunkId,
          message: "Text successfully ingested into knowledge graph.",
        },
        200,
      );
    } catch (error: any) {
      return c.json({ success: false as const, error: error.message }, 400);
    }
  });

  app.openapi(ingestRawRoute, async (c) => {
    try {
      const text = await c.req.text();
      if (!text || text.trim().length === 0) {
        return c.json(
          { success: false as const, error: "Empty text body" },
          400,
        );
      }
      const chunkId = await relay.addDocument(text);
      return c.json(
        {
          success: true as const,
          chunkId,
          message: "Text successfully ingested into knowledge graph.",
        },
        200,
      );
    } catch (error: any) {
      return c.json({ success: false as const, error: error.message }, 400);
    }
  });

  app.openapi(askRoute, async (c) => {
    try {
      const { query } = c.req.valid("json");
      const answer = await relay.ask(query);
      return c.json({ success: true as const, answer }, 200);
    } catch (error: any) {
      return c.json({ success: false as const, error: error.message }, 400);
    }
  });
}
