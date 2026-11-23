/**
 * Documents without Redis (services/jobs.ts, in-process): a temporary failure is tried again with growing waits, and an
 * embedding model that stays down doesn't lose the document: it is saved searchable by keywords, and its vectors are
 * added by housekeeping once the model answers again (services/documents.ts, fillMissingVectors).
 */
import { document, documentChunk, eq, sql } from "@aatmiq/db";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";
import { createSecretBox } from "./crypto";
import { fillMissingVectors } from "./services/documents";
import { createInProcessJobs, IN_PROCESS_ATTEMPTS } from "./services/jobs";
import { LicenseService } from "./services/license";

const d = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const SECRET = "test-secret-test-secret-test-secret-1234";

d("documents without Redis: retries and the keyword fallback", () => {
  let h: Harness;
  let server: Server;
  let down = 0;
  let calls = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        if (req.url === "/v1/models") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [] }));
        calls++;
        if (down > 0) {
          down--;
          return res.writeHead(503).end("model server restarting");
        }
        const input: string[] = JSON.parse(raw || "{}").input ?? [];
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: input.map((_, i) => ({ index: i, embedding: [1, 0, 0, i / 10] })), usage: { prompt_tokens: 5, total_tokens: 5 } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    h = await startHarness();
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Embeddings", type: "openai_compatible", baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1` });
    const m = await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: "embed-1", displayName: "Embed", kind: "embedding" });
    const ws = (await h.call(h.owner, "GET", `/api/admin/workspaces/${h.workspaceId}/models`)).json;
    await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: ws.modelIds ?? [], defaultModelId: ws.defaultModelId ?? null, embeddingModelId: m.json.id });
  }, 60_000);
  afterAll(async () => {
    await h?.close();
    await new Promise<void>((r) => server?.close(() => r()));
  });

  // A document stored but not processed yet, and a jobs runner with short waits.
  const stored = async (name: string, text: string) => {
    const up = await h.upload(h.alice, "/api/documents", { workspaceId: h.workspaceId }, { name, type: "text/plain", data: Buffer.from(text) });
    await h.settle().catch(() => undefined);
    await h.db.update(document).set({ status: "processing", error: null, embeddingModelId: null }).where(eq(document.id, up.json.id));
    await h.db.delete(documentChunk).where(eq(documentChunk.documentId, up.json.id));
    return up.json.id as string;
  };
  const runner = () =>
    createInProcessJobs(
      { db: h.db, box: createSecretBox(SECRET), storage: h.storage, license: new LicenseService(h.db, { appUrl: "", databaseUrl: "", secret: SECRET, allowMockProvider: true, port: 0, storageDir: "" }), log: () => undefined },
      2,
      { retryDelayMs: 50 },
    );
  const settled = async (id: string) => {
    for (let i = 0; i < 200; i++) {
      const [r] = await h.db.select({ status: document.status, error: document.error, emb: document.embeddingModelId }).from(document).where(eq(document.id, id));
      if (r && r.status !== "processing") return r;
      await new Promise((x) => setTimeout(x, 50));
    }
    throw new Error("still processing");
  };

  it("a model server that is down for a moment is ridden out: tried again until it answers", async () => {
    const id = await stored("short-outage.txt", "Input range 36 to 75 V.");
    down = 2;
    calls = 0;
    const jobs = runner();
    await jobs.document(id);
    const r = await settled(id);
    await jobs.close();
    expect(r).toMatchObject({ status: "ready", error: null });
    expect(r.emb).not.toBeNull();
    expect(calls).toBe(3);
  });

  it("a model that stays down: the document is still saved, searchable by keywords, and gets its vectors later", async () => {
    const id = await stored("long-outage.txt", "Switching frequency is 250 kHz.");
    down = 1000;
    calls = 0;
    const jobs = runner();
    await jobs.document(id);
    const r = await settled(id);
    await jobs.close();
    expect(calls).toBe(IN_PROCESS_ATTEMPTS);
    expect(r.status).toBe("ready");
    expect(r.error).toMatch(/Searchable by keywords for now/);
    const chunks = await h.db.select({ content: documentChunk.content }).from(documentChunk).where(and2(id));
    expect(chunks.map((c) => c.content).join(" ")).toContain("250 kHz");
    // The model is back: housekeeping adds the vectors and clears the note.
    down = 0;
    expect(await fillMissingVectors(h.db, createSecretBox(SECRET))).toBeGreaterThanOrEqual(1);
    const [after] = await h.db.select({ error: document.error, emb: document.embeddingModelId }).from(document).where(eq(document.id, id));
    expect(after).toMatchObject({ error: null });
    expect(after!.emb).not.toBeNull();
    const missing = await h.db.select({ n: sql<number>`count(*)::int` }).from(documentChunk).where(and2(id, true));
    expect(missing[0]!.n).toBe(0);
  });
});

const and2 = (id: string, onlyMissing = false) => (onlyMissing ? sql`${documentChunk.documentId} = ${id} and ${documentChunk.embedding} is null` : eq(documentChunk.documentId, id));
