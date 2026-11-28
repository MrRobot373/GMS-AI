/**
 * A small client for a running Aatmiq server: sign in, run a Work AI / Super AI task to its end (approving what it
 * asks for), save its events and files, and ask a model a question through the platform's own chat (the judge).
 * Plain Node 22, nothing to install; settings come from the environment so no secret is written anywhere:
 *   AATMIQ_EMAIL, AATMIQ_PASSWORD, AATMIQ_URL (default http://localhost:4000), AATMIQ_ORIGIN (default http://localhost:3000)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clip = (s, n = 200) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const FINAL = new Set(["completed", "failed", "cancelled"]);

export function createClient({ url = process.env.AATMIQ_URL ?? "http://localhost:4000", origin = process.env.AATMIQ_ORIGIN ?? "http://localhost:3000", fetchImpl = fetch } = {}) {
  const API = url.replace(/\/$/, "");
  const ORIGIN = origin.replace(/\/$/, "");
  let cookie = "";
  const absorb = (res) => {
    const set = res.headers.getSetCookie?.() ?? [];
    if (!set.length) return;
    const map = new Map(cookie.split("; ").filter(Boolean).map((c) => [c.split("=")[0], c]));
    for (const c of set) map.set(c.split("=")[0], c.split(";")[0]);
    cookie = [...map.values()].join("; ");
  };
  const headers = (body) => ({ origin: ORIGIN, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) });

  async function call(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetchImpl(API + path, { method, headers: headers(body), body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000) });
        absorb(res);
        const text = await res.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          /* not JSON */
        }
        if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${clip(json?.error ?? json?.message ?? text, 300)}`);
        return json;
      } catch (e) {
        if (attempt >= 3 || /→ \d{3}:/.test(e.message)) throw e;
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  async function bytes(path) {
    const res = await fetchImpl(API + path, { headers: headers(), signal: AbortSignal.timeout(120_000) });
    return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
  }
  /** POST and read a Server-Sent Events answer; returns the joined `delta` text (throws on an `error` event). */
  async function sseText(path, body, timeoutMs = 180_000) {
    const res = await fetchImpl(API + path, { method: "POST", headers: headers(body), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    absorb(res);
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${clip(await res.text(), 300)}`);
    let text = "";
    let buf = "";
    let failed = null;
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let at;
      while ((at = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, at);
        buf = buf.slice(at + 2);
        const event = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (!event || !data) continue;
        let d = {};
        try {
          d = JSON.parse(data);
        } catch {
          /* ignore */
        }
        if (event === "delta") text += d.text ?? "";
        else if (event === "error") failed = d.message ?? "the model failed";
      }
    }
    if (failed) throw new Error(failed);
    return text;
  }

  return {
    API,
    call,
    bytes,
    sseText,
    async signIn(email, password) {
      await call("POST", "/api/auth/sign-in/email", { email, password });
    },
    async workspace(wanted) {
      const me = await call("GET", "/api/me");
      const w = (me.workspaces ?? []).find((x) => !wanted || x.id === wanted || x.name.toLowerCase() === String(wanted).toLowerCase());
      if (!w) throw new Error(`no workspace${wanted ? ` called "${wanted}"` : ""} for this account.`);
      return w;
    },
    /** A model of a section by display name, id or key (tiers included), or null. */
    async model(workspaceId, section, wanted) {
      if (!wanted) return null;
      const models = await call("GET", `/api/workspaces/${workspaceId}/models?section=${section}`);
      const flat = (models ?? []).flatMap((m) => [m, ...(m.tiers ?? []).map((t) => ({ id: t.modelId, displayName: t.displayName }))]);
      const w = String(wanted).toLowerCase();
      const found = flat.find((m) => m.id === wanted || m.displayName?.toLowerCase() === w || m.modelKey?.toLowerCase() === w);
      if (!found) throw new Error(`no ${section} model "${wanted}" in this workspace. Available: ${flat.map((m) => m.displayName).join(", ")}.`);
      return found;
    },
    async info(workspaceId) {
      return call("GET", `/api/work/info?workspaceId=${workspaceId}`);
    },
    /** Ask one question of a chat model (a temporary chat, so nothing is kept in the person's list). */
    async ask(workspaceId, modelId, content) {
      const chat = await call("POST", "/api/chats", { workspaceId, modelId, title: "eval judge", temporary: true });
      try {
        return await sseText(`/api/chats/${chat.id}/messages`, { content, modelId });
      } finally {
        await call("DELETE", `/api/chats/${chat.id}`).catch(() => undefined);
      }
    },
  };
}

