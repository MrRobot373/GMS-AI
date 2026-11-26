/**
 * Pictures in chat (services/chat-images.ts, routes/chat.ts): a picture with no text is kept (ready, not searchable),
 * a model that reads images gets it with the message it came with, and with later messages in the branch; a model that
 * can't see pictures gets none and is told so; Auto prefers a model that reads images. Against a real Postgres
 * (TEST_DATABASE_URL) and a model server that records what it was sent.
 */
import { createCanvas } from "@napi-rs/canvas";
import { AUTO_MODEL_ID } from "@aatmiq/shared";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";
import { PICTURE_ONLY } from "./services/documents";
import { MAX_CHAT_IMAGES } from "./services/chat-images";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

type Part = { type: string; text?: string; image_url?: { url: string } };
type Sent = { model: string; messages: { role: string; content: string | Part[] }[] };

/** A red square on white: no text in it. */
function picture(side = 2000): Buffer {
  const c = createCanvas(side, side);
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, side, side);
  g.fillStyle = "#d22";
  g.fillRect(side / 4, side / 4, side / 2, side / 2);
  return c.toBuffer("image/png");
}
const images = (m: Sent["messages"][number]) => (Array.isArray(m.content) ? m.content.filter((p) => p.type === "image_url").map((p) => p.image_url!.url) : []);

d("pictures in chat", () => {
  let h: Harness;
  let server: Server;
  const seen: Sent[] = [];
  let seeing = "";
  let blind = "";
  const ocr = process.env.OCR_ENABLED;

  beforeAll(async () => {
    // No OCR: a picture has no text to give, and is still kept.
    process.env.OCR_ENABLED = "false";
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        if (req.url === "/v1/models") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [] }));
        const body = JSON.parse(raw || "{}");
        seen.push({ model: body.model, messages: body.messages ?? [] });
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "A red square." } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 40, completion_tokens: 4 } })}\n\n`);
        res.end("data: [DONE]\n\n");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    h = await startHarness();
    const p = await h.call(h.owner, "POST", "/api/admin/providers", { name: "Model server", type: "openai_compatible", baseUrl: base });
    const add = async (key: string, tier: string, vision: boolean) =>
      (await h.call(h.owner, "POST", "/api/admin/models", { providerId: p.json.id, modelKey: key, displayName: key, contextLength: 65536, tier, thinkingSwitch: false, vision, sections: ["chat"] })).json.id as string;
    blind = await add("blind-std", "standard", false);
    seeing = await add("eyes-adv", "advanced", true);
    expect((await h.call(h.owner, "PUT", `/api/admin/workspaces/${h.workspaceId}/models`, { modelIds: [blind, seeing], defaultModelId: blind })).status).toBe(200);
  }, 60_000);
  afterAll(async () => {
    if (ocr === undefined) delete process.env.OCR_ENABLED;
    else process.env.OCR_ENABLED = ocr;
    await h?.close();
    await new Promise<void>((r) => server?.close(() => r()));
  });

  async function uploadPicture(name: string, j = h.alice) {
    const up = await h.upload(j, "/api/documents", { workspaceId: h.workspaceId }, { name, type: "image/png", data: picture() });
    expect(up.status).toBe(200);
    await h.settle();
    return up.json.id as string;
  }
  async function send(chatId: string, body: Record<string, unknown>) {
    const before = seen.length;
    const r = await h.call(h.alice, "POST", `/api/chats/${chatId}/messages`, body);
    expect(r.status).toBe(200);
    return seen.slice(before);
  }

  it("keeps a picture with no text: ready, not searchable, with a note", async () => {
    const id = await uploadPicture("red-square.png");
    const doc = (await h.call(h.alice, "GET", `/api/documents/${id}`)).json;
    expect(doc).toMatchObject({ status: "ready", chunkCount: 0, error: PICTURE_ONLY });
  });

  it("shows a model that reads images the picture, scaled down, with its message and later ones", async () => {
    const pic = await uploadPicture("photo.png");
    const chatId = (await h.call(h.alice, "POST", "/api/chats", { workspaceId: h.workspaceId, modelId: seeing })).json.id as string;
    const [first] = await send(chatId, { content: "What is in this picture?", modelId: seeing, documentIds: [pic] });
    const ask = first!.messages.at(-1)!;
    expect(ask.role).toBe("user");
    expect((ask.content as Part[])[0]).toEqual({ type: "text", text: "What is in this picture?" });
    const [url] = images(ask);
    expect(url).toMatch(/^data:image\/jpeg;base64,/);
    // A 2000 px picture goes as at most 1280 px a side: far smaller than the PNG.
    expect(Buffer.from(url!.split(",")[1]!, "base64").length).toBeLessThan(picture().length);
    expect(String(first!.messages[0]!.content)).toMatch(/you can see them/);

    // The follow-up has no attachment; the picture stays with the message it came with.
    const [second] = await send(chatId, { content: "And its colour?", modelId: seeing });
    const users = second!.messages.filter((m) => m.role === "user");
    expect(images(users.at(-2)!)).toHaveLength(1);
    expect(users.at(-1)!.content).toBe("And its colour?");
  });

  it("gives a model that can't see pictures none, and tells it so", async () => {
    const pic = await uploadPicture("diagram.png");
    const chatId = (await h.call(h.alice, "POST", "/api/chats", { workspaceId: h.workspaceId, modelId: blind })).json.id as string;
    const [first] = await send(chatId, { content: "Describe this.", modelId: blind, documentIds: [pic] });
    expect(first!.model).toBe("blind-std");
    expect(first!.messages.every((m) => typeof m.content === "string")).toBe(true);
    expect(String(first!.messages[0]!.content)).toMatch(/can't see pictures/);
  });

  it("Auto picks a model that reads images when there's a picture", async () => {
    const pic = await uploadPicture("auto.png");
    const chatId = (await h.call(h.alice, "POST", "/api/chats", { workspaceId: h.workspaceId, modelId: AUTO_MODEL_ID })).json.id as string;
    const sent = await send(chatId, { content: "hi, what's this?", documentIds: [pic] });
    expect(sent.at(-1)!.model).toBe("eyes-adv");
    expect(images(sent.at(-1)!.messages.at(-1)!)).toHaveLength(1);
  });

  it("sends at most a few pictures, newest first, and never someone else's", async () => {
    const mine = [];
    for (let i = 0; i < MAX_CHAT_IMAGES + 2; i++) mine.push(await uploadPicture(`p${i}.png`));
    const bobs = await uploadPicture("bob.png", h.bob);
    const chatId = (await h.call(h.alice, "POST", "/api/chats", { workspaceId: h.workspaceId, modelId: seeing })).json.id as string;
    const [first] = await send(chatId, { content: "Compare these.", modelId: seeing, documentIds: mine });
    expect(images(first!.messages.at(-1)!)).toHaveLength(MAX_CHAT_IMAGES);
    const r = await h.call(h.alice, "POST", `/api/chats/${chatId}/messages`, { content: "And Bob's?", modelId: seeing, documentIds: [bobs] });
    expect(r.status).toBe(400);
  });
});
