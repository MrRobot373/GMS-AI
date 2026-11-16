export default async function grade(ctx) {
  const there = ctx.exists("stats.py");
  const probe = (expr) => {
    if (!there) return null;
    const r = ctx.run("python3", ["-c", `from stats import average\nprint(repr(${expr}))`]);
    return r.code === 0 ? r.stdout.trim() : null;
  };
  return {
    empty_fixed: probe("average([])") === "0.0",
    still_works: probe("average([1, 2, 3])") === "2.0" && probe("average([2.5])") === "2.5",
    test_file_made: ctx.exists("test_stats.py") && /average/.test(ctx.read("test_stats.py")),
    tests_run: ctx.toolCalls(/^(bash|pwsh)$/).some((c) => /test_stats/.test(String(c.args?.command ?? ""))),
  };
}
