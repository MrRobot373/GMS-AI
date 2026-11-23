/**
 * Hostile-file checks for uploaded documents (KNW-05), before anything parses them:
 * - the content must be what the name says: a ".pdf" must start like a PDF, a ".docx" or ".xlsx" like a ZIP, an image
 *   like that image; a "text" file must not be a program or an archive in disguise;
 * - Word and Excel files are ZIP archives: one that would unpack to more than 200 MB, holds more than 5,000 parts or
 *   packs one part more than 300 times (a "zip bomb") is refused from its own index, without unpacking anything;
 * - a PDF with more pages than the limit is refused (DOC_MAX_PDF_PAGES, default 2,000).
 * Each problem is a sentence a person can act on.
 */
import { unzipSync } from "fflate";
import { extensionOf } from "./extract";

export const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
export const MAX_ARCHIVE_PARTS = 5_000;
export const MAX_RATIO = 300;
export const maxPdfPages = () => Number(process.env.DOC_MAX_PDF_PAGES) || 2_000;

const starts = (data: Buffer, ...bytes: number[]) => bytes.every((b, i) => data[i] === b);
const ascii = (data: Buffer, at: number, text: string) => data.subarray(at, at + text.length).toString("latin1") === text;

const isZip = (d: Buffer) => starts(d, 0x50, 0x4b, 0x03, 0x04);
const isPdf = (d: Buffer) => d.subarray(0, 1024).toString("latin1").includes("%PDF-");
const IMAGES: Record<string, (d: Buffer) => boolean> = {
  png: (d) => starts(d, 0x89, 0x50, 0x4e, 0x47),
  jpg: (d) => starts(d, 0xff, 0xd8, 0xff),
  jpeg: (d) => starts(d, 0xff, 0xd8, 0xff),
  webp: (d) => ascii(d, 0, "RIFF") && ascii(d, 8, "WEBP"),
  tif: (d) => starts(d, 0x49, 0x49, 0x2a, 0x00) || starts(d, 0x4d, 0x4d, 0x00, 0x2a),
  tiff: (d) => starts(d, 0x49, 0x49, 0x2a, 0x00) || starts(d, 0x4d, 0x4d, 0x00, 0x2a),
  bmp: (d) => ascii(d, 0, "BM"),
};
/** Programs and archives that must never pass as text. */
const BINARY = (d: Buffer) => ascii(d, 0, "MZ") || starts(d, 0x7f, 0x45, 0x4c, 0x46) || isZip(d) || starts(d, 0x1f, 0x8b) || ascii(d, 0, "Rar!") || starts(d, 0x37, 0x7a, 0xbc, 0xaf) || starts(d, 0xcf, 0xfa, 0xed, 0xfe) || isPdf(d);

/** Why the file can't be accepted, or null. */
export function fileProblem(name: string, data: Buffer): string | null {
  const ext = extensionOf(name);
  if (ext === "pdf") return isPdf(data) ? null : "This file is named .pdf but isn't a PDF.";
  if (ext === "docx" || ext === "xlsx" || ext === "xlsm") {
    if (!isZip(data)) return `This file is named .${ext} but isn't a ${ext === "docx" ? "Word" : "Excel"} file.`;
    return archiveProblem(data);
  }
  if (IMAGES[ext]) return IMAGES[ext]!(data) ? null : `This file is named .${ext} but isn't that kind of image.`;
  if (BINARY(data)) return "This file is named as text but is a program, an archive or another binary file.";
  return null;
}

/** A ZIP's index, read without unpacking: too big unpacked, too many parts, or packed too tightly. */
export function archiveProblem(data: Buffer): string | null {
  let parts = 0;
  let total = 0;
  let worst = 0;
  try {
    unzipSync(new Uint8Array(data), {
      filter: (f) => {
        parts++;
        total += f.originalSize;
        if (f.size > 0) worst = Math.max(worst, f.originalSize / f.size);
        return false;
      },
    });
  } catch {
    return "The file is damaged and can't be opened.";
  }
  if (parts > MAX_ARCHIVE_PARTS) return "The file has too many parts to be a normal document.";
  if (total > MAX_UNPACKED_BYTES) return "The file would unpack to more than 200 MB, which is too large for a document.";
  if (worst > MAX_RATIO && total > 10 * 1024 * 1024) return "The file is packed in a way that looks like a zip bomb, so it isn't opened.";
  return null;
}
