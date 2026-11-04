/**
 * Super AI's engine, for real: the Claude Code binary, started by our adapter, talking to our
 * Anthropic-format route, which answers from a model server (here a scripted one).
 */
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeAvailable, createClaudeEngine, type HarnessEvent } from "@aatmiq/harness";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workAnthropicRoutes } from "./routes/work-anthropic";

const TOKEN = "task-token-1";
const have = await claudeAvailable();

type Msg = { role: string; content?: unknown; tool_calls?: { function: { name: string; arguments: string } }[] };
const requests: { messages: Msg[]; tools?: { function: { name: string } }[]; stream?: boolean; max_tokens?: number }[] = [];
let workdir = "";
let base = "";
const approvals: { toolName: string; reason: string }[] = [];
let approve = true;

/** A scripted model: reads the conversation and answers like a tool-using agent would. */
function scripted(body: (typeof requests)[number]): { text?: string; call?: { name: string; args: unknown } } {
  const msgs = body.messages;
  const tools = (body.tools ?? []).map((t) => t.function.name);
  // The person's message comes with Claude Code's own reminders in the same turn: look at all of it.
  const ask = msgs.filter((m) => m.role === "user").map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""))).join("\n");
  if (process.env.DEBUG_EVENTS) console.log("REQUEST", tools.join(","), "|", msgs.map((m) => `${m.role}:${(typeof m.content === "string" ? m.content : JSON.stringify(m.content)).slice(0, 90).replace(/\n/g, " ")}`).join(" || "));
  const results = msgs.filter((m) => m.role === "tool");
  const done = results.length;
  // A one-line title or other side request Claude Code makes: just answer.
  if (!tools.includes("Write") && !tools.includes("Bash")) return { text: "ok" };
  if (/make hello/i.test(ask)) {
    if (done === 0) return { call: { name: "Write", args: { file_path: join(workdir, "hello.txt"), content: "hello from claude code\n" } } };
    return { text: "I created hello.txt." };
  }
  if (/remove it/i.test(ask)) {
    if (done === 0) return { call: { name: "Bash", args: { command: "rm hello.txt", description: "Delete the file" } } };
    return { text: `Done: ${String(results.at(-1)?.content ?? "").slice(0, 80)}` };
  }
  return { text: "Hello." };
}

const app = Fastify();
beforeAll(async () => {
  workdir = await mkdtemp(join(tmpdir(), "claude-engine-"));
  // The OpenAI-format route next door: the scripted model.
  app.post("/api/internal/work/llm/v1/chat/completions", async (req, reply) => {
    const body = req.body as (typeof requests)[number];
    requests.push(body);
    const a = scripted(body);
    const sse = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
    reply.raw.writeHead(200, { "content-type": "text/event-stream" });
    if (a.call) {
      reply.raw.write(sse({ choices: [{ delta: { role: "assistant", tool_calls: [{ index: 0, id: `call_${requests.length}`, type: "function", function: { name: a.call.name, arguments: "" } }] } }] }));
      reply.raw.write(sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(a.call.args) } }] } }] }));
      reply.raw.write(sse({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }));
    } else {
      reply.raw.write(sse({ choices: [{ delta: { role: "assistant", content: a.text } }] }));
      reply.raw.write(sse({ choices: [{ delta: {}, finish_reason: "stop" }] }));
    }
    reply.raw.write(sse({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 10 } }));
    reply.raw.end("data: [DONE]\n\n");
    return reply;
  });
  app.post("/api/internal/work/approvals", async (req) => {
    approvals.push(req.body as { toolName: string; reason: string });
    return { id: "a1" };
  });
  app.get("/api/internal/work/approvals/:id", async () => ({ status: approve ? "approved" : "rejected" }));
  const ctx = { work: { fromToken: (t: string) => (t === TOKEN ? { taskId: "t1", userId: "u1", workspaceId: "w1" } : null) } } as never;
  await workAnthropicRoutes(app, ctx);
  base = await app.listen({ port: 0, host: "127.0.0.1" });
});
afterAll(async () => app.close());

