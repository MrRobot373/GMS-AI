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

/*
 * Two providers. Pollinations (POLLINATIONS_API_KEY): openai/gpt-image-2, the light variant made by
 * editing the dark image. NVIDIA (NVIDIA_API_KEY): FLUX.1-dev, which can't take our image as input, so
 * the light variant is generated from the same words and seed. FLUX draws whatever a prompt names, so it
 * gets no "avoid" list, and it needs the colour spelled out.
 */
const PROVIDER = opt("provider", process.env.NVIDIA_API_KEY ? "nvidia" : "pollinations");
const FLUX = PROVIDER === "nvidia";
const BG_WORDS = { dark: "near-black charcoal (#0F0F0F)", light: "soft off-white (#FBFBFB)" };
const fluxMono = (img) =>
  `Shot as a black-and-white photograph: every surface, the sky and the background are neutral grey with no colour cast, no blue, teal, green or brown tint${hasGlow(img.subject) ? "; the small glow is the only colour" : ""}.`;
const FLUX_TONE = {
  dark: "Low-key, dark and moody exposure: the image is mostly deep near-black charcoal, the subject lit softly.",
  light: "High-key, bright and airy exposure: the image is mostly soft off-white, the subject lit softly.",
};
const FLUX_ONLY = "Only the objects described, nothing else in the frame.";
// FLUX puts small objects on a floor at the bottom; empty states need them in the middle.
const FLUX_SPOT =
  "Product shot from a high angle, looking down at about 50 degrees, so the background is only the seamless floor surface: no wall, no horizon and no floor edge anywhere in the frame. The object sits exactly in the middle of the square frame and fills about half of it, with equal empty space above, below and on both sides, and a soft shadow right under it.";

function prompt({ shared }, img, variant) {
  const bg = shared.bg[img.kind].replaceAll("{BG}", FLUX ? BG_WORDS[variant] : BG[variant]);
  if (FLUX) {
    return [img.subject, img.spot ? FLUX_SPOT : null, hasGlow(img.subject) ? GLOW[img.light] : null, fluxMono(img), FLUX_TONE[variant], shared.style[variant], bg, FLUX_ONLY]
      .filter(Boolean)
      .join("\n\n");
  }
  if (variant === "dark") {
    return [img.subject, img.spot ? shared.spot : null, hasGlow(img.subject) ? GLOW[img.light] : null, shared.style.dark, bg, shared.avoid].filter(Boolean).join("\n\n");
  }
  // Pollinations' light variant edits the dark image.
  return [
    "Recreate this exact image as its light version: keep the same composition, camera angle, framing, objects, proportions and empty space; change only the material, the light and the colours as follows.",
    hasGlow(img.subject) ? `Keep the glowing light in the same place. ${GLOW[img.light]}` : null,
    shared.style.light,
    bg,
    "The tones are neutral off-white, very slightly warm, never peach, beige or yellow.",
    shared.avoid,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* ── Generating ── */

const rawFile = (img, variant) => join(RAW, `${img.id}-${variant}.jpg`);
const candidateFile = (img, seed) => join(RAW, "candidates", `${img.id}-dark@${seed}.jpg`);
const PICKS = join(RAW, "picks.json");
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
    } else jobs.push({ img, seed: chosen[img.id] ?? Number(opt("seed", 1)) });
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
          writeFileSync(rawFile(img, "light"), await provider.light(img, seed));
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
 * The same grade for every image, whatever the model did: neutral grey everywhere (models like to tint
 * a dusk scene teal or a studio warm), the dark variant a little deeper and the light one a little
 * brighter, and the glow, the only saturated part, in the brand cyan (marketing) or white (the app).
 */
async function graded(sharp, img, variant) {
  const { data, info } = await sharp(rawFile(img, variant)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  const cyan = img.light === "cyan";
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max ? (max - min) / max : 0;
    let l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    l = variant === "dark" ? Math.pow(l, 1.2) : 1 - Math.pow(1 - l, 1.2);
    let o = [l, l, l];
    if (cyan) {
      const m = smooth(0.15, 0.35, sat) * smooth(0.25, 0.5, max);
      if (m > 0) o = o.map((c, k) => c * (1 - m) + Math.min(1, (CYAN[k] / CYAN[2]) * Math.max(max, l)) * m);
    }
    out[i] = Math.round(o[0] * 255);
    out[i + 1] = Math.round(o[1] * 255);
    out[i + 2] = Math.round(o[2] * 255);
  }
  return sharp(out, { raw: info });
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

/** The picture with its object in the middle: the backdrop is extended (mirrored at its edge) where needed. */
async function centredSquare(sharp, source) {
  const { width, height } = await sharp(source).metadata();
  const box = await subjectSquare(sharp, sharp(source), width, height);
  if (!box) return source;
  const half = Math.round(box.side / 2);
  const pad = {
    left: Math.max(0, half - Math.round(box.cx)),
    right: Math.max(0, Math.round(box.cx) + half - width),
    top: Math.max(0, half - Math.round(box.cy)),
    bottom: Math.max(0, Math.round(box.cy) + half - height),
  };
  const extended = await sharp(source).extend({ ...pad, extendWith: "mirror" }).png().toBuffer();
  return sharp(extended)
    .extract({ left: Math.round(box.cx) + pad.left - half, top: Math.round(box.cy) + pad.top - half, width: half * 2, height: half * 2 })
    .png()
    .toBuffer();
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
      await (await graded(sharp, img, "dark")).resize(1200, 630, { fit: "cover", position: "centre" }).jpeg({ quality: 86, mozjpeg: true }).toFile(out);
      continue;
    }
    // 1× and 2× of the largest size it's shown at, never larger than the original.
    const widths = img.shown ? [...new Set([img.shown[0], Math.min(img.shown[0] * 2, img.w)])] : [960, img.w];
    for (const variant of img.variants) {
      // Graded once, into a buffer, then cropped (empty states) and resized for each width.
      let source = await (await graded(sharp, img, variant)).png().toBuffer();
      if (img.spot) source = await centredSquare(sharp, source);
      for (const width of widths) {
        const out = join(PUBLIC, img.dir, `${img.base}-${variant}-${width}.webp`);
        const info = await sharp(source).resize({ width, height: img.spot ? width : undefined, fit: "cover" }).webp({ quality: 80, effort: 6, smartSubsample: true }).toFile(out);
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
    await (await graded(sharp, img, "dark")).resize({ width: 720 }).webp({ quality: 78, effort: 6 }).toFile(join(DESKTOP, `${img.base}-dark.webp`));
  }
  const files = readdirSync(PUBLIC, { recursive: true }).filter((f) => /\.(webp|jpg)$/.test(f)).length;
  console.log(`${Object.keys(manifest).length} images, ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB of WebP in ${PUBLIC}`);
}

/* ── ── */

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
} else if (cmd === "export") {
  await exportAll();
} else {
  console.log("Usage: node scripts/generate-images.mjs list|generate|export  (see the comment at the top)");
  process.exit(1);
}
