/**
 * Tools in chat (services/chat-tools.ts, routes/chat.ts): the model searches the web, reads a page and searches the
 * person's documents on its own, step by step, against a real Postgres (TEST_DATABASE_URL), a scripted model server that
 * answers with tool calls, and a fake SearXNG. What it found is numbered with the answer's sources and saved; what it said
 * before calling a tool isn't part of the answer; it gets at most MAX_TOOL_ROUNDS rounds, then answers without tools; a
 * private page is never read; nothing goes to the web where the organization hasn't allowed web search in chat.
 */
import { eq, message } from "@aatmiq/db";
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";
import { approvalWait } from "./services/chat-connectors";
import { MAX_TOOL_ROUNDS, MAX_WEB_SEARCHES, onlyAnnounces, RESEARCH_ROUNDS } from "./services/chat-tools";
import { clearWebSearchCache } from "./services/web-search";
import type { YtDlpRunner } from "./services/youtube";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const page = (path: string) => `<!doctype html><html><body><main><h1>Page ${path}</h1><p>Text of ${path}: the TPS54331 switches at 570 kHz.</p></main></body></html>`;

function fakeWeb() {
  const searches: string[] = [];
  const pages: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    const u = new URL(String(input));
    if (u.host === "searx.test") {
      const q = u.searchParams.get("q") ?? "";
      searches.push(q);
      return Response.json({
        results: [
          { url: "https://docs.example.org/a1", title: "TPS54331 datasheet", content: "Snippet: 3.5 A buck converter" },
          { url: "https://docs.example.org/a2", title: "Buck converter basics", content: "Snippet: basics" },
        ],
      });
    }
    pages.push(u.host + u.pathname);
    if (u.host === "docs.example.org") return new Response(page(u.pathname), { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetchFn, searches, pages };
}
const DNS: Record<string, string[]> = { "docs.example.org": ["93.184.216.34"], "inner.example.org": ["10.1.2.3"] };
const resolve = async (host: string) => {
  const a = DNS[host];
  if (!a) throw new Error("ENOTFOUND");
  return a;
};
const events = (body: string) => [...body.matchAll(/event: (\w+)\ndata: (.*)\n/g)].map((m) => ({ event: m[1]!, data: JSON.parse(m[2]!) }));

type Req = { tools: string[]; messages: { role: string; content: string; tool_call_id?: string }[]; body: Record<string, unknown> };

d("tools in chat", () => {
  let h: Harness;
  let server: Server;
  const web = fakeWeb();
  const noYtDlp: YtDlpRunner = async () => ({ code: 127, stdout: "", stderr: "not installed" });
  const seen: Req[] = [];
  let modelId = "";

  /** The scripted model: what it does next depends on the person's message and on the tool results so far. */
  function next(r: Req): { text?: string; reasoning?: string; call?: { name: string; args: object } } {
    const user = r.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    const results = r.messages.filter((m) => m.role === "tool").map((m) => m.content);
    const cited = [...results.join("\n").matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1]));
    // Uses a tool, then goes quiet; with no tools offered (the wrap-up) it writes the answer.
    if (r.messages.some((m) => m.role === "user" && m.content.includes("QUIET"))) {
      if (r.tools.length && results.length === 0) return { call: { name: "web_search", args: { query: "x" } } };
      if (r.tools.length) return { text: "" };
      return { text: "I searched once; nothing useful came back." };
    }
    if (user.includes("THINK")) return { reasoning: "91 = 7 × 13, so it isn't prime.", text: "No: 91 = 7 × 13." };
    if (!r.tools.length) return { text: cited.length ? `From what I found: 570 kHz [${cited[0]}][${cited.at(-1)}]. Invented [99].` : "Answered without tools." };
    if (user.includes("LOOP")) return { call: { name: "web_search", args: { query: `again ${results.length}` } } };
    if (user.includes("WEB") || user.includes("NOTE") || user.includes("PAGE")) {
      if (results.some((x) => x.startsWith("Not run:"))) return { text: "From what I know, about 570 kHz; that may be out of date." };
      if (user.includes("PAGE")) return results.length ? { text: `The page says 570 kHz [${cited[0]}].` } : { call: { name: "read_page", args: { url: "https://docs.example.org/a1" } } };
      if (user.includes("NOTE")) return results.length ? { text: "I have enough verified material." } : { call: { name: "web_search", args: { query: "TPS54331" } } };
      if (results.length === 0) return { text: "Let me look that up. ", call: { name: "web_search", args: { query: "TPS54331 switching frequency" } } };
      if (results.length === 1) return { call: { name: "read_page", args: { url: "https://docs.example.org/a1" } } };
      if (results.length === 2) return { call: { name: "read_page", args: { url: "https://inner.example.org/secret" } } };
      return { text: `The TPS54331 switches at 570 kHz [${cited[0]}][${cited.at(-1)}]. Invented [99].` };
    }
    if (user.includes("DOCS")) {
      if (results.length === 0) return { call: { name: "search_documents", args: { query: "converter switching frequency" } } };
      return { text: `Our converter switches at 250 kHz [${cited[0]}].` };
    }
    return { text: "Hello! How can I help?" };
  }

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        if (req.url === "/v1/models") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [] }));
        const body = JSON.parse(raw || "{}");
        const r: Req = { tools: (body.tools ?? []).map((t: any) => t.function.name), messages: body.messages ?? [], body };
        seen.push(r);
        const out = next(r);
        res.writeHead(200, { "content-type": "text/event-stream" });
        if (out.reasoning) for (const piece of out.reasoning.split(" ")) res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: `${piece} ` } }] })}\n\n`);
        if (out.text) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: out.text } }] })}\n\n`);
        if (out.call)
          res.write(
            `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: `c${seen.length}`, type: "function", function: { name: out.call.name, arguments: JSON.stringify(out.call.args) } }] } }] })}\n\n`,
          );
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: out.call ? "tool_calls" : "stop" }], usage: { prompt_tokens: 40, completion_tokens: 12 } })}\n\n`);
        res.end("data: [DONE]\n\n");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    h = await startHarness({ webSearch: { provider: null, url: null, key: null } }, { fetch: web.fetchFn, resolve, ytDlp: noYtDlp });
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Model server", type: "openai_compatible", baseUrl: base });
    modelId = (await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: "std-1", displayName: "std-1", contextLength: 65536, tier: "standard", thinkingSwitch: false, vision: false, sections: ["chat"] })).json.id;
    expect((await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: [modelId], defaultModelId: modelId })).status).toBe(200);
  }, 60_000);
  afterAll(async () => {
    await h?.close();
    await new Promise<void>((r) => server?.close(() => r()));
  });
  afterEach(() => {
    clearWebSearchCache();
    web.searches.length = 0;
    web.pages.length = 0;
  });

  /** Ask in a new chat. `approve`: how the person answers when asked to allow web search (the switch is off). */
  async function ask(content: string, o: { approve?: boolean; extra?: Record<string, unknown> } = {}) {
    const chatId = (await h.call(h.alice, "POST", "/api/chats", { workspaceId: h.workspaceId, modelId })).json.id as string;
    const before = seen.length;
    let done = false;
    const asked: { kind?: string; tool: string }[] = [];
    const answering = (async () => {
      while (!done && o.approve !== undefined) {
        for (const a of (await h.call(h.alice, "GET", `/api/chats/${chatId}/approvals`)).json.approvals ?? []) {
          asked.push(a);
          await h.call(h.alice, "POST", `/api/chats/${chatId}/approvals/${a.id}`, { approve: o.approve });
        }
        await new Promise((res) => setTimeout(res, 30));
      }
    })();
    const r = await h.call(h.alice, "POST", `/api/chats/${chatId}/messages`, { content, modelId, ...o.extra });
    done = true;
    await answering;
    expect(r.status).toBe(200);
    const saved = (await h.db.select().from(message).where(eq(message.chatId, chatId))).find((m) => m.role === "assistant")!;
    // Only this chat's requests: a late one from an earlier test (a title, say) isn't counted.
    const sent = seen.slice(before).filter((s) => s.messages.some((m) => m.role === "user" && String(m.content).includes(content)));
    return { ev: events(r.body), saved, sent, asked };
  }

  it("tells the model to make what was asked in this answer, not stop to ask", async () => {
    const r = await ask("hello");
    expect(String(r.sent[0]!.messages[0]!.content)).toMatch(/make it in this answer: research briefly/);
  });

  it("without web search allowed, offers documents and calculators but not the web", async () => {
    const r = await ask("Hi there");
    expect(r.sent[0]!.tools).toEqual(expect.arrayContaining(["search_documents", "calculators_search", "calculators_run"]));
    expect(r.sent[0]!.tools).not.toContain("web_search");
    expect(r.saved.content).toBe("Hello! How can I help?");
    expect(r.ev.some((e) => e.event === "step")).toBe(false);
  });

  it("searches, reads pages on its own, cites what it found, and never reads a private page", async () => {
    expect((await h.call(h.owner, "PUT", "/api/admin/gem", { webProvider: "searxng", webUrl: "http://searx.test" })).status).toBe(200);
    const r = await ask("WEB: what frequency does the TPS54331 switch at?", { approve: true });
    expect(r.sent[0]!.tools).toEqual(expect.arrayContaining(["web_search", "read_page", "search_documents"]));
    expect(r.sent[0]!.messages[0]!.content).toMatch(/web_search and read_page/);
    expect(web.searches).toEqual(["TPS54331 switching frequency"]);
    expect(web.pages).toEqual(["docs.example.org/a1"]);
    // The steps, in order: each starts, then ends with what it found.
    const steps = r.ev.filter((e) => e.event === "step").map((e) => [e.data.tool, e.data.running, e.data.outcome ?? null]);
    expect(steps).toEqual([
      ["web_search", true, null],
      ["web_search", false, "2"],
      ["read_page", true, null],
      ["read_page", false, null],
      ["read_page", true, null],
      ["read_page", false, "failed"],
    ]);
    // "Let me look that up." was taken back, and the invented [99] taken out.
    expect(r.ev.some((e) => e.event === "retract" && e.data.chars === "Let me look that up. ".length)).toBe(true);
    expect(r.saved.content).toBe("The TPS54331 switches at 570 kHz [1][3]. Invented.");
    expect(r.saved.citations!.map((c) => [c.n, c.kind, c.url])).toEqual([
      [1, "web", "https://docs.example.org/a1"],
      [2, "web", "https://docs.example.org/a2"],
      [3, "web", "https://docs.example.org/a1"],
    ]);
    expect(r.saved.web).toEqual({ queries: ["TPS54331 switching frequency"], provider: "searxng", note: null });
    // The page reached the model as data, after a search result.
    const read = r.sent[2]!.messages.filter((m) => m.role === "tool").at(-1)!.content;
    expect(read).toContain("Text of /a1: the TPS54331 switches at 570 kHz.");
  });

  it("searches the person's documents, only what they may open", async () => {
    const up = await h.upload(h.alice, "/api/documents", { workspaceId: h.workspaceId }, { name: "converter-notes.txt", type: "text/plain", data: Buffer.from("Design notes. Our converter switching frequency is 250 kHz.") });
    expect(up.status).toBe(200);
    await h.upload(h.bob, "/api/documents", { workspaceId: h.workspaceId }, { name: "bob-private.txt", type: "text/plain", data: Buffer.from("Bob's converter switching frequency is 900 kHz.") });
    await h.settle();
    const r = await ask("DOCS: what does our converter switch at?");
    const result = r.sent[1]!.messages.filter((m) => m.role === "tool")[0]!.content;
    expect(result).toContain("converter-notes.txt");
    expect(result).not.toContain("bob-private");
    expect(r.saved.content).toBe("Our converter switches at 250 kHz [1].");
    expect(r.saved.citations![0]).toMatchObject({ n: 1, kind: "document", name: "converter-notes.txt" });
  });

  it("in a project's chat, searches the library and that project, not the person's other projects", async () => {
    const pa = (await h.call(h.alice, "POST", "/api/projects", { workspaceId: h.workspaceId, name: "Converter A" })).json.id;
    const pb = (await h.call(h.alice, "POST", "/api/projects", { workspaceId: h.workspaceId, name: "Converter B" })).json.id;
    await h.call(h.alice, "POST", `/api/projects/${pa}/sources/note`, { title: "A spec", content: "Project A converter switching frequency is 300 kHz." });
    await h.call(h.alice, "POST", `/api/projects/${pb}/sources/note`, { title: "B spec", content: "Project B converter switching frequency is 777 kHz." });
    await h.settle();
    const toolText = async (projectId?: string) => {
      const chatId = (await h.call(h.alice, "POST", "/api/chats", { workspaceId: h.workspaceId, modelId, ...(projectId && { projectId }) })).json.id as string;
      const before = seen.length;
      await h.call(h.alice, "POST", `/api/chats/${chatId}/messages`, { content: "DOCS: what does our converter switch at?", modelId });
      return seen.slice(before).flatMap((r) => r.messages.filter((m) => m.role === "tool").map((m) => m.content)).join("\n");
    };
    const inA = await toolText(pa);
    expect(inA).not.toContain("777 kHz");
    expect(inA).toContain("converter-notes.txt");
    // Outside a project, the person's projects are all in reach.
    expect(await toolText()).toContain("777 kHz");
  }, 30_000);

  it("deep research: the research brief, more rounds, and it needs web search", async () => {
    const chatId = (await h.call(h.alice, "POST", "/api/chats", { workspaceId: h.workspaceId, modelId })).json.id as string;
    const before = seen.length;
    const r = await h.call(h.alice, "POST", `/api/chats/${chatId}/messages`, { content: "LOOP: compare buck regulators", modelId, research: true });
    expect(r.status).toBe(200);
    const sent = seen.slice(before);
    expect(sent[0]!.messages[0]!.content).toMatch(/DEEP RESEARCH/);
    expect(sent).toHaveLength(RESEARCH_ROUNDS + 1);
    expect(sent.at(-1)!.tools).toEqual([]);
    // Done: the chat no longer says a research is running.
    expect((await h.call(h.alice, "GET", `/api/chats/${chatId}`)).json.researching).toBe(false);
    // Without web search there's nothing to research with.
    expect((await h.call(h.owner, "PUT", "/api/admin/gem", { chatWebSearch: false })).status).toBe(200);
    const off = await h.call(h.alice, "POST", `/api/chats/${chatId}/messages`, { content: "again", modelId, research: true });
    expect(off.status).toBe(400);
    expect(off.json.error).toMatch(/needs web search/);
    expect((await h.call(h.owner, "PUT", "/api/admin/gem", { chatWebSearch: true })).status).toBe(200);
  }, 60_000);

  it("when the model used tools and then wrote nothing, asks once more for the write-up", async () => {
    const r = await ask("QUIET: look something up", { approve: true });
    expect(r.saved.content).toBe("I searched once; nothing useful came back.");
    expect(r.sent.at(-1)!.tools).toEqual([]);
    expect(r.sent.at(-1)!.messages.at(-1)!.content).toMatch(/haven't given the answer yet/);
  });

  it("shows the model's thinking as it comes and keeps it with the answer, apart from it", async () => {
    const r = await ask("THINK: is 91 prime?");
    const thought = r.ev.filter((e) => e.event === "reasoning").map((e) => e.data.text).join("");
    expect(thought.trim()).toBe("91 = 7 × 13, so it isn't prime.");
    expect(r.saved.reasoning?.trim()).toBe("91 = 7 × 13, so it isn't prime.");
    expect(r.saved.content).toBe("No: 91 = 7 × 13.");
  });

  it("with the switch off, asks before searching the web: allowed, it searches; declined, it answers from what it knows", async () => {
    const yes = await ask("WEB: what frequency does the TPS54331 switch at?", { approve: true });
    expect(yes.asked).toEqual([expect.objectContaining({ kind: "web", tool: "TPS54331 switching frequency" })]);
    expect(yes.sent[0]!.messages[0]!.content).toMatch(/so the app asks them before your first search/);
    expect(web.searches).toEqual(["TPS54331 switching frequency"]);
    expect(yes.ev.filter((e) => e.event === "approval_done").map((e) => e.data.decision)).toEqual(["approved"]);
    web.searches.length = 0;
    web.pages.length = 0;
    const no = await ask("WEB: what frequency does the TPS54331 switch at?", { approve: false });
    expect(no.asked).toHaveLength(1);
    expect(web.searches).toEqual([]);
    expect(web.pages).toEqual([]);
    expect(no.saved.steps).toEqual([{ tool: "web_search", detail: "TPS54331 switching frequency", outcome: "declined" }]);
    expect(no.saved.content).toBe("From what I know, about 570 kHz; that may be out of date.");
    // With the switch on, nobody is asked.
    const on = await ask("WEB: what frequency does the TPS54331 switch at?", { approve: false, extra: { webSearch: true } });
    expect(on.asked).toEqual([]);
    expect(on.sent.at(-1)!.messages[0]!.content).not.toMatch(/so the app asks them/);
  }, 30_000);

  it("a request to search that nobody answers isn't a decline: the model is told so, and so is the person", async () => {
    const wait = approvalWait.ms;
    approvalWait.ms = 300;
    try {
      const r = await ask("WEB: what frequency does the TPS54331 switch at?");
      expect(r.ev.filter((e) => e.event === "approval")).toHaveLength(1);
      expect(r.ev.filter((e) => e.event === "approval_done").map((e) => e.data.decision)).toEqual(["expired"]);
      expect(web.searches).toEqual([]);
      expect(r.saved.steps).toEqual([{ tool: "web_search", detail: "TPS54331 switching frequency", outcome: "unanswered" }]);
      const told = r.sent.at(-1)!.messages.filter((m) => m.role === "tool").map((m) => m.content).join(" ");
      expect(told).toContain("didn't answer the request to search the web in time (they didn't decline it");
      expect(told).not.toContain("chose not to");
    } finally {
      approvalWait.ms = wait;
    }
  }, 30_000);

  it("reads a page the person gave without asking", async () => {
    const r = await ask("PAGE: read https://docs.example.org/a1 and tell me the frequency", { approve: false });
    expect(r.asked).toEqual([]);
    expect(web.pages).toEqual(["docs.example.org/a1"]);
    expect(r.saved.content).toBe("The page says 570 kHz [1].");
  });

  it("a reply that only says it's about to answer is replaced by the answer", async () => {
    const r = await ask("NOTE: find the TPS54331 frequency", { approve: true });
    expect(r.ev.some((e) => e.event === "retract" && e.data.chars === "I have enough verified material.".length)).toBe(true);
    expect(r.saved.content).not.toContain("I have enough");
    expect(r.saved.content).toMatch(/^From what I found: 570 kHz/);
    expect(onlyAnnounces("Let me now write the report:")).toBe(true);
    expect(onlyAnnounces("I'll now compile the essay.")).toBe(true);
    expect(onlyAnnounces("")).toBe(true);
    expect(onlyAnnounces("The TPS54331 switches at 570 kHz [1].")).toBe(false);
    expect(onlyAnnounces("I couldn't find a datasheet for that part.")).toBe(false);
  });

  it("thinks only when the person switches Think on, whatever the model", async () => {
    const on = await ask("THINK: is 91 prime?", { extra: { thinking: true } });
    expect(on.sent[0]!.body).toMatchObject({ chat_template_kwargs: { enable_thinking: true } });
    expect(on.saved.reasoning?.trim()).toBe("91 = 7 × 13, so it isn't prime.");
    const off = await ask("THINK: is 91 prime?", { extra: { thinking: false } });
    expect(off.sent[0]!.body).toMatchObject({ chat_template_kwargs: { enable_thinking: false } });
    // A model that thinks anyway isn't shown thinking.
    expect(off.ev.some((e) => e.event === "reasoning" || e.event === "thinking")).toBe(false);
    expect(off.saved.reasoning).toBeNull();
    expect(off.saved.content).toBe("No: 91 = 7 × 13.");
  });

  it("stops after the last round and answers from what it has", async () => {
    const r = await ask("LOOP forever", { approve: true });
    // Searches stop at the limit; the rest are marked, not run.
    expect(web.searches).toHaveLength(MAX_WEB_SEARCHES);
    const steps = r.saved.steps ?? [];
    expect(steps.filter((x) => x.tool === "web_search" && x.outcome === "limit").length).toBe(MAX_TOOL_ROUNDS - MAX_WEB_SEARCHES);
    expect(r.sent).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(r.sent.at(-1)!.tools).toEqual([]);
    expect(r.saved.content).toMatch(/^From what I found: 570 kHz \[1\]\[\d+\]\. Invented\.$/);
    // The last request says to deliver what was asked now, not report progress or ask to go ahead.
    expect(r.sent.at(-1)!.messages.at(-1)!.content).toMatch(/No more tools: answer now.*write it in full/);
  }, 30_000);
});
