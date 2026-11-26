/**
 * Pictures in chat: images a person attached, shown to a model that reads images (as well as any text OCR found in
 * them). Each is scaled to at most 1280 px a side and sent as a JPEG, so a 12-megapixel phone photo costs about the
 * same as a screenshot.
 */
import { and, document, inArray, type DB } from "@aatmiq/db";
import type { Storage } from "./storage";
import { accessibleDocs } from "./documents";
import { isPictureName } from "./extract";

/** Pictures sent with one request: the newest message's first, then earlier messages', newest first. */
export const MAX_CHAT_IMAGES = 4;
const MAX_SIDE = 1280;
/** Larger files aren't decoded (a picture that big is almost always a scan better read by OCR). */
const MAX_PICTURE_BYTES = 25 * 1024 * 1024;

export interface ChatPicture {
  documentId: string;
  name: string;
  /** The user message it was attached to (null: the message being sent now). */
  messageId: string | null;
}

/**
 * The pictures to show the model for this turn: from the message being sent (`current`), then from earlier user
 * messages in the branch (`earlier`, newest first), only ones the person can still open, at most MAX_CHAT_IMAGES.
 */
export async function chatPictures(
  db: DB,
  workspaceId: string,
  userId: string,
  current: string[],
  earlier: { messageId: string; documentIds: string[] }[],
): Promise<ChatPicture[]> {
  const ids = [...new Set([...current, ...earlier.flatMap((e) => e.documentIds)])];
  if (!ids.length) return [];
  const rows = await db
    .select({ id: document.id, name: document.name, status: document.status, sizeBytes: document.sizeBytes })
    .from(document)
    .where(and(accessibleDocs(workspaceId, userId), inArray(document.id, ids)));
  const usable = new Map(rows.filter((r) => r.status === "ready" && isPictureName(r.name) && r.sizeBytes <= MAX_PICTURE_BYTES).map((r) => [r.id, r.name]));
  const out: ChatPicture[] = [];
  const seen = new Set<string>();
  const add = (documentId: string, messageId: string | null) => {
    const name = usable.get(documentId);
    if (!name || seen.has(documentId) || out.length >= MAX_CHAT_IMAGES) return;
    seen.add(documentId);
    out.push({ documentId, name, messageId });
  };
  for (const id of current) add(id, null);
  for (const e of earlier) for (const id of e.documentIds) add(id, e.messageId);
  return out;
}

/** A stored picture as a `data:` URL for the model, scaled down; null when it can't be read. */
export async function pictureDataUrl(storage: Storage, db: DB, documentId: string): Promise<string | null> {
  try {
    const [doc] = await db.select({ storageKey: document.storageKey }).from(document).where(inArray(document.id, [documentId]));
    if (!doc) return null;
    const data = await storage.get(doc.storageKey);
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(data);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = createCanvas(w, h);
    const g = canvas.getContext("2d");
    // Transparent PNGs on white, as people see them.
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    const jpeg = await canvas.encode("jpeg", 85);
    return `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`;
  } catch {
    return null;
  }
}
