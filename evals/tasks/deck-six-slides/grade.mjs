export default async function grade(ctx) {
  if (!ctx.exists("deck.pptx")) return { six_slides: false, notes_on_all: false, native_chart: false, no_other_failures: false };
  const a = ctx.audit(["deck.pptx"], "slides:6-6,notes,charts:1");
  return {
    six_slides: !a.failed("slides"),
    notes_on_all: !a.failed("notes"),
    native_chart: !a.failed("charts"),
    no_other_failures: a.otherFails(["slides", "notes", "charts"]).length === 0,
  };
}
