/**
 * Python in chat (services/chat-sandbox.ts, the run_python tool, the chat-folder routes) against a real Postgres
 * (TEST_DATABASE_URL) and a scripted model that answers with run_python calls. The program runs in the chat's own folder:
 * it reads the person's attached files in inputs/ (a document, a ZIP), saves files the person downloads, and can't write
 * anywhere else (Landlock), reach the folder through a symlink, or run past its time. Admins can turn it off.
 */
import { eq, message } from "@aatmiq/db";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";
import { ChatSandbox } from "./services/chat-sandbox";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const events = (body: string) => [...body.matchAll(/event: (\w+)\ndata: (.*)\n/g)].map((m) => ({ event: m[1]!, data: JSON.parse(m[2]!) }));

/** The program the scripted model runs for each kind of message. */
const PROGRAMS: Record<string, string> = {
  REPORT: [
    "import csv, os",
    "rows = list(csv.DictReader(open('inputs/results.csv')))",
    "total = sum(float(r['amps']) for r in rows)",
    "os.makedirs('out', exist_ok=True)",
    "open('out/summary.txt', 'w').write(f'{len(rows)} runs, total {total} A\\n')",
    "print('rows', len(rows), 'total', total)",
  ].join("\n"),
  ZIP: ["import zipfile", "z = zipfile.ZipFile('inputs/firmware.zip')", "print(sorted(z.namelist()))"].join("\n"),
  ESCAPE: [
    "import os",
    "for p in ['/tmp/aatmiq-escape.txt', '../escape.txt', os.path.expanduser('~') + '/../escape2.txt']:",
    "    try:",
    "        open(p, 'w').write('x'); print('WROTE', p)",
    "    except Exception as e:",
    "        print('DENIED', p, type(e).__name__)",
    "os.symlink('/etc/hostname', 'link.txt')",
    "print('done')",
  ].join("\n"),
  FAIL: "raise ValueError('bad input')",
};

