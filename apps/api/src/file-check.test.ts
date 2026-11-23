/** Hostile uploads (services/file-check.ts): wrong content for the name, programs posing as text, zip bombs. */
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { archiveProblem, fileProblem } from "./services/file-check";
import { extractText } from "./services/extract";

const zip = (files: Record<string, Uint8Array>, level: 0 | 9 = 9) => Buffer.from(zipSync(files, { level }));

describe("hostile files", () => {
  it("accepts files that are what their name says", () => {
    expect(fileProblem("a.pdf", Buffer.from("%PDF-1.7\n..."))).toBeNull();
    expect(fileProblem("a.docx", zip({ "word/document.xml": new TextEncoder().encode("<w:document/>") }))).toBeNull();
    expect(fileProblem("a.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBeNull();
    expect(fileProblem("notes.txt", Buffer.from("Meeting on Friday"))).toBeNull();
    // UTF-16 text from Windows is text too.
    expect(fileProblem("notes.txt", Buffer.from("﻿Hello", "utf16le"))).toBeNull();
  });

  it("refuses files whose content isn't what the name says", () => {
    expect(fileProblem("report.pdf", Buffer.from("<html>not a pdf</html>"))).toMatch(/isn't a PDF/);
    expect(fileProblem("report.docx", Buffer.from("plain text"))).toMatch(/isn't a Word file/);
    expect(fileProblem("photo.jpg", Buffer.from("%PDF-1.4"))).toMatch(/isn't that kind of image/);
    expect(fileProblem("readme.txt", Buffer.from("MZ\x90\x00\x03"))).toMatch(/program, an archive/);
    expect(fileProblem("data.csv", Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]))).toMatch(/program/);
    expect(fileProblem("notes.md", zip({ "x.txt": new Uint8Array(10) }))).toMatch(/archive/);
  });

  it("refuses a zip bomb from its index, without unpacking it", () => {
    // 300 MB of zeros packs into a few hundred KB.
    const bomb = zip({ "word/document.xml": new Uint8Array(300 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
    const t0 = Date.now();
    expect(archiveProblem(bomb)).toMatch(/more than 200 MB/);
    // Read from the index: instant, nothing unpacked.
    expect(Date.now() - t0).toBeLessThan(500);
    expect(fileProblem("contract.docx", bomb)).toMatch(/more than 200 MB/);
    // Tightly packed but large: refused as a likely bomb even under 200 MB.
    expect(archiveProblem(zip({ "xl/sheet.xml": new Uint8Array(50 * 1024 * 1024) }))).toMatch(/zip bomb/);
    // Thousands of parts.
    const many: Record<string, Uint8Array> = {};
    for (let i = 0; i < 5_100; i++) many[`p${i}.xml`] = new Uint8Array(1);
    expect(archiveProblem(zip(many, 0))).toMatch(/too many parts/);
    expect(archiveProblem(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("broken")]))).toMatch(/damaged/);
  }, 120_000);

  it("is checked again before a stored file is read", async () => {
    await expect(extractText("report.pdf", Buffer.from("not a pdf"))).rejects.toThrow(/isn't a PDF/);
  });
});
