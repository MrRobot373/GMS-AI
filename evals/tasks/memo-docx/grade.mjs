import { EvalError } from "../../lib/errors.mjs";

export default async function grade(ctx) {
  if (!ctx.exists("memo.docx")) return { length_ok: false, page_numbers: false, has_table: false, no_other_failures: false };
  const a = ctx.audit(["memo.docx"], "pages:1-2,page_numbers");
  // Without LibreOffice the audit can't count pages: that's a check that couldn't run, not a pass.
  if (a.warns.some((w) => /^layout:.*not checked/i.test(w))) throw new EvalError("the page count needs LibreOffice, which isn't installed here");
  const tables = Number(/tables: (\d+)/.exec(a.output)?.[1] ?? 0);
  return {
    length_ok: !a.failed("pages"),
    page_numbers: !a.failed("footer"),
    has_table: tables >= 1,
    no_other_failures: a.otherFails(["pages", "footer"]).length === 0,
  };
}