d("Python in chat", () => {
  let h: Harness;
  let server: Server;
  let modelId = "";
  let chatDir = "";
  const seen: { tools: string[]; messages: { role: string; content: string }[] }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        if (req.url === "/v1/models") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [] }));
        const body = JSON.parse(raw || "{}");
        const r = { tools: (body.tools ?? []).map((t: any) => t.function.name), messages: body.messages ?? [] };
        seen.push(r);
        const user: string = r.messages.filter((m: any) => m.role === "user").at(-1)?.content ?? "";
        const ran = r.messages.some((m: any) => m.role === "tool");
        const kind = Object.keys(PROGRAMS).find((k) => user.includes(k));
        res.writeHead(200, { "content-type": "text/event-stream" });
        if (kind && !ran && r.tools.includes("run_python")) {
          const call = { index: 0, id: `c${seen.length}`, type: "function", function: { name: "run_python", arguments: JSON.stringify({ code: PROGRAMS[kind], purpose: `Run ${kind}` }) } };
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [call] } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}\n\n`);
        } else {
          const result = r.messages.filter((m: any) => m.role === "tool").at(-1)?.content ?? "";
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: ran ? `Done. ${result.split("\n")[0]}` : "No Python here." } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`);
        }
        res.end("data: [DONE]\n\n");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    chatDir = await mkdtemp(join(tmpdir(), "chat-sandbox-"));
    h = await startHarness({ chatDir });
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Model server", type: "openai_compatible", baseUrl: base });
    modelId = (await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: "std-1", displayName: "std-1", contextLength: 65536, tier: "standard", thinkingSwitch: false, vision: false, sections: ["chat"] })).json.id;
    await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: [modelId], defaultModelId: modelId });
  }, 60_000);
  afterAll(async () => {
    await h?.close();
    await new Promise<void>((r) => server?.close(() => r()));
  });

  const newChat = async () => (await h.call(h.alice, "POST", "/api/chats", { workspaceId: h.workspaceId, modelId })).json.id as string;
  async function ask(chatId: string, content: string, extra: Record<string, unknown> = {}) {
    const r = await h.call(h.alice, "POST", `/api/chats/${chatId}/messages`, { content, modelId, ...extra });
    expect(r.status).toBe(200);
    const saved = (await h.db.select().from(message).where(eq(message.chatId, chatId))).filter((m) => m.role === "assistant").sort((a, b) => +a.createdAt - +b.createdAt).at(-1)!;
    return { ev: events(r.body), saved };
  }

  it("reads an attached file, saves a file to download, and keeps the step and the file with the answer", async () => {
    const up = await h.upload(h.alice, "/api/documents", { workspaceId: h.workspaceId }, { name: "results.csv", type: "text/csv", data: Buffer.from("run,amps\n1,2.5\n2,3.5\n3,4\n") });
    expect(up.status).toBe(200);
    await h.settle();
    const chatId = await newChat();
    const r = await ask(chatId, "REPORT: summarise the test results", { documentIds: [up.json.id] });
    expect(seen.at(-2)!.tools).toContain("run_python");
    const tool = seen.at(-1)!.messages.find((m) => m.role === "tool")!.content;
    expect(tool).toContain("Exit code 0.");
    expect(tool).toContain("rows 3 total 10.0");
    expect(tool).toContain("- out/summary.txt");
    expect(r.ev.find((e) => e.event === "files")!.data.files).toEqual([{ path: "out/summary.txt", size: 21 }]);
    expect(r.saved.files).toEqual([{ path: "out/summary.txt", size: 21 }]);
    expect(r.saved.steps).toEqual([{ tool: "run_python", detail: "Run REPORT", outcome: "ok:1" }]);
    const list = (await h.call(h.alice, "GET", `/api/chats/${chatId}/files`)).json;
    expect(list.files.map((f: any) => f.path).sort()).toEqual(["inputs/results.csv", "out/summary.txt"]);
    const dl = await h.call(h.alice, "GET", `/api/chats/${chatId}/files/content?path=out/summary.txt`);
    expect(dl.body).toBe("3 runs, total 10.0 A\n");
    expect(dl.headers["content-disposition"]).toMatch(/^attachment/);
    // Someone else can't see the chat's folder.
    expect((await h.call(h.bob, "GET", `/api/chats/${chatId}/files`)).status).toBe(404);
  });

  it("takes a ZIP the person attaches and lists what's in it", async () => {
    const chatId = await newChat();
    const zip = Buffer.from(zipSync({ "src/main.c": strToU8("int main(){return 0;}"), "README.md": strToU8("# fw") }));
    const up = await h.upload(h.alice, `/api/chats/${chatId}/files`, {}, { name: "firmware.zip", type: "application/zip", data: zip });
    expect(up.json).toEqual({ path: "inputs/firmware.zip" });
    await ask(chatId, "ZIP: what's in it?");
    expect(seen.at(-1)!.messages.find((m) => m.role === "tool")!.content).toContain("['README.md', 'src/main.c']");
  });

  it("can't write outside the chat's folder or reach it through a symlink, and a failure is told to the model", async () => {
    const chatId = await newChat();
    await ask(chatId, "ESCAPE: try");
    const out = seen.at(-1)!.messages.find((m) => m.role === "tool")!.content;
    expect(out).not.toContain("WROTE");
    expect(out.match(/DENIED/g)).toHaveLength(3);
    expect(existsSync("/tmp/aatmiq-escape.txt")).toBe(false);
    expect(existsSync(join(chatDir, "escape.txt"))).toBe(false);
    // The planted link is never served.
    expect((await h.call(h.alice, "GET", `/api/chats/${chatId}/files/content?path=link.txt`)).status).toBe(404);
    expect((await h.call(h.alice, "GET", `/api/chats/${chatId}/files/content?path=../../etc/hostname`)).status).toBe(404);
    expect((await h.call(h.alice, "GET", `/api/chats/${chatId}/files/content?path=.run/main.py`)).status).toBe(404);

    const failed = await ask(chatId, "FAIL: go");
    expect(seen.at(-1)!.messages.find((m) => m.role === "tool")!.content).toMatch(/Exit code 1\.[\s\S]*ValueError: bad input/);
    expect(failed.saved.steps).toEqual([{ tool: "run_python", detail: "Run FAIL", outcome: "failed" }]);
  });

  it("stops a program that runs too long, and the whole process group with it", async () => {
    const sandbox = new ChatSandbox({ cfg: { chatDir, workSandbox: "on" }, db: h.db, storage: { get: async () => Buffer.alloc(0) }, code: { uidFor: async () => 0 } } as never);
    const chatId = await newChat();
    const t = Date.now();
    const r = await sandbox.run(chatId, h.ids.alice, "import subprocess, sys\nsubprocess.Popen([sys.executable, '-c', 'while True: pass'])\nwhile True: pass", { timeoutMs: 1500 });
    expect(r.timedOut).toBe(true);
    expect(Date.now() - t).toBeLessThan(8000);
  });

  it("deleting the chat deletes its folder; admins can turn Python off", async () => {
    const chatId = await newChat();
    await ask(chatId, "ZIP: again");
    expect((await h.call(h.alice, "DELETE", `/api/chats/${chatId}`)).status).toBe(200);
    expect(existsSync(join(chatDir, chatId))).toBe(false);
    expect((await h.call(h.owner, "PUT", "/api/admin/gem", { chatSandbox: false })).status).toBe(200);
    const other = await newChat();
    const r = await ask(other, "REPORT: again");
    expect(seen.at(-1)!.tools).not.toContain("run_python");
    expect(r.saved.content).toBe("No Python here.");
    expect(await readFile(join(chatDir, "x"), "utf8").catch(() => null)).toBeNull();
  });
});
