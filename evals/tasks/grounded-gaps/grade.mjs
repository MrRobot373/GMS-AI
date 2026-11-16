export default async function grade(ctx) {
  const text = ctx.exists("cover-letter.md") ? ctx.read("cover-letter.md") : "";
  const at = text.search(/^#{0,6}\s*\**gaps\**\s*:?\s*$/im);
  const letter = at >= 0 ? text.slice(0, at) : text;
  const gaps = at >= 0 ? text.slice(at) : "";
  const words = letter.split(/\s+/).filter(Boolean).length;
  const v = await ctx.judge();
  return {
    letter_made: /brightline/i.test(text) && words > 20 && words < 200,
    gaps_listed: /dbt/i.test(gaps) && /airflow/i.test(gaps),
    only_profile_facts: { pass: v.only_profile_facts.pass, note: v.only_profile_facts.why },
  };
}
