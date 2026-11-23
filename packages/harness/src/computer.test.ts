/**
 * Computer AI (src/computer/): the agent loop with a fake screen and a fake model behind Aatmiq's gateway. It turns the
 * model's 0-1000 positions into screen pixels, sends a screenshot after every action, keeps only the latest ones, asks
 * before risky actions and does nothing when refused, stops when the mouse is in the top-left corner, and lets one
 * task at a time use the computer.
 */
import { createServer, type Server } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computerRisk, createComputerEngine } from "./computer/engine";
import { sendKeysText, windowsKeys, xdotoolKeys, type Driver } from "./computer/driver";
import type { HarnessEvent, TaskSpec } from "./types";

type Call = { name: string; args: Record<string, unknown> };

function fakeDriver(log: string[], cursor = { x: 500, y: 500 }): Driver {
  return {
    screen: async () => ({ width: 1920, height: 1080 }),
    screenshot: async () => ({ image: Buffer.from("jpeg"), width: 1280, height: 720 }),
    cursor: async () => cursor,
    move: async (x, y) => void log.push(`move ${x} ${y}`),
    click: async (x, y, b, n) => void log.push(`click ${Math.round(x)} ${Math.round(y)} ${b} ${n}`),
    drag: async () => void log.push("drag"),
    type: async (t) => void log.push(`type ${t}`),
    key: async (k) => void log.push(`key ${k}`),
    scroll: async () => void log.push("scroll"),
    close: () => undefined,
  };
}

describe("Computer AI", () => {
  let server: Server;
  let url = "";
  let script: Call[][] = [];
  const requests: { messages: { role: string; content: unknown }[] }[] = [];
  const approvals: string[] = [];
  let decision = "approved";

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      let raw = "";
      for await (const c of req) raw += c;
      const json = (o: unknown) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(o));
      if (req.url === "/llm/v1/chat/completions") {
        requests.push(JSON.parse(raw));
        const next = script.shift() ?? [];
        return json({
          choices: [
            {
              message: next.length
                ? { content: "", tool_calls: next.map((c, i) => ({ id: `c${requests.length}-${i}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) }
                : { content: "Done: Count shows 3." },
            },
          ],
        });
      }
      if (req.url === "/approvals") {
        approvals.push(JSON.parse(raw).reason);
        return json({ id: "a1" });
      }
      if (req.url?.startsWith("/approvals/a1")) return json({ status: decision });
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => server.close());

  const spec = async (approvalsMode: TaskSpec["approvals"] = "risky"): Promise<TaskSpec> => {
    const dir = await mkdtemp(join(tmpdir(), "computer-"));
    return {
      taskId: `t-${Math.random()}`,
      workdir: join(dir, "files"),
      homeDir: join(dir, "runtime"),
      model: { key: "vision", name: "Vision", contextWindow: 65536, vision: true },
      controlUrl: url,
      token: "tok",
      approvals: approvalsMode,
      askForNetwork: false,
      webSearch: false,
      skillsDir: null,
      connectors: [],
      productName: "Aatmiq",
    };
  };
  const run = async (s: TaskSpec, driver: Driver, text: string) => {
    const events: HarnessEvent[] = [];
    const rt = await createComputerEngine({ driver: () => driver }).start(s, (e) => events.push(e));
    await rt.send(text);
    for (let i = 0; i < 200 && !events.some((e) => e.type === "turn_end"); i++) await new Promise((r) => setTimeout(r, 25));
    return { events, rt };
  };

  it("clicks where the model points (0-1000 scale), types, and sees a new screenshot after each action", async () => {
    const log: string[] = [];
    script = [[{ name: "click", args: { x: 500, y: 250 } }], [{ name: "type", args: { text: "Asha" } }], []];
    requests.length = 0;
    const { events, rt } = await run(await spec(), fakeDriver(log), "Type Asha in the box");
    expect(log).toEqual(["click 960 270 left 1", "type Asha"]);
    expect(events.find((e) => e.type === "turn_end")).toEqual({ type: "turn_end", reason: "completed" });
    expect(events.filter((e) => e.type === "tool_call").map((e) => (e as { name: string }).name)).toEqual(["computer_click", "computer_type"]);
    // Every request has a screenshot; the last one says what was done.
    const last = requests.at(-1)!.messages;
    expect(JSON.stringify(last)).toContain("data:image/jpeg;base64,");
    expect(String(last[0]!.content)).toContain("0-1000 scale");
    await rt.stop();
  });

  it("asks before a risky action and doesn't do it when the person says no", async () => {
    const log: string[] = [];
    decision = "rejected";
    approvals.length = 0;
    script = [[{ name: "key", args: { keys: "alt+f4" } }], []];
    const { events, rt } = await run(await spec(), fakeDriver(log), "Close the window");
    expect(approvals).toEqual(["Closes or deletes something"]);
    expect(log).toEqual([]);
    expect(events.find((e) => e.type === "tool_result")).toMatchObject({ isError: true, notRun: "The person said no to this action." });
    decision = "approved";
    await rt.stop();
  });

  it("stops at once when the mouse is in the top-left corner", async () => {
    const log: string[] = [];
    script = [[{ name: "click", args: { x: 10, y: 10 } }], []];
    const { events, rt } = await run(await spec(), fakeDriver(log, { x: 0, y: 0 }), "Click something");
    expect(log).toEqual([]);
    expect(events.find((e) => e.type === "turn_end")).toMatchObject({ reason: "error", error: expect.stringMatching(/top-left corner/) });
    await rt.stop();
  });

  it("lets one task at a time use the computer", async () => {
    const engine = createComputerEngine({ driver: () => fakeDriver([]) });
    const a = await engine.start(await spec(), () => undefined);
    await expect(engine.start(await spec(), () => undefined)).rejects.toThrow(/Another Computer AI task/);
    await a.stop();
    const b = await engine.start(await spec(), () => undefined);
    await b.stop();
  });

  it("classifies risky actions", () => {
    expect(computerRisk("key", { keys: "ctrl+c" }, "risky")).toBeNull();
    expect(computerRisk("key", { keys: "Win + R" }, "risky")).toMatch(/Run box/);
    expect(computerRisk("type", { text: "rmdir /s /q C:\\data" }, "risky")).toMatch(/deletes/);
    expect(computerRisk("type", { text: "hello world" }, "risky")).toBeNull();
    expect(computerRisk("click", { x: 1, y: 1 }, "always")).toMatch(/Every action/);
    expect(computerRisk("screenshot", {}, "always")).toBeNull();
    expect(computerRisk("key", { keys: "delete" }, "never")).toBeNull();
  });

  it("names keys for Windows and X11", () => {
    expect(windowsKeys("ctrl+shift+s")).toEqual([0x11, 0x10, 0x53]);
    expect(windowsKeys("win")).toEqual([0x5b]);
    expect(windowsKeys("f5")).toEqual([0x74]);
    expect(() => windowsKeys("ctrl+banana")).toThrow(/Unknown key/);
    expect(xdotoolKeys("ctrl+enter")).toBe("ctrl+Return");
    expect(xdotoolKeys("win+pageup")).toBe("super+Prior");
    expect(sendKeysText("50% off (today) {x}\n")).toBe("50{%} off {(}today{)} {{}x{}}{ENTER}");
  });
});
