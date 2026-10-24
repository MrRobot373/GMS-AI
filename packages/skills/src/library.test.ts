import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIBRARY_CATEGORIES, SKILL_MATURITY_LEVELS, SKILL_RISK_LEVELS, librarySkills, skillCatalog } from "./index";

const skills = librarySkills();

function pythonBin(): string {
  for (const bin of ["python3", "python"]) {
    if (spawnSync(bin, ["--version"], { encoding: "utf8" }).status === 0) return bin;
  }
  return "python3";
}

const PYTHON = pythonBin();

describe("skill library", () => {
  it("has skills in every category", () => {
    expect(skills.length).toBeGreaterThanOrEqual(50);
    for (const c of LIBRARY_CATEGORIES) expect(skills.some((s) => s.category === c)).toBe(true);
  });

  it("names are valid, unique and match their folders; descriptions say when to use them", () => {
    const names = new Set<string>();
    for (const s of skills) {
      expect(s.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(basename(s.dir)).toBe(s.slug);
      expect(names.has(s.slug)).toBe(false);
      names.add(s.slug);
      expect(s.description.length).toBeGreaterThan(60);
      expect(s.description.length).toBeLessThanOrEqual(160);
      expect(s.description).toMatch(/^Use (when|for)/);
      // The raw frontmatter declares a category we recognize.
      expect(readFileSync(join(s.dir, "SKILL.md"), "utf8")).toMatch(new RegExp(`\\ncategory: ${s.category.replace("&", "\\&")}\\r?\\n`));
      expect(s.body).toMatch(/^# /m);
      expect(s.body).toMatch(/## Done when/);
    }
  });

  it("every script a skill mentions exists, and Python scripts compile", () => {
    for (const s of skills) {
      for (const m of s.body.matchAll(/(?<!\.\/)scripts\/([\w.-]+\.(?:py|sh))/g)) {
        const own = join(s.dir, "scripts", m[1]!);
        const sibling = skills.some((o) => existsSync(join(o.dir, "scripts", m[1]!)));
        expect(existsSync(own) || sibling, `${s.slug} mentions scripts/${m[1]}`).toBe(true);
      }
      for (const f of s.files.filter((f) => f.endsWith(".py"))) execFileSync(PYTHON, ["-c", "import ast, sys; ast.parse(open(sys.argv[1], encoding='utf-8').read())", join(s.dir, f)]);
      for (const f of s.files.filter((f) => f.endsWith(".sh"))) {
        execFileSync("bash", ["-n"], { input: readFileSync(join(s.dir, f), "utf8").replaceAll("\r\n", "\n") });
      }
    }
  }, 120_000);

  it("cross-references point to real skills", () => {
    const names = new Set(skills.map((s) => s.slug));
    for (const s of skills) {
      for (const m of s.body.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)+)` skill|see `([a-z0-9]+(?:-[a-z0-9]+)+)`|follow(?:ing)? `([a-z0-9]+(?:-[a-z0-9]+)+)`/g)) {
        const ref = m[1] ?? m[2] ?? m[3];
        expect(names.has(ref!), `${s.slug} refers to ${ref}`).toBe(true);
      }
    }
  });

  it("keeps the organizational catalog and the phase-0 contract", () => {
    const root = join(skills[0]!.dir, "..", "..");
    execFileSync(PYTHON, [join(root, "catalog", "build_catalog.py"), "--check"], { encoding: "utf8" });
    const catalog = skillCatalog();
    expect(catalog.entries).toHaveLength(195);
    const names = new Set(catalog.entries.map((e) => e.name));
    expect(names.size).toBe(195);
    const installed = new Set(skills.map((s) => s.slug));
    for (const entry of catalog.entries) {
      if (entry.status === "proposed") {
        expect(entry.installedAs).toBeNull();
        expect(entry.coveredBy).toBeNull();
      }
      if (entry.installedAs) expect(installed.has(entry.installedAs)).toBe(true);
      if (entry.coveredBy) expect(installed.has(entry.coveredBy)).toBe(true);
    }
    for (const slug of catalog.retainedLibrary) expect(installed.has(slug)).toBe(true);
    const phase0 = skills.filter((s) => s.maturity);
    expect(phase0.map((s) => s.slug).sort()).toEqual([
      "agent-tool-design",
      "artifact-quality-control",
      "audit-log-and-reporting",
      "evidence-and-provenance",
      "llm-evaluation",
      "permission-and-approval-planner",
      "prompt-injection-defense",
      "skill-authoring",
      "skill-registry-admin",
      "skill-router",
      "template-library",
      "workflow-orchestration",
    ]);
    for (const s of phase0) {
      expect(s.category).toBe("Platform");
      expect(s.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(s.ownerTeam).toBeTruthy();
      expect(SKILL_RISK_LEVELS).toContain(s.riskLevel);
      expect(SKILL_MATURITY_LEVELS).toContain(s.maturity);
      expect(s.maturity).toBe("draft");
      execFileSync(PYTHON, [join(skills.find((x) => x.slug === "skill-authoring")!.dir, "scripts", "validate_skill.py"), s.dir], { encoding: "utf8" });
    }
    const inspector = join(skills.find((s) => s.slug === "artifact-quality-control")!.dir, "scripts", "inspect_artifact.py");
    execFileSync(PYTHON, [inspector, "--self-test"], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  }, 120_000);
});