async function run(prompts: string[], events: HarnessEvent[], mutate: (s: Parameters<ReturnType<typeof createClaudeEngine>["start"]>[0]) => void = () => undefined) {
  const spec = {
    taskId: "t1",
    workdir,
    homeDir: join(workdir, "..", `home-${Math.random().toString(36).slice(2)}`),
    model: { key: "fake", name: "Fake", contextWindow: 32768 },
    controlUrl: `${base}/api/internal/work`,
    token: TOKEN,
    approvals: "risky" as const,
    askForNetwork: false,
    webSearch: false,
    skillsDir: null,
    connectors: [],
    productName: "Aatmiq",
  };
  mutate(spec);
  let turns = 0;
  const waiters: (() => void)[] = [];
  const runtime = await createClaudeEngine().start(spec, (e) => {
    events.push(e);
    if (e.type === "turn_end") {
      turns++;
      waiters.splice(0).forEach((w) => w());
    }
  });
  for (const [i, p] of prompts.entries()) {
    await runtime.send(p);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`turn ${i + 1} didn't end; events: ${JSON.stringify(events.map((e) => e.type))}`)), 100_000);
      const check = () => (turns > i ? (clearTimeout(t), resolve()) : waiters.push(check));
      check();
    });
  }
  await runtime.stop();
  if (process.env.DEBUG_EVENTS) console.log(JSON.stringify(events, null, 1).slice(0, 4000));
  return runtime;
}

(have ? describe : describe.skip)("the Claude Code engine", () => {
  it("runs a task: the model asks for a tool, Claude Code runs it in the folder, the answer comes back as events", async () => {
    const events: HarnessEvent[] = [];
    await run(["Please make hello.txt"], events);
    expect(await readFile(join(workdir, "hello.txt"), "utf8")).toBe("hello from claude code\n");
    const types = events.map((e) => e.type);
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_result");
    expect(events.find((e) => e.type === "tool_call")).toMatchObject({ name: "write", args: { file_path: join(workdir, "hello.txt") } });
    const end = events.find((e) => e.type === "turn_end");
    expect(end).toMatchObject({ reason: "completed" });
    expect(events.filter((e) => e.type === "assistant").map((e) => (e as { text: string }).text).join(" ")).toContain("I created hello.txt");
    // The model was asked in Claude Code's own words, with its own tools and our brief.
    const first = requests.find((r) => r.tools?.some((t) => t.function.name === "Write"))!;
    expect(first.tools!.map((t) => t.function.name)).toEqual(expect.arrayContaining(["Bash", "Read", "Write", "Edit", "Skill"]));
    for (const unwanted of ["WebSearch", "WebFetch", "CronCreate", "EnterWorktree", "ScheduleWakeup", "AskUserQuestion"]) expect(first.tools!.map((t) => t.function.name)).not.toContain(unwanted);
    expect(JSON.stringify(first.messages[0])).toContain("Your working folder is");
  }, 120_000);

  it("lists the skill library to the model, so it can choose one (and the Skill tool is there to load it)", async () => {
    const skills = await mkdtemp(join(tmpdir(), "claude-skills-"));
    await mkdir(join(skills, "word-documents"), { recursive: true });
    await writeFile(join(skills, "word-documents", "SKILL.md"), '---\nname: word-documents\ndescription: "Use when creating or editing Word documents (.docx): reports with a real contents page."\n---\n\n# Word documents\n\nBody.\n');
    const before = requests.length;
    await run(["Say hello"], [], (spec) => void (spec.skillsDir = skills));
    const first = requests.slice(before).find((r) => r.tools?.some((t) => t.function.name === "Write"))!;
    // Claude Code lists skills in its own words, in the messages or in the Skill tool's description.
    const everything = JSON.stringify([first.messages, first.tools]);
    if (process.env.DEBUG_EVENTS) console.log("SKILLTOOL", JSON.stringify(first.tools!.find((t) => t.function.name === "Skill")).slice(0, 1500), "\nMSGS", JSON.stringify(first.messages).match(/.{200}word-documents.{300}/)?.[0]);
    expect(first.tools!.map((t) => t.function.name)).toContain("Skill");
    expect(everything).toContain("word-documents");
    expect(everything).toContain("real contents page");
    // Claude Code's own built-in skills are not offered.
    expect(everything).not.toContain("plugin-authoring");
    expect(everything).not.toContain("dataviz");
  }, 120_000);

  it("asks a person before a risky command, and carries on when they say no", async () => {
    approve = false;
    const events: HarnessEvent[] = [];
    await run(["Please remove it"], events);
    expect(approvals).toEqual([expect.objectContaining({ toolName: "bash", reason: "Deletes files" })]);
    // Refused: the file is still there, and the step reads as "not run".
    expect(await readFile(join(workdir, "hello.txt"), "utf8")).toContain("hello");
    expect(events.find((e) => e.type === "tool_result")).toMatchObject({ isError: true });
    approve = true;
  }, 120_000);
});
