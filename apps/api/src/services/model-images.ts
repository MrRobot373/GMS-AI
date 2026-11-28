/**
 * Pictures on their way to a model (Work AI, Super AI and Agent AI requests, through routes/work-internal.ts).
 *
 * Work AI's runtime re-encodes a picture with transparency as WebP (every matplotlib chart), and some model servers
 * can't load WebP: they answer 400 "Failed to load image" and the whole task failed. So WebP (and the other formats a
 * server may not know) is sent as PNG, and if a server still can't load a picture, the request goes once more with the
 * pictures replaced by a note, so the agent carries on without them instead of stopping.
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";

/** Formats every model server we send to reads; anything else is converted to PNG. */
const READ_EVERYWHERE = /^data:image\/(png|jpe?g|gif);base64,/i;
const DATA_IMAGE = /^data:image\/[\w.+-]+;base64,/i;

/** What a model server says when it couldn't load a picture. */
export const IMAGE_LOAD_FAILED = /fail(ed)? to load image|cannot identify image|image (file )?(could not|couldn't|cannot) be (loaded|decoded|read)|unsupported image|invalid image/i;

/** The note an unreadable picture is replaced with. */
export const IMAGE_DROPPED_NOTE = "[A picture was here, but the model server couldn't read it. Describe what you need from it in words, or check it another way.]";

type Part = { type?: string; image_url?: { url?: string } | string; text?: string };

function* imageParts(messages: unknown): Generator<{ parts: Part[]; index: number; url: string }> {
  if (!Array.isArray(messages)) return;
  for (const m of messages as { content?: unknown }[]) {
    if (!Array.isArray(m?.content)) continue;
    const parts = m.content as Part[];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p?.type !== "image_url") continue;
      const url = typeof p.image_url === "string" ? p.image_url : p.image_url?.url;
      if (typeof url === "string") yield { parts, index: i, url };
    }
  }
}

export const hasImages = (messages: unknown): boolean => !imageParts(messages).next().done;

/** A data URL in another format as a PNG data URL (null when it can't be decoded). */
export async function toPng(url: string): Promise<string | null> {
  try {
    const img = await loadImage(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
    const canvas = createCanvas(img.width, img.height);
    canvas.getContext("2d").drawImage(img, 0, 0);
    return `data:image/png;base64,${(await canvas.encode("png")).toString("base64")}`;
  } catch {
    return null;
  }
}

/** Pictures in formats a server may not read (WebP, AVIF, BMP…) become PNG, in place. Returns how many changed. */
export async function normalizeImages(messages: unknown): Promise<number> {
  let changed = 0;
  for (const { parts, index, url } of [...imageParts(messages)]) {
    if (!DATA_IMAGE.test(url) || READ_EVERYWHERE.test(url)) continue;
    const png = await toPng(url);
    if (!png) continue;
    parts[index] = { type: "image_url", image_url: { url: png } };
    changed++;
  }
  return changed;
}

/** Every picture replaced with a note, in place (for a server that still can't load one). Returns how many. */
export function dropImages(messages: unknown): number {
  let dropped = 0;
  for (const { parts, index } of [...imageParts(messages)]) {
    parts[index] = { type: "text", text: IMAGE_DROPPED_NOTE };
    dropped++;
  }
  return dropped;
}
