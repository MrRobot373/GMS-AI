export default async function grade(ctx) {
  const text = ctx.exists("actions.md") ? ctx.read("actions.md") : "";
  const lines = text.split("\n");
  const line = (re) => lines.filter((l) => re.test(l));
  const has = (re) => line(re).length > 0;
  const v = await ctx.judge();
  return {
    four_actions: has(/pricing/i) && has(/venue/i) && has(/domain/i) && has(/budget/i),
    owners_right: line(/pricing/i).some((l) => /priya/i.test(l)) && line(/venue/i).some((l) => /marcus/i.test(l)) && line(/budget/i).some((l) => /lena/i.test(l)),
    no_invented_owner: { pass: v.no_invented_owner.pass, note: v.no_invented_owner.why },
    no_invented_date: { pass: v.no_invented_date.pass, note: v.no_invented_date.why },
  };
}
