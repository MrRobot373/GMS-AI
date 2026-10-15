#!/usr/bin/env node
/**
 * The product's images, from the prompts in design/image-prompts.md.
 *
 *   node scripts/generate-images.mjs list [--only id,…]          the jobs and their full prompts
 *   POLLINATIONS_API_KEY=sk_… node scripts/generate-images.mjs generate [--only id,…] [--force] [--seed n] [--jobs n] [--quality q]
 *   node scripts/generate-images.mjs export                        WebP files for the web app and the desktop app
 *
 * generate makes each image's dark variant from its prompt, then its light variant by converting the dark one
 * (same composition), through the Pollinations API (https://gen.pollinations.ai, OpenAI-compatible). Scenes are
 * made at high quality; objects, shown small, at medium (a quarter of the cost). The originals go to
 * design/generated/ (not committed). A different --seed makes a new candidate of an image.
 * export writes apps/web/public/images/**, the manifest the <Art> component reads, and the desktop app's copies.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPTS = join(ROOT, "design/image-prompts.md");
const RAW = join(ROOT, "design/generated");
const PUBLIC = join(ROOT, "apps/web/public/images");
const MANIFEST = join(ROOT, "apps/web/src/components/art/manifest.json");
const DESKTOP = join(ROOT, "apps/desktop/static/art");
const API = process.env.POLLINATIONS_BASE_URL ?? "https://gen.pollinations.ai";
const MODEL = process.env.IMAGE_MODEL ?? "openai/gpt-image-2";
const BG = { dark: "#0F0F0F", light: "#FBFBFB" };

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : (args[i + 1] ?? true);
};
const only = opt("only", null)?.split(",");

/* ── The prompts file ── */

