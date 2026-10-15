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
        light: field(part, "Accent") ?? field(part, "Light"),
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
      light: (field(part, "Accent") ?? field(part, "Light") ?? defaults.light).split(" ")[0],
      variants: /\*\*Variants:\*\* dark only/.test(part) ? ["dark"] : ["dark", "light"],
      dir,
      base,
      subject: part.match(/```text\n([\s\S]*?)\n```/)[1].trim(),
      spot: section === "Empty states in the app",
    });
  }
  return { shared, images };
}

/*
 * Two providers. Pollinations (POLLINATIONS_API_KEY): openai/gpt-image-2, the light variant made by
 * editing the dark image. NVIDIA (NVIDIA_API_KEY): FLUX.1-dev, which can't take our image as input, so
 * the light variant is generated from the same words and seed. FLUX draws whatever a prompt names, so it
 * gets a short "no words" line instead of the full avoid list.
 */
const PROVIDER = opt("provider", process.env.NVIDIA_API_KEY ? "nvidia" : "pollinations");
const FLUX = PROVIDER === "nvidia";
const BG_WORDS = { dark: "dark charcoal (#0F0F0F)", light: "soft off-white (#FBFBFB)" };
const FLUX_NO = "No words, letters, numbers or logos.";

function prompt({ shared }, img, variant) {
  const bg = shared.bg[img.kind].replaceAll("{BG}", BG_WORDS[variant]);
  const parts = [img.subject, img.spot ? shared.spot : null];
  if (FLUX) return [...parts, shared.style[variant], bg, FLUX_NO].filter(Boolean).join("\n\n");
  if (variant === "dark") return [...parts, shared.style.dark, bg, shared.avoid].filter(Boolean).join("\n\n");
  // Pollinations' light variant edits the dark image.
  return [
    "Recreate this exact image as its light version: keep the same composition, framing, shapes, proportions and empty space; change only the colours as follows.",
    shared.style.light,
    bg,
    shared.avoid,
  ].join("\n\n");
}

/* ── Generating ── */

// Made here as .jpg; images made by hand may also be .png, .jpeg or .webp.
const rawFile = (img, variant) => {
  const base = join(RAW, `${img.id}-${variant}`);
  return [".jpg", ".png", ".jpeg", ".webp"].map((ext) => base + ext).find((f) => existsSync(f)) ?? `${base}.jpg`;
};
const candidateFile = (img, seed) => join(RAW, "candidates", `${img.id}-dark@${seed}.jpg`);
// The chosen seed of each image (and of its light variant where it differs): FLUX makes the same picture
// again from the same words and seed, so the set can be remade.
const PICKS = join(ROOT, "design/image-picks.json");
const picks = () => (existsSync(PICKS) ? JSON.parse(readFileSync(PICKS, "utf8")) : {});

// FLUX.1-dev takes sides from 768 to 1344 in steps of 64.
const fluxSize = (img) => (img.w === img.h ? [1024, 1024] : img.w > img.h ? [1344, 896] : [896, 1344]);

