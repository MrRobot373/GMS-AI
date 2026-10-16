/**
 * GEM AI Calculators through the API, and as chat's tool: the server recomputes everything it
 * keeps, invalid input is an error (never a number), and chat explains a tested result.
 */
import { calculatorHistory, eq, message } from "@aatmiq/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("GEM AI Calculators", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(async () => {
    await h?.close();
  });

  it("lists calculators and tools", async () => {
    const r = await h.call(h.alice, "GET", `/api/calculators?workspaceId=${h.workspaceId}`);
    expect(r.status).toBe(200);
    const ids = r.json.calculators.map((c: { id: string }) => c.id);
    expect(ids).toContain("buck-ideal");
    expect(ids).toContain("scientific");
    expect(r.json.calculators.find((c: { id: string }) => c.id === "buck-ideal").status).toBe("verified");
    // Definitions travel as data, not code.
    expect(JSON.stringify(r.json)).not.toContain('"compute"');
  });

  it("runs a calculator on the server, converts units, and keeps it with the formula version", async () => {
    const r = await h.call(h.alice, "POST", "/api/calculators/run", {
      workspaceId: h.workspaceId,
      calculatorId: "buck-ideal",
      inputs: { Vin: { value: 48, unit: "V" }, D: { value: 40, unit: "percent" }, Iout: { value: 2000, unit: "mA" } },
      outputUnits: { Vout: "mV" },
    });
    expect(r.status).toBe(200);
    expect(r.json.outputs.find((o: { key: string }) => o.key === "Vout").value).toBeCloseTo(19200, 9);
    expect(r.json.outputs.find((o: { key: string }) => o.key === "Iin").value).toBeCloseTo(0.8, 12);
    const [row] = await h.db.select().from(calculatorHistory).where(eq(calculatorHistory.id, r.json.historyId));
    expect(row).toMatchObject({ userId: h.ids.alice, calculatorId: "buck-ideal", formulaVersion: 1, kind: "formula", source: "calculators" });
    expect(row!.inputs).toEqual({ Vin: { value: 48, unit: "V" }, D: { value: 40, unit: "percent" }, Iout: { value: 2000, unit: "mA" } });
  });

  it("invalid input is an error naming the field, never a number", async () => {
    const bad = [
      [{ calculatorId: "boost-ideal", inputs: { Vin: { value: 12 }, D: { value: 1 } } }, /less than 1/, "D"],
      [{ calculatorId: "ohms-law", inputs: { V: { value: 12 }, I: { value: 0 } } }, /zero/, "I"],
      [{ calculatorId: "ohms-law", inputs: { V: { value: 12, unit: "A" }, R: { value: 4 } } }, /not a unit of voltage/, "V"],
      [{ calculatorId: "rc-time-constant", inputs: { R: { value: null }, C: { value: 1 } } }, /required/, "R"],
      [{ calculatorId: "ohms-law", inputs: { V: { value: 1e308 }, I: { value: 1e308 } } }, /finite/, null],
    ] as const;
    for (const [body, re, field] of bad) {
      const r = await h.call(h.alice, "POST", "/api/calculators/run", { workspaceId: h.workspaceId, ...body });
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.json.error).toMatch(re);
      expect(r.json.details.field).toBe(field);
    }
    // Strings and non-numbers don't pass validation at all.
    expect((await h.call(h.alice, "POST", "/api/calculators/run", { workspaceId: h.workspaceId, calculatorId: "ohms-law", inputs: { V: { value: "12" }, R: { value: 4 } } })).status).toBe(400);
    expect((await h.call(h.alice, "POST", "/api/calculators/run", { workspaceId: h.workspaceId, calculatorId: "warp-drive", inputs: {} })).status).toBe(404);
  });

  it("keypad results are recomputed by the server, not taken from the browser", async () => {
    const r = await h.call(h.alice, "POST", "/api/calculators/history", { workspaceId: h.workspaceId, calculatorId: "scientific", expression: "sin(30)+2^3", angle: "deg", outputs: { value: 999 } });
    expect(r.status).toBe(200);
    expect(r.json.outputs).toEqual({ value: 8.5 });
    const e = await h.call(h.alice, "POST", "/api/calculators/history", { workspaceId: h.workspaceId, calculatorId: "basic", expression: "1/0" });
    expect(e.status).toBe(400);
    expect(e.json.error).toMatch(/Division by zero/);
  });

  it("history and favorites are each person's own", async () => {
    const mine = await h.call(h.alice, "GET", `/api/calculators/history?workspaceId=${h.workspaceId}`);
    expect(mine.json.length).toBe(2);
    expect((await h.call(h.bob, "GET", `/api/calculators/history?workspaceId=${h.workspaceId}`)).json).toHaveLength(0);
    expect((await h.call(h.bob, "DELETE", `/api/calculators/history/${mine.json[0].id}`)).status).toBe(404);
    expect((await h.call(h.alice, "PUT", "/api/calculators/favorites/buck-ideal", { favorite: true, workspaceId: h.workspaceId })).status).toBe(200);
    expect((await h.call(h.alice, "PUT", "/api/calculators/favorites/scientific", { favorite: true, workspaceId: h.workspaceId })).status).toBe(200);
    expect((await h.call(h.alice, "GET", `/api/calculators?workspaceId=${h.workspaceId}`)).json.favorites.sort()).toEqual(["buck-ideal", "scientific"]);
    expect((await h.call(h.bob, "GET", `/api/calculators?workspaceId=${h.workspaceId}`)).json.favorites).toEqual([]);
    await h.call(h.alice, "PUT", "/api/calculators/favorites/scientific", { favorite: false, workspaceId: h.workspaceId });
    expect((await h.call(h.alice, "GET", `/api/calculators?workspaceId=${h.workspaceId}`)).json.favorites).toEqual(["buck-ideal"]);
    expect((await h.call(h.alice, "DELETE", `/api/calculators/history/${mine.json[0].id}`)).status).toBe(200);
  });

  it("an admin can hide beta calculators, and switch the module off", async () => {
    await h.call(h.owner, "PUT", "/api/admin/gem", { betaCalculators: false });
    const r = await h.call(h.alice, "GET", `/api/calculators?workspaceId=${h.workspaceId}`);
    expect(r.json.calculators.every((c: { status: string }) => c.status !== "beta")).toBe(true);
    expect(r.json.calculators.filter((c: { status: string }) => c.status === "verified")).toHaveLength(20);
    expect((await h.call(h.alice, "POST", "/api/calculators/run", { workspaceId: h.workspaceId, calculatorId: "bmi", inputs: { m: { value: 70 }, h: { value: 175 } } })).status).toBe(404);
    await h.call(h.owner, "PUT", "/api/admin/gem", { betaCalculators: true, modules: { calculators: false } });
    expect((await h.call(h.alice, "GET", `/api/calculators?workspaceId=${h.workspaceId}`)).status).toBe(403);
    await h.call(h.owner, "PUT", "/api/admin/gem", { modules: { calculators: true } });
  });

  async function ask(j: typeof h.alice, content: string) {
    const c = await h.call(j, "POST", "/api/chats", { workspaceId: h.workspaceId });
    const r = await h.call(j, "POST", `/api/chats/${c.json.id}/messages`, { content });
    const start = JSON.parse(/event: start\ndata: (.*)\n/.exec(r.body)![1]!);
    const text = [...r.body.matchAll(/event: delta\ndata: (.*)\n/g)].map((m) => JSON.parse(m[1]!).text).join("");
    return { chatId: c.json.id as string, start, text };
  }

  it("chat runs the tested calculator and explains its result", async () => {
    const r = await ask(h.alice, "What is the ideal output at 48 V and 0.4 duty?");
    expect(r.start.calculation).toMatchObject({ calculatorId: "buck-ideal", via: "rules", status: "verified" });
    expect(r.start.calculation.outputs[0]).toMatchObject({ key: "Vout", unit: "V" });
    expect(r.start.calculation.outputs[0].value).toBeCloseTo(19.2, 12);
    expect(r.text).toContain("19.2 V");
    expect(r.text).toContain("Buck converter (ideal)");
    const msgs = await h.db.select().from(message).where(eq(message.chatId, r.chatId));
    expect(msgs.find((m) => m.role === "assistant")!.calculation).toMatchObject({ calculatorId: "buck-ideal" });
    const hist = await h.db.select().from(calculatorHistory).where(eq(calculatorHistory.source, "chat"));
    expect(hist).toHaveLength(1);
    expect(hist[0]!.userId).toBe(h.ids.alice);
  });

  it("chat leaves ordinary messages alone, and refuses to show a result that doesn't run", async () => {
    expect((await ask(h.alice, "Hello! How are you today?")).start.calculation).toBeNull();
    expect((await ask(h.alice, "What happened in 1947?")).start.calculation).toBeNull();
    // D = 1 divides by zero in a boost: no result rather than a wrong one.
    expect((await ask(h.alice, "/calc boost-ideal Vin=12V D=1")).start.calculation).toBeNull();
    expect((await ask(h.alice, "/calc boost-ideal Vin=12V D=0.5")).start.calculation.outputs[0].value).toBe(24);
  });

  it("chat doesn't run calculators for someone who doesn't have them", async () => {
    const members = await h.call(h.owner, "GET", `/api/admin/workspaces/${h.workspaceId}/members`);
    const bob = members.json.find((m: { userId: string }) => m.userId === h.ids.bob);
    await h.call(h.owner, "PATCH", `/api/admin/workspaces/${h.workspaceId}/members/${h.ids.bob}`, { sections: bob.sections.filter((s: string) => s !== "calculators") });
    expect((await ask(h.bob, "What is the ideal output at 48 V and 0.4 duty?")).start.calculation).toBeNull();
  });
});
