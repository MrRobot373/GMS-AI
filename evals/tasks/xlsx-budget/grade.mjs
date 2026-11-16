export default async function grade(ctx) {
  if (!ctx.exists("budget.xlsx")) return { no_errors: false, enough_formulas: false, has_chart: false };
  const a = ctx.audit(["budget.xlsx"], "formulas:12,charts:1");
  return {
    no_errors: a.otherFails(["formulas", "charts"]).length === 0,
    enough_formulas: !a.failed("formulas"),
    has_chart: !a.failed("charts"),
  };
}
