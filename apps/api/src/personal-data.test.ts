/**
 * Personal data: a person downloads everything about them (and an admin can, for them), and an
 * admin erases a person: their things go, shared ones move to a colleague, nothing secret is
 * exported, the activity log keeps what happened under a pseudonym, and usage totals stay right.
 */
import { auditLog, createDb, document, eq, project, skill, sql, usageEvent, user, workTask, type DB } from "@aatmiq/db";
import type { FastifyInstance } from "fastify";
import { unzipSync, strFromU8 } from "fflate";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import type { Config } from "./config";

const url = process.env.TEST_DATABASE_URL;
const APP_URL = "http://localhost:3000";

type Jar = { cookie: string };
const jar = (): Jar => ({ cookie: "" });

(url ? describe : describe.skip)("Personal data: export and erase", () => {
  let app: FastifyInstance;
  let db: DB;
  let close: () => Promise<void>;
  let cfg: Config;
  let workspaceId = "";
  const owner = jar();
  const mira = jar();
  const xavi = jar();
  const ids: Record<string, string> = {};

  async function call(j: Jar, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown) {
    const res = await app.inject({
      method,
      url: path,
      headers: { origin: APP_URL, ...(j.cookie ? { cookie: j.cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      payload: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers["set-cookie"];
    if (set) j.cookie = (Array.isArray(set) ? set : [set]).map((c) => c.split(";")[0]).join("; ");
    let json: any = null;
    try {
      json = res.json();
    } catch {}
    return { status: res.statusCode, json, raw: res.rawPayload, headers: res.headers };
  }
  async function upload(j: Jar, name: string, content: string, scope: "private" | "workspace") {
    const boundary = `----aatmiq${Math.random().toString(16).slice(2)}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="workspaceId"\r\n\r\n${workspaceId}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="scope"\r\n\r\n${scope}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({ method: "POST", url: "/api/documents", headers: { origin: APP_URL, cookie: j.cookie, "content-type": `multipart/form-data; boundary=${boundary}` }, payload: body });
    return res.json().id as string;
  }
  const unzip = (raw: Buffer) => {
    const files = unzipSync(new Uint8Array(raw));
    return { names: Object.keys(files), text: (name: string) => strFromU8(files[name]!), all: Object.values(files).map((f) => strFromU8(f)).join("\n") };
  };

  beforeAll(async () => {
    ({ db, close } = createDb(url!));
    await db.execute(sql`
      do $$ declare r record; begin
        for r in (select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%') loop
          execute 'truncate table "' || r.tablename || '" cascade';
        end loop;
      end $$;`);
    cfg = {
      appUrl: APP_URL,
      databaseUrl: url!,
      secret: "test-secret-test-secret-test-secret-1234",
      allowMockProvider: true,
      port: 0,
      storageDir: await mkdtemp(join(tmpdir(), "aatmiq-pd-files-")),
      workDir: await mkdtemp(join(tmpdir(), "aatmiq-pd-work-")),
    };
    app = await buildApp(db, cfg);
    await call(owner, "POST", "/api/setup", { orgName: "Acme", name: "Olu Owner", email: "owner@acme.test", password: "correct-horse-battery" });
    workspaceId = (await call(owner, "GET", "/api/me")).json.workspaces[0].id;
    for (const [j, email, name] of [[mira, "mira@acme.test", "Mira Shah"], [xavi, "xavi@acme.test", "Xavi Rao"]] as const) {
      const inv = await call(owner, "POST", "/api/admin/invites", { email, workspaces: [{ workspaceId, role: "member" }] });
      await call(j, "POST", `/api/invites/${inv.json.link.split("/invite/")[1]}/accept`, { name, password: "another-good-password" });
      ids[name] = (await call(j, "GET", "/api/me")).json.user.id;
    }

    // Mira's things: a chat, documents (one private, one shared), a project shared with Xavi with
    // a note, a personal skill and an organization one, a schedule, a task with a file, a request.
    const c = await call(mira, "POST", "/api/chats", { workspaceId });
    ids.chat = c.json.id;
    await call(mira, "POST", `/api/chats/${c.json.id}/messages`, { content: "Plan the Diwali party for 40 people" });
    ids.privateDoc = await upload(mira, "salary-slip.txt", "Mira's salary slip: 92,000", "private");
    ids.sharedDoc = await upload(mira, "travel-policy.txt", "Economy class under 6 hours", "workspace");
    const p = await call(mira, "POST", "/api/projects", { workspaceId, name: "Office move", instructions: "Answer as a checklist." });
    ids.project = p.json.id;
    await call(mira, "PUT", `/api/projects/${p.json.id}/members`, { userId: ids["Xavi Rao"], role: "chat" });
    await call(mira, "POST", `/api/projects/${p.json.id}/sources/note`, { title: "Movers", content: "Movers come on 12 March." });
    await call(mira, "POST", "/api/work/skills", { name: "Letters", description: "Our letter format", body: "Start with Dear…", scope: "personal" });
    await db.insert(skill).values({ scope: "org", ownerId: ids["Mira Shah"], slug: "minutes", name: "Meeting minutes", description: "How we write minutes", body: "Date, people, decisions." });
    await call(mira, "POST", "/api/work/schedules", { workspaceId, name: "Monday summary", prompt: "Summarize last week", cron: "0 9 * * 1", timezone: "Asia/Kolkata" });
    const t = await call(mira, "POST", "/api/work/tasks", { workspaceId, prompt: "Make the party budget", start: false });
    ids.task = t.json.id;
    const files = join(cfg.workDir!, t.json.id, "files");
    await mkdir(files, { recursive: true });
    await writeFile(join(files, "budget.csv"), "item,amount\nsweets,4000\n");
    await call(mira, "POST", "/api/token-requests", { workspaceId, amount: 5000, reason: "Party planning" });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await close?.();
  });

  it("a person downloads everything about them, and nothing secret", async () => {
    const r = await call(mira, "GET", "/api/me/export");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("application/zip");
    expect(r.headers["content-disposition"]).toMatch(/^attachment; filename="aatmiq-data-mira-shah-\d{4}-\d{2}-\d{2}\.zip"$/);
    const z = unzip(r.raw);
    expect(z.names).toEqual(
      expect.arrayContaining([
        "README.txt",
        "profile.json",
        "documents.json",
        "documents/salary-slip.txt",
        "documents/travel-policy.txt",
        "documents/Movers.md",
        "projects.json",
        "skills.json",
        "schedules.json",
        "connected-apps.json",
        "code-workspaces.json",
        "token-requests.json",
        "notifications.json",
        "usage.csv",
        "activity-log.json",
      ]),
    );
    const profile = JSON.parse(z.text("profile.json"));
    expect(profile.person).toMatchObject({ name: "Mira Shah", email: "mira@acme.test" });
    expect(profile.signInMethods).toEqual([expect.objectContaining({ method: "password" })]);
    expect(profile.workspaces).toEqual([expect.objectContaining({ workspace: "General", role: "member" })]);
    const chatMd = z.names.find((n) => n.startsWith("chats/") && n.endsWith(".md"))!;
    expect(z.text(chatMd)).toContain("Plan the Diwali party for 40 people");
    expect(z.text("documents/salary-slip.txt")).toBe("Mira's salary slip: 92,000");
    expect(z.text(z.names.find((n) => n.endsWith("files/budget.csv"))!)).toContain("sweets,4000");
    expect(JSON.parse(z.text("projects.json")).owned[0]).toMatchObject({ name: "Office move", instructions: "Answer as a checklist." });
    expect(JSON.parse(z.text("skills.json")).map((s: { name: string }) => s.name).sort()).toEqual(["Letters", "Meeting minutes"]);
    expect(JSON.parse(z.text("token-requests.json"))[0]).toMatchObject({ amount: 5000, reason: "Party planning" });
    expect(z.text("usage.csv").split("\n").length).toBeGreaterThan(1);
    // No password hash, no session token, nobody else's things.
    const [secret] = (await db.execute(sql`select a.password from account a join "user" u on u.id = a.user_id where u.email = 'mira@acme.test'`)) as unknown as { password: string }[];
    const [signedIn] = (await db.execute(sql`select s.token from session s join "user" u on u.id = s.user_id where u.email = 'mira@acme.test' limit 1`)) as unknown as { token: string }[];
    expect(secret!.password.length).toBeGreaterThan(20);
    expect(z.all).not.toContain(secret!.password);
    expect(z.all).not.toContain(signedIn!.token);
    expect(z.all).not.toContain("owner@acme.test");
    const log = await db.select().from(auditLog).where(eq(auditLog.action, "user.data_exported"));
    expect(log).toHaveLength(1);
  });

  it("an admin can download it for them; nobody else can", async () => {
    expect((await call(xavi, "GET", `/api/admin/users/${ids["Mira Shah"]}/export`)).status).toBe(403);
    const r = await call(owner, "GET", `/api/admin/users/${ids["Mira Shah"]}/export`);
    expect(r.status).toBe(200);
    expect(JSON.parse(unzip(r.raw).text("profile.json")).person.email).toBe("mira@acme.test");
  });

  it("erasing asks for the email, and never takes the owner or yourself", async () => {
    expect((await call(xavi, "POST", `/api/admin/users/${ids["Mira Shah"]}/erase`, { confirmEmail: "mira@acme.test" })).status).toBe(403);
    expect((await call(owner, "POST", `/api/admin/users/${ids["Mira Shah"]}/erase`, { confirmEmail: "someone@acme.test" })).status).toBe(400);
    const me = (await call(owner, "GET", "/api/me")).json.user.id;
    expect((await call(owner, "POST", `/api/admin/users/${me}/erase`, { confirmEmail: "owner@acme.test" })).status).toBe(403);
    expect((await call(owner, "POST", `/api/admin/users/${ids["Mira Shah"]}/erase`, { confirmEmail: "mira@acme.test", transferTo: ids["Mira Shah"] })).status).toBe(400);
  });

  it("erases a person: their things go, shared ones move to a colleague, the log keeps a pseudonym", async () => {
    const miraId = ids["Mira Shah"]!;
    const [privateDoc] = await db.select().from(document).where(eq(document.id, ids.privateDoc!));
    const usageBefore = await db.select({ n: sql<number>`count(*)::int` }).from(usageEvent);
    const r = await call(owner, "POST", `/api/admin/users/${miraId}/erase`, { confirmEmail: "MIRA@acme.test", transferTo: ids["Xavi Rao"] });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ chats: 1, documentsDeleted: 1, documentsTransferred: 2, projectsTransferred: 1, projectsDeleted: 0, tasks: 1 });

    // Gone: the account, its sessions, chats, the private document and its file, the task folder.
    expect(await db.select().from(user).where(eq(user.id, miraId))).toHaveLength(0);
    expect((await call(mira, "GET", "/api/me")).status).toBe(401);
    expect((await call(owner, "GET", `/api/chats/${ids.chat}`)).status).toBe(404);
    expect(await db.select().from(document).where(eq(document.id, ids.privateDoc!))).toHaveLength(0);
    expect(existsSync(join(cfg.storageDir!, privateDoc!.storageKey))).toBe(false);
    expect(await db.select().from(workTask).where(eq(workTask.id, ids.task!))).toHaveLength(0);
    expect(existsSync(join(cfg.workDir!, ids.task!))).toBe(false);

    // Moved to Xavi: the shared document, the project (with its note) and the organization skill.
    const [shared] = await db.select().from(document).where(eq(document.id, ids.sharedDoc!));
    expect(shared!.ownerId).toBe(ids["Xavi Rao"]);
    const [p] = await db.select().from(project).where(eq(project.id, ids.project!));
    expect(p!.ownerId).toBe(ids["Xavi Rao"]);
    expect((await call(xavi, "GET", `/api/projects/${ids.project}`)).json).toMatchObject({ role: "owner" });
    const [orgSkill] = await db.select().from(skill).where(eq(skill.slug, "minutes"));
    expect(orgSkill!.ownerId).toBe(ids["Xavi Rao"]);

    // Usage stays in the totals, without a name.
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(usageEvent))[0]!.n).toBe(usageBefore[0]!.n);
    expect((await db.select().from(usageEvent).where(eq(usageEvent.userId, miraId))).length).toBe(0);

    // The activity log: what happened stays, the email doesn't.
    const log = await db.select().from(auditLog);
    expect(JSON.stringify(log)).not.toContain("mira@acme.test");
    expect(log.filter((e) => e.actorEmail?.startsWith("erased-")).length).toBeGreaterThan(0);
    expect(log.find((e) => e.action === "user.erased")).toMatchObject({ targetId: miraId, meta: expect.objectContaining({ transferredTo: "Xavi Rao" }) });
    // The seat is free again: the person no longer appears in the user list.
    expect(((await call(owner, "GET", "/api/admin/users")).json as { email: string }[]).map((u) => u.email)).not.toContain("mira@acme.test");
  });

  it("without someone to receive them, shared projects and documents are deleted too", async () => {
    const pid = (await call(xavi, "POST", "/api/projects", { workspaceId, name: "Xavi's notes" })).json.id;
    const doc = await upload(xavi, "rates.txt", "Hotel rates", "workspace");
    const r = await call(owner, "POST", `/api/admin/users/${ids["Xavi Rao"]}/erase`, { confirmEmail: "xavi@acme.test" });
    expect(r.json).toMatchObject({ projectsDeleted: 2, documentsDeleted: 3, documentsTransferred: 0 });
    expect(await db.select().from(project).where(eq(project.id, pid))).toHaveLength(0);
    expect(await db.select().from(document).where(eq(document.id, doc))).toHaveLength(0);
    // Organization skills stay with the organization: the admin who erased gets them.
    const [orgSkill] = await db.select().from(skill).where(eq(skill.slug, "minutes"));
    expect(orgSkill!.ownerId).toBe((await call(owner, "GET", "/api/me")).json.user.id);
    expect(await readdir(cfg.storageDir!, { recursive: true }).then((f) => f.filter((x) => x.endsWith(".txt")))).toHaveLength(0);
  });
});
