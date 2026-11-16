const CASES = { odd_count: ["3 1 2\n", 2], even_count: ["4 1 3 2\n", 2.5], single_value: ["7\n", 7], newline_separated: ["5\n1\n3\n", 3] };
export default async function grade(ctx) {
  const out = {};
  const there = ctx.exists("median.py");
  for (const [name, [input, want]] of Object.entries(CASES)) {
    if (!there) {
      out[name] = false;
      continue;
    }
    const r = ctx.run("python3", ["median.py"], { input });
    out[name] = r.code === 0 && Math.abs(Number(r.stdout.trim()) - want) < 1e-9;
  }
  out.ran_it = ctx.toolCalls(/^(bash|pwsh)$/).some((c) => /median\.py/.test(String(c.args?.command ?? "")));
  return out;
}
