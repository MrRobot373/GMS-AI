const WANT = { Cedar: 199.99, Acme: 144.99, Birch: 40.0, Dune: 12.5 };
export default async function grade(ctx) {
  if (!ctx.exists("totals.csv")) return { file_made: false, totals_correct: false, sorted_desc: false };
  const lines = ctx.read("totals.csv").trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines[0]?.toLowerCase().replace(/\s/g, "");
  const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  const totals = Object.fromEntries(rows.map(([c, t]) => [c, Number(String(t).replace(/[$,]/g, ""))]));
  const correct = Object.keys(WANT).every((k) => Math.abs((totals[k] ?? NaN) - WANT[k]) < 0.005) && rows.length === Object.keys(WANT).length;
  const values = rows.map((r) => Number(String(r[1]).replace(/[$,]/g, "")));
  return {
    file_made: header === "customer,total",
    totals_correct: correct,
    sorted_desc: values.length > 1 && values.every((v, i) => i === 0 || values[i - 1] >= v),
  };
}
