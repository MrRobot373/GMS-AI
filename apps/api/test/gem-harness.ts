/**
 * Shared setup for the GEM AI API tests (learning, calculators, knowledge): a fresh database, an
 * organization with its owner and two members in one workspace, and a request helper with cookies.
 */
import { createDb, sql, type DB } from "@aatmiq/db";
import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import { buildApp } from "../src/app";
import type { Config } from "../src/config";
import { StorageNotFound, type Storage } from "../src/services/storage";
import type { YtDlpRunner } from "../src/services/youtube";

export const APP_URL = "http://localhost:3000";
export type Jar = { cookie: string };
export const jar = (): Jar => ({ cookie: "" });

export interface Harness {
  app: FastifyInstance;
  db: DB;
  workspaceId: string;
  owner: Jar;
  alice: Jar;
  bob: Jar;
  ids: { owner: string; alice: string; bob: string };
  call: (j: Jar | null, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown) => Promise<{ status: number; json: any; body: string; headers: Record<string, unknown> }>;
  upload: (j: Jar, url: string, fields: Record<string, string>, file: { name: string; type: string; data: Buffer }) => Promise<{ status: number; json: any }>;
  /** Wait until no document is still processing. */
  settle: () => Promise<void>;
  signIn: (j: Jar, email: string, password: string) => Promise<unknown>;
  close: () => Promise<void>;
}

/** In-memory file storage for tests. */
export function memoryStorage(): Storage {
  const files = new Map<string, Buffer>();
  return {
    put: async (key: string, data: Buffer) => void files.set(key, Buffer.from(data)),
    get: async (key: string) => {
      const f = files.get(key);
      if (!f) throw new StorageNotFound(key);
      return f;
    },
    remove: async (key: string) => void files.delete(key),
    describe: () => "memory",
    check: async () => undefined,
  };
}

export async function startHarness(extra: Partial<Config> = {}, opts: { fetch?: typeof fetch; ytDlp?: YtDlpRunner } = {}): Promise<Harness> {
  const url = process.env.TEST_DATABASE_URL!;
  const cfg: Config = {
    appUrl: APP_URL,
    databaseUrl: url,
    secret: "test-secret-test-secret-test-secret-1234",
    allowMockProvider: true,
    port: 0,
    storageDir: "",
    healthIntervalMinutes: 0,
    ...extra,
  };
  const { db, close: closeDb } = createDb(url);
  await db.execute(sql`
    do $$ declare r record; begin
      for r in (select tablename from pg_tables where schemaname = 'public' and tablename not like '%drizzle%') loop
        execute 'truncate table "' || r.tablename || '" cascade';
      end loop;
    end $$;`);
  const app = await buildApp(db, cfg, { storage: memoryStorage(), fetch: opts.fetch, ytDlp: opts.ytDlp });
  await app.ready();

  const absorb = (j: Jar, set: unknown) => {
    if (!set) return;
    const map = new Map(j.cookie.split("; ").filter(Boolean).map((c) => c.split("=") as [string, string]));
    for (const c of (Array.isArray(set) ? set : [set]) as string[]) {
      const [k, ...v] = c.split(";")[0]!.split("=");
      const value = v.join("=");
      if (/max-age=0/i.test(c) || value === "") map.delete(k!);
      else map.set(k!, value);
    }
    j.cookie = [...map].map(([k, v]) => `${k}=${v}`).join("; ");
  };
  const call: Harness["call"] = async (j, method, path, body) => {
    const res = await app.inject({
      method,
      url: path,
      headers: { origin: APP_URL, ...(j?.cookie ? { cookie: j.cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      payload: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (j) absorb(j, res.headers["set-cookie"]);
    let json: any = null;
    try {
      json = res.json();
    } catch {
      json = res.body;
    }
    return { status: res.statusCode, json, body: res.body, headers: res.headers };
  };
  const upload: Harness["upload"] = async (j, url, fields, file) => {
    const boundary = "----gemtest" + Math.random().toString(16).slice(2);
    const parts: Buffer[] = [];
    for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`), file.data, Buffer.from(`\r\n--${boundary}--\r\n`));
    const res = await app.inject({ method: "POST", url, headers: { origin: APP_URL, cookie: j.cookie, "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat(parts) });
    let json: any = null;
    try {
      json = res.json();
    } catch {
      json = res.body;
    }
    return { status: res.statusCode, json };
  };
  const settle = async () => {
    for (let i = 0; i < 200; i++) {
      const rows = (await db.execute(sql`select count(*)::int as n from document where status = 'processing'`)) as unknown as { n: number }[];
      if (!rows[0]?.n) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("documents still processing");
  };
  const signIn = (j: Jar, email: string, password: string) => call(j, "POST", "/api/auth/sign-in/email", { email, password });

  const owner = jar();
  expect((await call(owner, "POST", "/api/setup", { orgName: "GEM Labs", name: "Olga Owner", email: "owner@gem.test", password: "correct-horse-battery" })).status).toBe(200);
  const me = await call(owner, "GET", "/api/me");
  const workspaceId = me.json.workspaces[0].id as string;
  const join = async (email: string, name: string) => {
    const inv = await call(owner, "POST", "/api/admin/invites", { email, workspaces: [{ workspaceId, role: "member" }] });
    expect(inv.status).toBe(200);
    const token = inv.json.link.split("/invite/")[1];
    const j = jar();
    expect((await call(j, "POST", `/api/invites/${token}/accept`, { name, password: "member-password-123" })).status).toBe(200);
    const m = await call(j, "GET", "/api/me");
    return { j, id: m.json.user.id as string };
  };
  const a = await join("alice@gem.test", "Alice Engineer");
  const b = await join("bob@gem.test", "Bob Engineer");
  return {
    app,
    db,
    workspaceId,
    owner,
    alice: a.j,
    bob: b.j,
    ids: { owner: me.json.user.id, alice: a.id, bob: b.id },
    call,
    upload,
    settle,
    signIn,
    close: async () => {
      await app.close();
      await closeDb();
    },
  };
}
