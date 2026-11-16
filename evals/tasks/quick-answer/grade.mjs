export default async function grade(ctx) {
  const said = ctx.answer.trim().replace(/[.\s]+$/, "").replace(/^\*\*|\*\*$/g, "");
  return { exact_number: said === "408", made_no_files: ctx.files().length === 0 };
}
