/** The text of the number: the page's text without the button labels. */
const shown = (page) => page.evaluate(() => [...document.body.querySelectorAll("*")].filter((e) => !e.children.length && !["BUTTON", "SCRIPT", "STYLE", "TITLE"].includes(e.tagName)).map((e) => e.textContent.trim()).join(" "));
const press = (page, re) => page.getByRole("button", { name: re }).first().click();

export default async function grade(ctx) {
  const out = { opens_clean: false, plus_works: false, persists_after_reload: false, minus_and_reset_work: false, tried_in_browser: ctx.toolCalls(/^browser_/).length > 0 };
  if (!ctx.exists("counter/index.html")) return out;
  await ctx.page("counter/index.html", async ({ page, errors }) => {
    out.opens_clean = errors.length === 0;
    try {
      for (let i = 0; i < 3; i++) await press(page, /plus|\+/i);
      out.plus_works = /\b3\b/.test(await shown(page));
      await page.reload();
      await page.waitForTimeout(400);
      out.persists_after_reload = /\b3\b/.test(await shown(page));
      await press(page, /minus|−|-/i);
      const two = /\b2\b/.test(await shown(page));
      await press(page, /reset/i);
      out.minus_and_reset_work = two && /\b0\b/.test(await shown(page)) && !/\b[1-9]\b/.test(await shown(page));
    } catch {
      /* a missing button leaves the rest false */
    }
  });
  return out;
}
