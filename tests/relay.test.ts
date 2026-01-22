import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import dotenv from "dotenv";
import { RelayGraph } from "../src/RelayGraph";

dotenv.config();

const isIntegrationTest = process.env.INTEGRATION_TEST === "true";

describe("RelayGraph Integration", () => {
  let relay: RelayGraph;

  if (!isIntegrationTest) {
    it("should skip integration tests without DB", () => {
      console.log(
        "Skipping integration tests. Set INTEGRATION_TEST=true and provide .env credentials to run.",
      );
    });
    return;
  }

  beforeAll(async () => {
    relay = new RelayGraph({
      pg: {
        connectionString: process.env.POSTGRES_URL!,
      },
      neo4j: {
        uri: process.env.NEO4J_URI!,
        user: process.env.NEO4J_USER!,
        password: process.env.NEO4J_PASSWORD!,
      },
    });

    await relay.init();
  });

  afterAll(async () => {
    if (relay) await relay.close();
  });

  it("should ingest and retrieve data", async () => {
    const text = "Mustapha builds RelayGraph, a hybrid knowledge graph system.";

    const chunkId = await relay.addDocument(text);
    expect(chunkId).toBeDefined();

    const answer = await relay.ask("Who is building RelayGraph?");
    console.log("Answer:", answer);

    expect(answer).toContain("Mustapha");
  }, 30000);
});