/** Summarize a task's events: tool use, errors, the last thing the agent said. */
export function summarize(events) {
  const tools = {};
  let toolErrors = 0;
  let finalAnswer = "";
  for (const e of events) {
    if (e.kind === "tool_call") tools[e.data?.name ?? "?"] = (tools[e.data?.name ?? "?"] ?? 0) + 1;
    else if (e.kind === "tool_result" && e.data?.isError) toolErrors++;
    else if (e.kind === "assistant" && (e.data?.text ?? "").trim()) finalAnswer = e.data.text;
  }
  return { tools, toolErrors, finalAnswer };
}

/**
 * Run one task to its end on one engine and save what it made under `dir` (events.json, result.json, files/).
 * Returns { result, events }. Never throws: a failure of the runner itself is `result.status = "runner_error"`.
 */
export async function runTask({ client, engine, workspaceId, modelId, prompt, timeoutMs, approve = true, dir, log = () => {} }) {
  mkdirSync(join(dir, "files"), { recursive: true });
  const result = { engine, status: "not_started", startedAt: new Date().toISOString(), notes: [], approvals: 0 };
  let events = [];
  try {
    const created = await client.call("POST", "/api/work/tasks", { workspaceId, prompt, ...(modelId ? { modelId } : {}), ...(engine !== "dsh" ? { engine } : {}) });
    result.taskId = created.id;
    log(`task ${created.id}`);
    const approved = new Set();
    const t0 = Date.now();
    let snap;
    for (let errors = 0; ; ) {
      try {
        snap = await client.call("GET", `/api/work/tasks/${created.id}`);
        errors = 0;
      } catch (e) {
        if (++errors > 10) throw e;
        await sleep(4000);
        continue;
      }
      if (approve) {
        const pending = (await client.call("GET", `/api/work/approvals?workspaceId=${workspaceId}`).catch(() => [])).filter((a) => a.taskId === created.id);
        for (const a of pending) {
          if (approved.has(a.id)) continue;
          approved.add(a.id);
          await client.call("POST", `/api/work/approvals/${a.id}`, { decision: "approve" }).catch((e) => result.notes.push(`Approval failed: ${e.message}`));
          result.approvals++;
        }
      }
      if (FINAL.has(snap.task.status)) break;
      if (Date.now() - t0 > timeoutMs) {
        result.timedOut = true;
        await client.call("POST", `/api/work/tasks/${created.id}/cancel`, {}).catch(() => undefined);
        await sleep(3000);
        snap = await client.call("GET", `/api/work/tasks/${created.id}`).catch(() => snap);
        break;
      }
      await sleep(4000);
    }
    await sleep(1500); // the last events are written just before the status changes
    snap = await client.call("GET", `/api/work/tasks/${created.id}`);
    events = snap.events ?? [];
    writeFileSync(join(dir, "events.json"), `${JSON.stringify(events, null, 1)}\n`);
    const t = snap.task;
    const s = summarize(events);
    Object.assign(result, {
      status: result.timedOut ? "timeout" : t.status,
      finishedAt: t.finishedAt ?? new Date().toISOString(),
      inputTokens: t.inputTokens ?? null,
      outputTokens: t.outputTokens ?? null,
      toolCalls: s.tools,
      toolErrors: s.toolErrors,
      finalAnswer: s.finalAnswer || t.result || "",
      error: t.error ?? null,
    });
    result.seconds = Math.round((Date.parse(result.finishedAt) - Date.parse(result.startedAt)) / 100) / 10;
    const listed = await client.call("GET", `/api/work/tasks/${created.id}/files`);
    result.files = [];
    const root = join(dir, "files");
    for (const f of listed.files ?? []) {
      const dest = resolve(root, f.path);
      if (dest !== root && !dest.startsWith(root + sep)) continue; // never write outside the folder
      const r = await client.bytes(`/api/work/tasks/${created.id}/files/content?path=${encodeURIComponent(f.path)}&download=1`);
      if (r.status === 200) {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, r.buf);
      }
      result.files.push({ path: f.path, bytes: f.size, saved: r.status === 200 });
    }
  } catch (e) {
    result.error = result.error ?? clip(e.message, 800);
    result.notes.push(`Runner error: ${clip(e.message, 500)}`);
    if (result.status === "not_started") result.status = "runner_error";
  }
  writeFileSync(join(dir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  return { result, events };
}