function parse() {
  const md = readFileSync(PROMPTS, "utf8");
  const block = (label) => {
    const m = md.match(new RegExp("\\(`" + label + "`[^\\n]*\\n\\n```text\\n([\\s\\S]*?)\\n```"));
    if (!m) throw new Error(`${PROMPTS}: no \`${label}\` block`);
    return m[1].trim();
  };
  const shared = {
    style: { dark: block("style-dark"), light: block("style-light") },
    bg: { object: block("bg-object"), scene: block("bg-scene") },
    avoid: block("avoid"),
    spot: md.match(/Add this to the Subject of each empty-state image:\n\n```text\n([\s\S]*?)\n```/)[1].trim(),
  };

  const images = [];
  let section = "";
  let defaults = {};
  const field = (text, name) => text.match(new RegExp(`\\*\\*${name}:\\*\\* ([^·\\n]+)`))?.[1].trim();
  for (const part of md.split(/\n(?=#{3,4} )/)) {
    const h3 = part.match(/^### (.+)/);
    if (h3) {
      section = h3[1];
      defaults = {
        generate: field(part, "Generate"),
        shown: field(part, "Shown"),
        light: field(part, "Light"),
        files: part.match(/\*\*Files?:\*\* `([^`]+)`/)?.[1],
        kind: /\*\*Kind:\*\* object/.test(part) ? "object" : undefined,
      };
      continue;
    }
    const h4 = part.match(/^#### `([a-z-]+)`/);
    if (!h4) continue;
    const id = h4[1];
    const generate = field(part, "Generate") ?? defaults.generate;
    const [w, h] = generate.match(/(\d+)×(\d+)/).slice(1).map(Number);
    const shownText = field(part, "Shown") ?? defaults.shown;
    const shown = shownText?.match(/^(\d+)×(\d+)/)?.slice(1).map(Number) ?? null;
    const file = part.match(/\*\*File:\*\* `([^`]+)`/)?.[1] ?? defaults.files.replace("<name>", id.replace(/^empty-/, ""));
    const [, dir, base] = file.match(/images\/([a-z]+)\/([a-z-]+?)(?:-\{dark,light\})?\.(?:webp|jpg)$/);
    images.push({
      id,
      section,
      kind: part.match(/\*\*Kind:\*\* (object|scene)/)?.[1] ?? defaults.kind,
      size: `${w}x${h}`,
      w,
      h,
      shown,
      light: (field(part, "Light") ?? defaults.light).split(" ")[0],
      variants: /\*\*Variants:\*\* dark only/.test(part) ? ["dark"] : ["dark", "light"],
      dir,
      base,
      subject: part.match(/```text\n([\s\S]*?)\n```/)[1].trim(),
      spot: section === "Empty states in the app",
    });
  }
  return { shared, images };
}

const GLOW = {
  cyan: "The glowing light is a small, soft cyan (#22D3EE), the only colour in the image.",
  white: "The glowing light is a soft warm white (#F3EFE6); there is no other colour in the image.",
};
const hasGlow = (subject) => /glow|inner light|line of light|light pouring/i.test(subject);

function darkPrompt({ shared }, img) {
  return [img.subject, img.spot ? shared.spot : null, hasGlow(img.subject) ? GLOW[img.light] : null, shared.style.dark, shared.bg[img.kind].replaceAll("{BG}", BG.dark), shared.avoid]
    .filter(Boolean)
    .join("\n\n");
}

function lightPrompt({ shared }, img) {
  return [
    "Recreate this exact image as its light version: keep the same composition, camera angle, framing, objects, proportions and empty space; change only the material, the light and the colours as follows.",
    hasGlow(img.subject) ? `Keep the glowing light in the same place. ${GLOW[img.light]}` : null,
    shared.style.light,
    shared.bg[img.kind].replaceAll("{BG}", BG.light),
    "The tones are neutral off-white, very slightly warm, never peach, beige or yellow.",
    shared.avoid,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* ── Generating ── */

const rawFile = (img, variant) => join(RAW, `${img.id}-${variant}.jpg`);

async function call(path, init, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${API}${path}`, { ...init, signal: AbortSignal.timeout(420_000) });
      const body = await r.json().catch(() => null);
      if (r.ok && body?.data?.[0]) {
        const d = body.data[0];
        if (d.b64_json) return Buffer.from(d.b64_json, "base64");
        if (d.url) return Buffer.from(await (await fetch(d.url)).arrayBuffer());
      }
      const message = body?.error?.message ?? `HTTP ${r.status}`;
      // Out of credit, a bad key or a refused prompt: no point retrying.
      if ([400, 401, 402, 403].includes(r.status)) throw Object.assign(new Error(`${label}: ${message}`), { fatal: true });
      throw new Error(`${label}: ${message}`);
    } catch (e) {
      // gen keeps generating after a dropped connection; the same request picks up the result.
      if (e.fatal || attempt >= 4) throw e;
      console.log(`  ${label}: ${e.message.split("\n")[0]}, retrying (${attempt})`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

async function generate() {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) throw new Error("Set POLLINATIONS_API_KEY.");
  const parsed = parse();
  const seed = Number(opt("seed", 1));
  const force = args.includes("--force");
  const quality = (img) => opt("quality", img.kind === "scene" ? "high" : "medium");
  mkdirSync(RAW, { recursive: true });
  const todo = parsed.images.filter((i) => !only || only.includes(i.id));
  const queue = [...todo];
  const failures = [];

  async function worker() {
    for (let img; (img = queue.shift()); ) {
      try {
        const dark = rawFile(img, "dark");
        if (force || !existsSync(dark)) {
          const t = Date.now();
          const buf = await call(
            "/v1/images/generations",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: MODEL, prompt: darkPrompt(parsed, img), size: img.size, quality: quality(img), n: 1, seed }),
            },
            `${img.id} (dark)`,
          );
          writeFileSync(dark, buf);
          console.log(`✓ ${img.id} dark (${Math.round((Date.now() - t) / 1000)} s)`);
        }
        if (img.variants.includes("light") && (force || !existsSync(rawFile(img, "light")))) {
          const t = Date.now();
          const form = new FormData();
          form.set("model", MODEL);
          form.set("prompt", lightPrompt(parsed, img));
          form.set("size", img.size);
          form.set("quality", quality(img));
          form.set("seed", String(seed));
          form.set("image[]", new Blob([readFileSync(dark)], { type: "image/jpeg" }), `${img.id}-dark.jpg`);
          const buf = await call("/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form }, `${img.id} (light)`);
          writeFileSync(rawFile(img, "light"), buf);
          console.log(`✓ ${img.id} light (${Math.round((Date.now() - t) / 1000)} s)`);
        }
      } catch (e) {
        failures.push(`${img.id}: ${e.message}`);
        console.log(`✗ ${e.message}`);
        if (e.fatal && /balance|pollen|key|permission/i.test(e.message)) queue.length = 0;
      }
    }
  }
  await Promise.all(Array.from({ length: Number(opt("jobs", 3)) }, worker));
  const ready = todo.filter((img) => img.variants.every((v) => existsSync(rawFile(img, v)))).length;
  console.log(`${ready}/${todo.length} images ready in ${RAW}`);
  if (failures.length) process.exit(1);
}

/* ── Exporting ── */

async function exportAll() {
  const next = createRequire(join(ROOT, "apps/web/package.json")).resolve("next/package.json");
  const sharp = createRequire(next)("sharp");
  const { images } = parse();
  rmSync(PUBLIC, { recursive: true, force: true });
  rmSync(DESKTOP, { recursive: true, force: true });
  const manifest = {};
  let bytes = 0;
  for (const img of images) {
    const missing = img.variants.filter((v) => !existsSync(rawFile(img, v)));
    if (missing.length) {
      console.log(`– ${img.id}: not generated yet (${missing.join(", ")})`);
      continue;
    }
    mkdirSync(join(PUBLIC, img.dir), { recursive: true });
    if (img.id === "og-image") {
      // The link preview's art, cropped to 1200×630; the card adds the logo and headline.
      const out = join(PUBLIC, img.dir, `${img.base}.jpg`);
      await sharp(rawFile(img, "dark")).resize(1200, 630, { fit: "cover", position: "centre" }).jpeg({ quality: 86, mozjpeg: true }).toFile(out);
      continue;
    }
    // 1× and 2× of the largest size it's shown at, never larger than the original.
    const widths = img.shown ? [...new Set([img.shown[0], Math.min(img.shown[0] * 2, img.w)])] : [960, img.w];
    for (const variant of img.variants) {
      for (const width of widths) {
        const out = join(PUBLIC, img.dir, `${img.base}-${variant}-${width}.webp`);
        const info = await sharp(rawFile(img, variant)).resize({ width }).webp({ quality: 80, effort: 6, smartSubsample: true }).toFile(out);
        bytes += info.size;
      }
    }
    manifest[img.id] = { src: `/images/${img.dir}/${img.base}`, width: img.w, height: img.h, widths, variants: img.variants };
  }
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  // The desktop app can only load its own files: the offline and connect screens' images (it's dark only).
  mkdirSync(DESKTOP, { recursive: true });
  for (const id of ["offline", "auth-panel"]) {
    const img = images.find((i) => i.id === id);
    if (!img || !manifest[id]) continue;
    await sharp(rawFile(img, "dark")).resize({ width: 720 }).webp({ quality: 78, effort: 6 }).toFile(join(DESKTOP, `${img.base}-dark.webp`));
  }
  const files = readdirSync(PUBLIC, { recursive: true }).filter((f) => /\.(webp|jpg)$/.test(f)).length;
  console.log(`${Object.keys(manifest).length} images, ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB of WebP in ${PUBLIC}`);
}

/* ── ── */

if (cmd === "list") {
  const parsed = parse();
  for (const img of parsed.images.filter((i) => !only || only.includes(i.id))) {
    console.log(`\n## ${img.id} · ${img.kind} · ${img.size} · ${img.variants.join("+")} · ${img.dir}/${img.base}\n\n${darkPrompt(parsed, img)}`);
    if (args.includes("--light") && img.variants.includes("light")) console.log(`\n### light (from the dark image)\n\n${lightPrompt(parsed, img)}`);
  }
} else if (cmd === "generate") {
  await generate();
} else if (cmd === "export") {
  await exportAll();
} else {
  console.log("Usage: node scripts/generate-images.mjs list|generate|export  (see the comment at the top)");
  process.exit(1);
}
