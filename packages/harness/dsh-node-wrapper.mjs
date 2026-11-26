/**
 * Node.js wrapper for the DSH CLI binary.
 *
 * The DSH bin.js uses `if (import.meta.main) await runCli();` which is a Bun-specific
 * idiom. Under Node.js, `import.meta.main` is undefined (falsy), so runCli() never
 * executes and the process exits 0 immediately.
 *
 * This wrapper imports the bin as a module (bypassing the import.meta.main guard) and
 * calls runCli() explicitly, making it work under Node.js.
 *
 * Usage: set AATMIQ_DSH_CLI=<absolute-path-to-this-file> in .env
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the DSH package from this file's location (harness package)
const __dirname = dirname(fileURLToPath(import.meta.url));

// Walk up to find node_modules with @deepseek-ai/dsh
function findDshBin() {
  const require = createRequire(import.meta.url);
  try {
    const pkgPath = require.resolve("@deepseek-ai/dsh/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const bin = typeof pkg.bin === "string" ? pkg.bin : (pkg.bin?.dsh ?? Object.values(pkg.bin ?? {})[0]);
    if (!bin) throw new Error("No bin entry in @deepseek-ai/dsh/package.json");
    return join(dirname(pkgPath), bin);
  } catch (e) {
    throw new Error(`Cannot locate @deepseek-ai/dsh CLI: ${e.message}`);
  }
}

const binPath = findDshBin();
const { runCli } = await import(pathToFileURL(binPath).href);
await runCli();