async function request(url, init, label, decode) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(420_000) });
      const body = await r.json().catch(() => null);
      const buf = r.ok ? await decode(body) : null;
      if (buf) return buf;
      const message = body?.error?.message ?? body?.detail ?? `HTTP ${r.status}`;
      // Out of credit, a bad key or a refused prompt: no point retrying.
      if ([400, 401, 402, 403, 422].includes(r.status)) throw Object.assign(new Error(`${label}: ${message}`), { fatal: true });
      throw new Error(`${label}: ${message}`);
    } catch (e) {
      if (e.fatal || attempt >= 4) throw e;
      console.log(`  ${label}: ${e.message.split("\n")[0]}, retrying (${attempt})`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

function makeProvider(parsed) {
  if (FLUX) {
    const key = process.env.NVIDIA_API_KEY;
    const run = (img, variant, seed) => {
      const [width, height] = fluxSize(img);
      return request(
        "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt(parsed, img, variant), mode: "base", cfg_scale: 3.5, width, height, seed, steps: 50 }),
        },
        `${img.id} (${variant}, seed ${seed})`,
        (b) => {
          const a = b?.artifacts?.[0];
          if (a?.base64 && a.finishReason === "SUCCESS") return Buffer.from(a.base64, "base64");
          // A finished request that didn't make an image (e.g. CONTENT_FILTERED): another seed may work.
          if (a?.finishReason) throw Object.assign(new Error(`${img.id} (${variant}, seed ${seed}): ${a.finishReason}`), { fatal: true });
          return null;
        },
      );
    };
    return { dark: (img, seed) => run(img, "dark", seed), light: (img, seed) => run(img, "light", seed) };
  }
  const key = process.env.POLLINATIONS_API_KEY;
  const quality = (img) => opt("quality", img.kind === "scene" ? "high" : "medium");
  const decode = async (b) => {
    const d = b?.data?.[0];
    if (d?.b64_json) return Buffer.from(d.b64_json, "base64");
    if (d?.url) return Buffer.from(await (await fetch(d.url)).arrayBuffer());
    return null;
  };
  return {
    dark: (img, seed) =>
      request(
        `${API}/v1/images/generations`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: MODEL, prompt: prompt(parsed, img, "dark"), size: img.size, quality: quality(img), n: 1, seed }),
        },
        `${img.id} (dark)`,
        decode,
      ),
    light: (img, seed) => {
      const form = new FormData();
      form.set("model", MODEL);
      form.set("prompt", prompt(parsed, img, "light"));
      form.set("size", img.size);
      form.set("quality", quality(img));
      form.set("seed", String(seed));
      form.set("image[]", new Blob([readFileSync(rawFile(img, "dark"))], { type: "image/jpeg" }), `${img.id}-dark.jpg`);
      return request(`${API}/v1/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form }, `${img.id} (light)`, decode);
    },
  };
}

/*
 * generate                    each image's dark variant (seed from picks.json, or --seed), then its light one
 * generate --candidates n     n dark candidates per image in design/generated/candidates/, to choose from
 * pick id=seed …              use that candidate (its light variant is made on the next generate)
 * generate --only id --light-seed n   remake only the light variant, with its own seed (FLUX)
 */
async function generate() {
  const parsed = parse();
  const key = FLUX ? process.env.NVIDIA_API_KEY : process.env.POLLINATIONS_API_KEY;
  if (!key) throw new Error(FLUX ? "Set NVIDIA_API_KEY." : "Set POLLINATIONS_API_KEY.");
  const provider = makeProvider(parsed);
  const force = args.includes("--force");
  const candidates = Number(opt("candidates", 0));
  const chosen = picks();
  mkdirSync(join(RAW, "candidates"), { recursive: true });
  const todo = parsed.images.filter((i) => !only || only.includes(i.id));
  const jobs = [];
  for (const img of todo) {
    if (candidates) {
      const first = Number(opt("seed", 1));
      for (let seed = first; seed < first + candidates; seed++) jobs.push({ img, seed, candidate: true });
    } else {
      const seed = chosen[img.id] ?? Number(opt("seed", 1));
      const lightSeed = opt("light-seed", null);
      if (lightSeed !== null) {
        chosen[`${img.id}:light`] = Number(lightSeed);
        rmSync(rawFile(img, "light"), { force: true });
      }
      jobs.push({ img, seed, lightSeed: chosen[`${img.id}:light`] ?? seed });
    }
  }
  const failures = [];
  async function worker() {
    for (let job; (job = jobs.shift()); ) {
      const { img, seed } = job;
      try {
        const t = Date.now();
        if (job.candidate) {
          if (force || !existsSync(candidateFile(img, seed))) {
            writeFileSync(candidateFile(img, seed), await provider.dark(img, seed));
            console.log(`✓ ${img.id} candidate ${seed} (${Math.round((Date.now() - t) / 1000)} s)`);
          }
          continue;
        }
        if (force || !existsSync(rawFile(img, "dark"))) {
          writeFileSync(rawFile(img, "dark"), await provider.dark(img, seed));
          console.log(`✓ ${img.id} dark (${Math.round((Date.now() - t) / 1000)} s)`);
        }
        if (img.variants.includes("light") && (force || !existsSync(rawFile(img, "light")))) {
          const t2 = Date.now();
          writeFileSync(rawFile(img, "light"), await provider.light(img, job.lightSeed ?? seed));
          console.log(`✓ ${img.id} light (${Math.round((Date.now() - t2) / 1000)} s)`);
        }
      } catch (e) {
        failures.push(`${img.id}: ${e.message}`);
        console.log(`✗ ${e.message}`);
        if (e.fatal && /balance|pollen|credit|key|permission|unauthori/i.test(e.message)) jobs.length = 0;
      }
    }
  }
  await Promise.all(Array.from({ length: Number(opt("jobs", 3)) }, worker));
  if (opt("light-seed", null) !== null) writeFileSync(PICKS, JSON.stringify(chosen, null, 2) + "\n");
  if (!candidates) {
    const ready = todo.filter((img) => img.variants.every((v) => existsSync(rawFile(img, v)))).length;
    console.log(`${ready}/${todo.length} images ready in ${RAW}`);
  }
  if (failures.length) process.exit(1);
}

function pick() {
  const chosen = picks();
  const { images } = parse();
  for (const arg of args.slice(1)) {
    const [id, seed] = arg.split("=");
    const img = images.find((i) => i.id === id);
    if (!img || !existsSync(candidateFile(img, seed))) throw new Error(`No candidate ${arg}`);
    writeFileSync(rawFile(img, "dark"), readFileSync(candidateFile(img, seed)));
    rmSync(rawFile(img, "light"), { force: true });
    chosen[id] = Number(seed);
    console.log(`${id}: candidate ${seed}`);
  }
  writeFileSync(PICKS, JSON.stringify(chosen, null, 2) + "\n");
}

/* ── Exporting ── */

const smooth = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const CYAN = [0x22 / 255, 0xd3 / 255, 0xee / 255];

/*
 * Every picture is split into two layers, whatever colours the model used:
 * - a grey base (the dark variant a little deeper, the light one a little brighter);
 * - an accent layer: where the picture is saturated, as transparency, which the app paints in the
 *   organization's accent colour (CSS mask), so a re-coloured product gets matching pictures.
 * `colour` is the two put together in the brand cyan, for the places that can't paint (the desktop
 * app, the link preview).
 */
async function layers(sharp, img, variant) {
  const { data, info } = await sharp(rawFile(img, variant)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const base = Buffer.alloc(n * 3);
  const mask = Buffer.alloc(n * 4);
  const colour = Buffer.alloc(n * 3);
  // How colourful the background is (the median along the border): models tint it a little, light
  // variants use a pastel accent, so the accent is what's clearly more colourful than that, in a cyan hue.
  const chroma = (i) => (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2])) / 255;
  const border = [];
  for (let x = 0; x < info.width; x += 4) border.push(chroma(x * 3), chroma(((info.height - 1) * info.width + x) * 3));
  for (let y = 0; y < info.height; y += 4) border.push(chroma(y * info.width * 3), chroma((y * info.width + info.width - 1) * 3));
  border.sort((a, b) => a - b);
  const ground = border[Math.floor(border.length / 2)];
  // The background's brightness, mapped onto the page's own colour so the picture melts into the page
  // instead of sitting in a lighter or darker box.
  const lum = (i) => (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  const edge = [];
  for (let x = 0; x < info.width; x += 4) edge.push(lum(x * 3), lum(((info.height - 1) * info.width + x) * 3));
  for (let y = 0; y < info.height; y += 4) edge.push(lum(y * info.width * 3), lum((y * info.width + info.width - 1) * 3));
  edge.sort((a, b) => a - b);
  const groundL = Math.min(0.97, Math.max(0.02, edge[Math.floor(edge.length / 2)]));
  const pageL = variant === "dark" ? 15 / 255 : 251 / 255;
  const remap = (x) => (x <= groundL ? (x * pageL) / groundL : pageL + ((x - groundL) * (1 - pageL)) / (1 - groundL));
  let accentPixels = 0;
  for (let i = 0, j = 0, k = 0; i < data.length; i += 3, j += 4, k++) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const c = max - min;
    const l = remap(0.2126 * r + 0.7152 * g + 0.0722 * b);
    let hue = 0;
    if (c > 0) hue = (max === r ? ((g - b) / c + 6) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4) * 60;
    const cyanish = smooth(130, 155, hue) * (1 - smooth(215, 240, hue));
    const m = smooth(ground + 0.06, ground + 0.14, c) * cyanish;
    if (m > 0.5) accentPixels++;
    base[i] = base[i + 1] = base[i + 2] = Math.round(l * 255);
    mask[j] = mask[j + 1] = mask[j + 2] = 255;
    mask[j + 3] = Math.round(m * 255);
    for (let c = 0; c < 3; c++) colour[i + c] = Math.round((l * (1 - m) + CYAN[c] * m) * 255);
  }
  const raw = { raw: { width: info.width, height: info.height, channels: 3 } };
  // Specks of tinted background aren't accent: a median filter on the layer's transparency drops them.
  // Then only solid areas stay: grainy, half-coloured floors fall below the cut, real accent shapes don't.
  const alpha = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 4 } }).extractChannel(3).median(9).raw().toBuffer();
  for (let k = 0; k < n; k++) mask[k * 4 + 3] = Math.round(smooth(0.55, 0.85, alpha[k] / 255) * 255);
  const soft = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 4 } }).extractChannel(3).blur(0.6).raw().toBuffer();
  for (let k = 0; k < n; k++) mask[k * 4 + 3] = soft[k];
  return {
    base: await sharp(base, raw).png().toBuffer(),
    mask: await sharp(mask, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer(),
    colour: await sharp(colour, raw).png().toBuffer(),
    // A few stray pixels aren't an accent.
    hasAccent: accentPixels > n * 0.0005,
  };
}

/*
 * Empty-state pictures are shown small with faded edges, so their object has to be in the middle. Some
 * models put it low on a floor: find it (where the picture has edges, leaving out a horizon that runs
 * across the whole frame) and crop a square around it.
 */
async function subjectSquare(sharp, pipeline, width, height) {
  const N = 256;
  const { data } = await pipeline.clone().resize(N, N, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const grad = new Float32Array(N * N);
  for (let y = 1; y < N - 1; y++)
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      grad[i] = Math.abs(data[i + 1] - data[i - 1]) + Math.abs(data[i + N] - data[i - N]);
    }
  const sorted = Float32Array.from(grad).sort();
  const threshold = Math.max(12, sorted[Math.floor(sorted.length * 0.94)]);
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (let y = 2; y < N - 2; y++) {
    let row = 0;
    for (let x = 2; x < N - 2; x++) if (grad[y * N + x] > threshold) row++;
    if (row > N * 0.55) continue; // a horizon, not the object
    for (let x = 2; x < N - 2; x++)
      if (grad[y * N + x] > threshold) {
        x0 = Math.min(x0, x), x1 = Math.max(x1, x), y0 = Math.min(y0, y), y1 = Math.max(y1, y);
      }
  }
  if (x1 <= x0 || y1 <= y0) return null;
  // A square around the object, in the original's pixels; it may reach past the edges (see centredSquare).
  const side = Math.max((x1 - x0) * 1.7, (y1 - y0) * 1.7, N * 0.5);
  return { cx: ((x0 + x1) / 2) * (width / N), cy: ((y0 + y1) / 2) * (height / N), side: side * (Math.max(width, height) / N) };
}

/**
 * Where to crop so the object sits nearer the middle: a square of 55–80% of the frame around it, kept
 * inside the picture (extending the backdrop shows seams), so an object low in the frame moves up.
 */
async function centredBox(sharp, source) {
  const { width, height } = await sharp(source).metadata();
  const full = Math.min(width, height);
  const box = await subjectSquare(sharp, sharp(source), width, height);
  if (!box) return { left: Math.round((width - full) / 2), top: Math.round((height - full) / 2), width: full, height: full };
  const side = Math.round(Math.min(full * 0.8, Math.max(full * 0.55, box.side)));
  const left = Math.round(Math.min(width - side, Math.max(0, box.cx - side / 2)));
  const top = Math.round(Math.min(height - side, Math.max(0, box.cy - side / 2)));
  return { left, top, width: side, height: side };
}

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
      await sharp((await layers(sharp, img, "dark")).colour).resize(1200, 630, { fit: "cover", position: "centre" }).jpeg({ quality: 86, mozjpeg: true }).toFile(out);
      continue;
    }
    // 1× and 2× of the largest size it's shown at, never larger than what the model made (its own size,
    // not the one asked for: FLUX makes 1344×896 for 3:2). Empty states are cropped to a square.
    const real = await sharp(rawFile(img, "dark")).metadata();
    const w = img.spot ? Math.min(real.width, real.height) : real.width;
    const h = img.spot ? w : real.height;
    const widths = img.shown ? [...new Set([Math.min(img.shown[0], w), Math.min(img.shown[0] * 2, w)])] : [Math.min(960, w), w];
    let accent = false;
    for (const variant of img.variants) {
      // Split once, cropped the same way (empty states), then resized for each width.
      const parts = await layers(sharp, img, variant);
      let { base, mask } = parts;
      if (img.spot) {
        const box = await centredBox(sharp, base);
        base = await sharp(base).extract(box).png().toBuffer();
        mask = await sharp(mask).extract(box).png().toBuffer();
      }
      for (const width of widths) {
        const out = join(PUBLIC, img.dir, `${img.base}-${variant}-${width}.webp`);
        const info = await sharp(base).resize({ width, height: img.spot ? width : undefined, fit: "cover" }).webp({ quality: 80, effort: 6, smartSubsample: true }).toFile(out);
        bytes += info.size;
      }
      if (parts.hasAccent) {
        accent = true;
        // One size: a CSS mask can't pick between 1x and 2x, and the layer is mostly empty.
        const width = widths[widths.length - 1];
        const info = await sharp(mask).resize({ width, height: img.spot ? width : undefined, fit: "cover" }).webp({ quality: 85, alphaQuality: 90, effort: 6 }).toFile(join(PUBLIC, img.dir, `${img.base}-${variant}-accent.webp`));
        bytes += info.size;
      }
    }
    manifest[img.id] = { src: `/images/${img.dir}/${img.base}`, width: w, height: h, widths, variants: img.variants, accent };
  }
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  // The desktop app can only load its own files: the offline and connect screens' images (it's dark only).
  mkdirSync(DESKTOP, { recursive: true });
  for (const id of ["offline", "auth-panel"]) {
    const img = images.find((i) => i.id === id);
    if (!img || !manifest[id]) continue;
    await sharp((await layers(sharp, img, "dark")).colour).resize({ width: 720 }).webp({ quality: 78, effort: 6 }).toFile(join(DESKTOP, `${img.base}-dark.webp`));
  }
  const files = readdirSync(PUBLIC, { recursive: true }).filter((f) => /\.(webp|jpg)$/.test(f)).length;
  console.log(`${Object.keys(manifest).length} images, ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB of WebP in ${PUBLIC}`);
}

/* ── ── */

/*
 * prompts: design/image-prompts-by-hand.md, every image's full dark and light prompt, ready to paste into
 * any image tool, with its size and the file name to save it under (in design/generated/; then export).
 */
function promptsByHand() {
  const md = readFileSync(PROMPTS, "utf8");
  const parsed = parse();
  const where = (id) => {
    const block = md.split(/\n(?=#### )/).find((b) => b.startsWith("#### `" + id + "`")) ?? "";
    return block.match(/\*\*Where:\*\* ([\s\S]*?)(?=\n- \*\*|\n\n)/)?.[1].replace(/\s*\n\s*/g, " ").trim() ?? "";
  };
  const ratio = (img) => (img.w === img.h ? "1:1 (square), e.g. 1024×1024" : img.w > img.h ? "3:2 (landscape), e.g. 1536×1024" : "2:3 (portrait), e.g. 1024×1536");
  const out = [
    "# Image prompts, one by one",
    "",
    "Every picture in Aatmiq, with the full prompt to paste into an image tool (ChatGPT, Midjourney, Firefly, FLUX…), the shape to ask for, and the file name to save it under. Generated from `design/image-prompts.md` by `node scripts/generate-images.mjs prompts`.",
    "",
    "**How to use it**",
    "",
    "1. Make the **dark** version first, from its prompt. Make 2–4 and keep the best: no text, nothing extra, the object in the middle.",
    "2. Make the **light** version. Best: attach the dark image you kept and paste the *light from the dark one* prompt below, so both have the same composition. Otherwise paste the image's own light prompt.",
    "3. Save the files with the names given (`.jpg` or `.png`) into `design/generated/`, or send them to me.",
    "4. Run `node scripts/generate-images.mjs export` (or ask me): it makes the greys neutral, splits off the accent so the app can paint it in the organization's colour, centres the empty-state objects and writes the WebP files the app uses.",
    "",
    "Don't worry about the exact greys: the export makes them consistent. What matters is the subject, flat shapes, one small cyan accent, a plain background and no text.",
    "",
    "**Light from the dark one** (attach the dark image, then paste):",
    "",
    "```text",
    [
      "Recreate this exact image as its light version: keep the same composition, framing, shapes, proportions and empty space; change only the colours as follows.",
      parsed.shared.style.light,
      "On a plain solid background of soft off-white (#FBFBFB) that fills the whole frame. Keep the cyan accent on the same part.",
      parsed.shared.avoid,
    ].join("\n\n"),
    "```",
    "",
  ];
  let section = "";
  for (const img of parsed.images) {
    if (img.section !== section) {
      section = img.section;
      out.push(`## ${section}`, "");
    }
    const light = img.variants.includes("light");
    out.push(
      `### ${img.id}`,
      "",
      `- **Where:** ${where(img.id)}`,
      `- **Shape:** ${ratio(img)}`,
      `- **Save as:** \`${img.id}-dark.jpg\`${light ? ` and \`${img.id}-light.jpg\`` : " (dark only)"}`,
      "",
      "Dark:",
      "",
      "```text",
      handPrompt(parsed, img, "dark"),
      "```",
      "",
    );
    if (light) out.push("Light:", "", "```text", handPrompt(parsed, img, "light"), "```", "");
  }
  writeFileSync(join(ROOT, "design/image-prompts-by-hand.md"), out.join("\n"));
  console.log(`${parsed.images.length} images → design/image-prompts-by-hand.md`);
}

/** One paragraph per part, for any tool: subject, style, background, avoid. */
function handPrompt({ shared }, img, variant) {
  return [img.subject, img.spot ? shared.spot : null, shared.style[variant], shared.bg[img.kind].replaceAll("{BG}", BG_WORDS[variant]), shared.avoid]
    .filter(Boolean)
    .join("\n\n");
}

if (cmd === "list") {
  const parsed = parse();
  for (const img of parsed.images.filter((i) => !only || only.includes(i.id))) {
    console.log(`\n## ${img.id} · ${img.kind} · ${img.size} · ${img.variants.join("+")} · ${img.dir}/${img.base} · ${PROVIDER}\n\n${prompt(parsed, img, "dark")}`);
    if (args.includes("--light") && img.variants.includes("light")) console.log(`\n### light\n\n${prompt(parsed, img, "light")}`);
  }
} else if (cmd === "generate") {
  await generate();
} else if (cmd === "pick") {
  pick();
} else if (cmd === "prompts") {
  promptsByHand();
} else if (cmd === "export") {
  await exportAll();
} else {
  console.log("Usage: node scripts/generate-images.mjs list|generate|export  (see the comment at the top)");
  process.exit(1);
}
