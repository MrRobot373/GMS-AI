/**
 * Aatmiq Code is hidden unless the server sets CODE_ENABLED=true: /api/me leaves it out of every section list (so the
 * sidebar and admin switches don't show it) and its API refuses, as if no license included it. The code stays.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";
import { loadConfig } from "./config";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

describe("CODE_ENABLED", () => {
  const base = { DATABASE_URL: "postgres://x/y", APP_SECRET: "s".repeat(40), APP_URL: "http://localhost:3000" };
  it("is off unless set to true", () => {
    expect(loadConfig(base).codeEnabled).toBe(false);
    expect(loadConfig({ ...base, CODE_ENABLED: "false" }).codeEnabled).toBe(false);
    expect(loadConfig({ ...base, CODE_ENABLED: "1" }).codeEnabled).toBe(false);
    expect(loadConfig({ ...base, CODE_ENABLED: "true" }).codeEnabled).toBe(true);
  });
});

d("Code hidden on this server", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ codeEnabled: false });
  }, 60_000);
  afterAll(async () => h?.close());

  it("leaves Code out of what the page is told", async () => {
    const me = (await h.call(h.owner, "GET", "/api/me")).json;
    expect(me.codeEnabled).toBe(false);
    expect(me.license.sections).toEqual(["chat", "work"]);
    for (const w of me.workspaces) expect(w.sections).not.toContain("code");
  });

  it("refuses Code's API, even for the owner", async () => {
    expect((await h.call(h.owner, "GET", "/api/code/status")).json.allowed).toBe(false);
    expect((await h.call(h.owner, "POST", "/api/code/workspaces", { workspaceId: h.workspaceId, name: "x" })).status).toBe(403);
    expect((await h.call(h.owner, "GET", `/api/code/workspaces?workspaceId=${h.workspaceId}`)).status).toBe(403);
  });

  it("leaves Chat and Work AI as they are", async () => {
    expect((await h.call(h.owner, "GET", `/api/workspaces/${h.workspaceId}/models?section=work`)).status).toBe(200);
    expect((await h.call(h.owner, "GET", `/api/chats?workspaceId=${h.workspaceId}`)).status).toBe(200);
  });
});
