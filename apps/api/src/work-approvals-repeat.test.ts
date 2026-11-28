/**
 * Approvals that repeat, and pictures a model server can't read (plans/agent-test/results.md, findings 3, 6, 10).
 * Super AI asked fifteen and twenty-six times for the same `pip install`; Work AI's charts reached the model as WebP,
 * which the model server couldn't load, and the whole task failed.
 */
import { createDb, organization, sql, workApproval, type DB } from "@aatmiq/db";
import { createCanvas } from "@napi-rs/canvas";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import type { Config } from "./config";
import { dropImages, hasImages, IMAGE_DROPPED_NOTE, IMAGE_LOAD_FAILED, normalizeImages } from "./services/model-images";
import { repeatKey } from "./services/work";

describe("what counts as the same action", () => {
  it("a command or file, with its label and time limit left out; never a connector call or a plan", () => {
    const a = repeatKey("bash", "Downloads or publishes packages", { command: "pip install pandas-ta", description: "Install" });
    expect(a).toBe(repeatKey("bash", "Downloads or publishes packages", { command: "pip  install pandas-ta", description: "Try again", timeoutMs: 300000 }));
    expect(a).not.toBe(repeatKey("bash", "Downloads or publishes packages", { command: "pip install requests" }));
    expect(repeatKey("mcp__github__create_issue", "Uses the github connector", { title: "x", path: "y" })).toBeNull();
    expect(repeatKey("ExitPlanMode", "Plan ready for review: do it", { plan: "do it" })).toBeNull();
    expect(repeatKey("bash", "Deletes files", null)).toBeNull();
  });
});

describe("pictures on their way to a model", () => {
  const picture = async (format: "webp" | "png") => {
    const c = createCanvas(20, 10);
    const g = c.getContext("2d");
    g.fillStyle = "rgba(200,30,30,0.8)";
    g.fillRect(0, 0, 20, 10);
    return `data:image/${format};base64,${(await c.encode(format)).toString("base64")}`;
  };
  it("WebP goes as PNG; PNG and JPEG are left alone", async () => {
    const webp = await picture("webp");
    const png = await picture("png");
    const messages = [{ role: "user", content: [{ type: "text", text: "Look" }, { type: "image_url", image_url: { url: webp } }, { type: "image_url", image_url: { url: png } }] }];
    expect(await normalizeImages(messages)).toBe(1);
    const urls = (messages[0]!.content as { image_url?: { url: string } }[]).slice(1).map((p) => p.image_url!.url);
    expect(urls[0]).toMatch(/^data:image\/png;base64,iVBOR/);
    expect(urls[1]).toBe(png);
  });
  it("a server that still can't load one: the pictures become a note, so the agent carries on", () => {
    expect(IMAGE_LOAD_FAILED.test("litellm.BadRequestError: OpenAIException - Failed to load image or audio file")).toBe(true);
    const messages = [{ role: "tool", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] }, { role: "user", content: "plain text" }];
    expect(hasImages(messages)).toBe(true);
    expect(dropImages(messages)).toBe(1);
    expect(messages[0]!.content).toEqual([{ type: "text", text: IMAGE_DROPPED_NOTE }]);
    expect(hasImages(messages)).toBe(false);
  });
});

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("an approval asked again for the same action", () => {
  let app: FastifyInstance;
  let db: DB;
  let close: () => Promise<void>;
  let taskId = "";
  let ownerId = "";
  const APP_URL = "http://localhost:3000";
  let cookie = "";
  const call = async (method: "GET" | "POST", path: string, body?: unknown) => {
    const res = await app.inject({ method, url: path, headers: { origin: APP_URL, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, payload: body !== undefined ? JSON.stringify(body) : undefined });
    const set = res.headers["set-cookie"];
    if (set) cookie = (Array.isArray(set) ? set : [set]).map((c) => c.split(";")[0]).join("; ");
    return { status: res.statusCode, json: res.json() };
  };
  const runner = () => (app as unknown as { workRunner: { requestApproval: (t: string, a: object) => Promise<{ id: string; status: string }>; decide: (id: string, s: "approved" | "rejected", u: string | null) => Promise<unknown> } }).workRunner;

  beforeAll(async () => {
    ({ db, close } = createDb(url));
    await db.execute(sql`
      do $$ declare r record; begin
        for r in (select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%') loop
          execute 'truncate table "' || r.tablename || '" cascade';
        end loop;
      end $$;`);
    const cfg: Config = {
      appUrl: APP_URL,
      databaseUrl: url ?? "",
      secret: "test-secret-test-secret-test-secret-1234",
      allowMockProvider: true,
      port: 0,
      storageDir: await mkdtemp(join(tmpdir(), "aatmiq-repeat-files-")),
      workDir: await mkdtemp(join(tmpdir(), "aatmiq-repeat-work-")),
      codeDir: await mkdtemp(join(tmpdir(), "aatmiq-repeat-code-")),
    };
    app = await buildApp(db, cfg);
    expect((await call("POST", "/api/setup", { orgName: "Acme", name: "Olu Owner", email: "owner@acme.test", password: "correct-horse-battery" })).status).toBe(200);
    const me = (await call("GET", "/api/me")).json;
    ownerId = me.user.id;
    await db.update(organization).set({ workSettings: { approvals: "risky" } });
    const task = await call("POST", "/api/work/tasks", { workspaceId: me.workspaces[0].id, prompt: "Hello" });
    expect(task.status).toBe(200);
    taskId = task.json.id;
    for (let i = 0; i < 150; i++) {
      const st = (await call("GET", `/api/work/tasks/${taskId}`)).json.task.status;
      if (st === "completed" || st === "failed") break;
      await new Promise((r) => setTimeout(r, 200));
    }
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await close?.();
  });

  it("the same command, approved once, is approved again without asking; a different one, or one refused, asks", async () => {
    const install = { callId: null, toolName: "bash", reason: "Downloads or publishes packages", detail: { command: "pip install pandas-ta" } };
    const first = await runner().requestApproval(taskId, install);
    expect(first.status).toBe("pending");
    await runner().decide(first.id, "approved", ownerId);
    const again = await runner().requestApproval(taskId, { ...install, detail: { command: "pip install pandas-ta", description: "retry" } });
    expect(again.status).toBe("approved");
    expect((await db.select().from(workApproval).where(eq(workApproval.id, again.id)))[0]!.decidedBy).toBe(ownerId);
    // The person sees what it was for: the command is on the approval.
    expect((await db.select().from(workApproval).where(eq(workApproval.id, again.id)))[0]!.detail).toMatchObject({ command: "pip install pandas-ta" });

    const other = await runner().requestApproval(taskId, { ...install, detail: { command: "pip install requests" } });
    expect(other.status).toBe("pending");
    await runner().decide(other.id, "rejected", ownerId);
    const refusedAgain = await runner().requestApproval(taskId, { ...install, detail: { command: "pip install requests" } });
    expect(refusedAgain.status).toBe("pending");
  });
});
