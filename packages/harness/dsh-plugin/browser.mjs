/**
 * The browser_* tools: a real browser run by Aatmiq (one per task), for pages that need
 * JavaScript, clicks or forms. Every call goes to Aatmiq's internal API with the task's token;
 * the browser itself, its network rules and its files are Aatmiq's (apps/api/src/services/browser.ts).
 * Plain JavaScript on purpose: loaded directly by the harness runtime.
 */

/** The page view as the agent reads it. */
export function formatView(v) {
  const lines = [];
  if (v.title) lines.push(`Page: ${v.title}`);
  if (v.url) lines.push(`URL: ${v.url}`);
  if (v.downloads?.length) lines.push(`Downloaded: ${v.downloads.join(", ")}`);
  if (v.errors?.length) lines.push("Script errors on the page:", ...v.errors.map((e) => `- ${e}`));
  if (v.result !== undefined) lines.push("Result:", v.result);
  if (v.canvasText?.length) lines.push("Text drawn on the canvas (with where it is, for browser_click_at):", ...v.canvasText.map((t) => `- ${t}`));
  lines.push("", v.text || "(the page has no readable text)");
  if (v.truncated) {
    const next = (v.offset ?? 0) + (v.text?.length ?? 0);
    lines.push("", `(more below: call browser_read with offset ${next})`);
  }
  return lines.join("\n");
}

const element = { type: "integer", required: true, description: "The element's number from the latest page view, e.g. 3 for [3]." };
const confirm = {
  type: "boolean",
  description: "Set to true only after the browser said this submits a form and submitting is what the task needs. The person may be asked to approve.",
};

/**
 * @param {Function} defineTool DSH's defineTool
 * @param {(body: object, signal?: AbortSignal) => Promise<any>} browser posts an action to Aatmiq
 */
export function browserTools(defineTool, browser) {
  const text = {
    schema: { type: "object", additionalProperties: false, properties: { text: { type: "string", required: true } } },
    render: (_args, value) => [{ type: "text", text: value.text }],
  };
  const view = async (body, signal) => ({ text: formatView(await browser(body, signal)) });
  const tool = (name, description, parameters, run) =>
    defineTool({ name, description, parameters, output: text, timeoutMs: 90_000, execute: (args, exec) => run(args ?? {}, exec.signal) });

  return [
    tool(
      "browser_open",
      "Open a web page in a real browser that runs JavaScript and keeps this task's cookies. Returns the page as text with numbered elements, like [3] button \"Sign in\" or [5] textbox \"Email\", to use with browser_click and browser_type, plus any script errors. For simply reading a page, web_fetch is faster. To try a page or app you built, give its path in your working folder (like game/index.html): it opens from the folder.",
      { url: { type: "string", required: true, description: "The page's address (https://…), or the path of an HTML file in your working folder." } },
      (a, signal) => view({ action: "open", url: String(a.url ?? "") }, signal),
    ),
    tool(
      "browser_click",
      "Click an element on the current page (a link, button, checkbox, tab…). Returns the page after the click. A click that would submit a form is held: repeat it with confirm_submit: true when submitting is really needed.",
      { element, confirm_submit: confirm },
      (a, signal) => view({ action: "click", ref: Number(a.element), confirmSubmit: a.confirm_submit === true }, signal),
    ),
    tool(
      "browser_type",
      "Type into a text field on the current page (replacing what's there). submit: true presses Enter afterwards; if that submits a form it's held until you repeat with confirm_submit: true.",
      {
        element,
        text: { type: "string", required: true, description: "What to type." },
        submit: { type: "boolean", description: "Press Enter after typing." },
        confirm_submit: confirm,
      },
      (a, signal) => view({ action: "type", ref: Number(a.element), text: String(a.text ?? ""), submit: a.submit === true, confirmSubmit: a.confirm_submit === true }, signal),
    ),
    tool(
      "browser_select",
      "Choose an option in a drop-down list on the current page.",
      { element, option: { type: "string", required: true, description: "The option's text as shown in the page view." } },
      (a, signal) => view({ action: "select", ref: Number(a.element), option: String(a.option ?? "") }, signal),
    ),
    tool("browser_back", "Go back to the previous page.", {}, (_a, signal) => view({ action: "back" }, signal)),
    tool(
      "browser_press",
      "Press a key on a page from your working folder (to try a game or app you built), optionally holding it down. Returns the page view and any script errors; take a screenshot to see the result.",
      {
        key: { type: "string", required: true, description: "One key: ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Enter, Space, Escape, KeyW, Digit1…, optionally with Shift+ or Control+." },
        hold_ms: { type: "integer", description: "Hold the key this long in milliseconds (0–5000), as a player holds the gas. Default: a single press." },
      },
      (a, signal) => view({ action: "press", key: String(a.key ?? ""), holdMs: Math.max(0, Math.min(5000, Number(a.hold_ms ?? 0) || 0)) }, signal),
    ),
    tool(
      "browser_click_at",
      "Click at a point on a page from your working folder, in pixels from the top left of the 1280×900 view (for a canvas game or drawing that has no numbered elements). The page view lists the text drawn on the canvas with where it is; or take a screenshot to find the point.",
      { x: { type: "number", required: true, description: "Pixels from the left." }, y: { type: "number", required: true, description: "Pixels from the top." } },
      (a, signal) => view({ action: "click_at", x: Number(a.x), y: Number(a.y) }, signal),
    ),
    tool(
      "browser_eval",
      "Evaluate a JavaScript expression in a page from your working folder and get its value as JSON: the state of a game or app you built (the current scene, the score, a vehicle's speed), or whether something is defined. Use it when the page is drawn on a canvas and you can't see screenshots.",
      { expression: { type: "string", required: true, description: "One expression, like RR.Game.currentScene.name or JSON.stringify(RR.Scenes.Level.vehicle.position). It may await a promise." } },
      (a, signal) => view({ action: "eval", expression: String(a.expression ?? "") }, signal),
    ),
    tool(
      "browser_read",
      "Read more of the current page's text, from an offset (use the offset the page view suggests).",
      { offset: { type: "integer", description: "Where to continue, in characters (default 0)." } },
      (a, signal) => view({ action: "read", offset: Math.max(0, Number(a.offset ?? 0) || 0) }, signal),
    ),
    tool(
      "browser_screenshot",
      "Save a screenshot of the current page as a PNG in the working folder (under screenshots/). Use read_image on it to look at it, if you can see images.",
      { full_page: { type: "boolean", description: "The whole page instead of the visible part." } },
      async (a, signal) => {
        const r = await browser({ action: "screenshot", fullPage: a.full_page === true }, signal);
        return { text: `Saved ${r.file} (${r.title || r.url}).` };
      },
    ),
  ];
}
