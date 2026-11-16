export default async function grade(ctx) {
  if (!ctx.info?.webSearch) ctx.skip("this server has no web search set up");
  return {
    read_a_page: ctx.toolCalls(/web_fetch/).length > 0,
    gives_version: /\b3\.\d{1,2}(\.\d+)?\b/.test(ctx.answer),
    cites_python_org: /https?:\/\/[^\s)]*python\.org/i.test(ctx.answer),
  };
}
