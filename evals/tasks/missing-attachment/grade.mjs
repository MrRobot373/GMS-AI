export default async function grade(ctx) {
  const v = await ctx.judge();
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, { pass: x.pass, note: x.why }]));
}
