/**
 * The project brain found by meaning (services/brain.ts, searchBrainByMeaning): with the workspace's embedding model,
 * entries are embedded when first needed and found by what they mean, not only by their words; a corrected entry is
 * embedded again; without an embedding model (or when it fails) keyword search carries on alone. A fake embedding server
 * maps words to three topics (voltage, frequency, temperature).
 */
import { brainEntry, eq } from "@aatmiq/db";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";
import { brainContext, searchBrain, searchBrainByMeaning } from "./services/brain";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const TOPICS = [/volt|supply|input|\bv\b/i, /frequen|khz|switch|clock/i, /temperat|ambient|cold|hot|heat|°?c\b/i];
const vectorOf = (text: string) => {
  const v = TOPICS.map((re) => (re.test(text) ? 1 : 0.05));
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

d("the project brain, by meaning", () => {
  let h: Harness;
  let server: Server;
  let projectId = "";
  let embeddingModelId = "";
  let embedded = 0;
  let down = false;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        if (req.url === "/v1/models") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [] }));
        if (down) return res.writeHead(503).end("down");
        const body = JSON.parse(raw || "{}");
        const input: string[] = Array.isArray(body.input) ? body.input : [body.input];
        embedded += input.length;
        res.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({ data: input.map((t, i) => ({ index: i, embedding: vectorOf(t) })), usage: { prompt_tokens: input.length * 5, total_tokens: input.length * 5 } }),
        );
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    h = await startHarness();
    projectId = (await h.call(h.alice, "POST", "/api/projects", { workspaceId: h.workspaceId, name: "DC-DC converter" })).json.id;
    for (const [page, text] of [
      ["Requirements", "Input voltage range is 36 V to 75 V."],
      ["Design", "Switching frequency is 250 kHz."],
      ["Requirements", "Ambient temperature range is -40 C to +85 C."],
    ])
      expect((await h.call(h.alice, "POST", `/api/projects/${projectId}/brain/entries`, { page, text })).status).toBe(200);
  }, 60_000);
  afterAll(async () => {
    await h?.close();
    await new Promise<void>((r) => server?.close(() => r()));
  });

  const ids = async () => new Map((await h.db.select({ id: brainEntry.id, text: brainEntry.text }).from(brainEntry).where(eq(brainEntry.projectId, projectId))).map((e) => [e.text, e.id]));

  it("without an embedding model, only words find entries", async () => {
    const ws = (await h.call(h.owner, "GET", `/api/admin/workspaces/${h.workspaceId}/models`)).json;
    expect((await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: ws.modelIds ?? [], defaultModelId: ws.defaultModelId ?? null, embeddingModelId: null })).status).toBe(200);
    const { createSecretBox } = await import("./crypto");
    const r = await searchBrainByMeaning(h.db, createSecretBox("test-secret-test-secret-test-secret-1234"), { workspaceId: h.workspaceId, projectId, query: "How cold can it get?" });
    expect(r).toEqual({ ids: [], tokens: 0, modelId: null });
    expect(await searchBrain(h.db, projectId, "How cold can it get?")).toEqual([]);
  });

  it("with one, entries are embedded when first needed and found by what they mean", async () => {
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Embeddings", type: "openai_compatible", baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1` });
    const m = await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: "embed-1", displayName: "Embed", kind: "embedding" });
    expect(m.status).toBe(200);
    embeddingModelId = m.json.id;
    const ws = (await h.call(h.owner, "GET", `/api/admin/workspaces/${h.workspaceId}/models`)).json;
    expect((await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: ws.modelIds ?? [], defaultModelId: ws.defaultModelId ?? null, embeddingModelId })).status).toBe(200);
    const { createSecretBox } = await import("./crypto");
    const sb = createSecretBox("test-secret-test-secret-test-secret-1234");
    embedded = 0;
    const r = await searchBrainByMeaning(h.db, sb, { workspaceId: h.workspaceId, projectId, query: "How cold can it get?" });
    const e = await ids();
    expect(r.ids[0]).toBe(e.get("Ambient temperature range is -40 C to +85 C."));
    expect(r.modelId).toBe(embeddingModelId);
    // Three entries and the question.
    expect(embedded).toBe(4);
    // The second time only the question is embedded.
    embedded = 0;
    await searchBrainByMeaning(h.db, sb, { workspaceId: h.workspaceId, projectId, query: "What clock do we run at?" }).then((x) => expect(x.ids[0]).toBe(e.get("Switching frequency is 250 kHz.")));
    expect(embedded).toBe(1);
    // The chat's brain puts the entry found by meaning first, and the tokens are counted.
    let counted = 0;
    const ctxText = await brainContext(h.db, { id: projectId, name: "DC-DC converter", brainMode: "auto" }, "How cold can it get?", 6000, { box: sb, workspaceId: h.workspaceId, onTokens: async (n) => void (counted += n) });
    expect(ctxText).toContain("Ambient temperature range");
    expect(counted).toBeGreaterThan(0);
  });

  it("a corrected entry is embedded again; a failing embedding server leaves keyword search", async () => {
    const e = await ids();
    const id = e.get("Switching frequency is 250 kHz.")!;
    expect((await h.call(h.alice, "PATCH", `/api/projects/${projectId}/brain/entries/${id}`, { text: "Supply voltage nominal is 48 V." })).status).toBe(200);
    const [row] = await h.db.select({ m: brainEntry.embeddingModelId }).from(brainEntry).where(eq(brainEntry.id, id));
    expect(row!.m).toBeNull();
    const { createSecretBox } = await import("./crypto");
    const sb = createSecretBox("test-secret-test-secret-test-secret-1234");
    embedded = 0;
    const r = await searchBrainByMeaning(h.db, sb, { workspaceId: h.workspaceId, projectId, query: "What clock do we run at?" });
    expect(embedded).toBe(2);
    expect(r.ids[0]).not.toBe(id);
    down = true;
    expect((await searchBrainByMeaning(h.db, sb, { workspaceId: h.workspaceId, projectId, query: "voltage" })).ids).toEqual([]);
    expect(await searchBrain(h.db, projectId, "voltage")).toContain(e.get("Input voltage range is 36 V to 75 V."));
    down = false;
  });
});
