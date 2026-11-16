---
name: ui-polish
description: "Use when a web page or app screen looks generic or AI-made (purple gradients, glows, emoji icons) and needs a design pass: audit, direction, fixes."
category: Software development
---

# UI polish: from generic to designed

Built with the method of **unslop** by Damir Sokolovsky (CC BY 4.0, see `NOTICE.md`: keep this credit in any copy).

AI-made interfaces fail in the same ways. Every surface glows, every label has an emoji, spacing is whatever the model typed that
day, and the copy shouts. This skill fixes the craft and keeps the product: features, content and section order stay.
It also works as the design pass for a page you are building from scratch: apply the passes before you call it done.

The difference between slop and craft is where the richness goes. Slop spreads color and effects over the chrome (backgrounds,
buttons, borders, labels). Craft keeps the chrome quiet and puts the richness into one or two moments that belong to the product.

## What good looks like

- **One bright element** per screen: a rich chart, a real-looking object, a well-set figure. Everything around it is quiet.
- **Quiet chrome.** Navigation, buttons and text use tinted neutrals and one accent. Nothing glows.
- **A clear idea.** You can say in one sentence why the screen could only belong to this product.
- **Real product, real material.** Plausible data and names, never `[X]` or `123,456`.

## Run it

1. **Look at the screen.** Open it in the browser (`browser_open` with its path in your folder) and take a screenshot; judge what
   people see, not only the code. If you can't run it, say so in the report.
2. **Audit.** Go through `references/signs.md` and list every sign you find, one line each with where it lives. Right-to-left
   screens (Arabic, Persian, Urdu, Hebrew) also need `references/rtl.md`.
3. **Decide how much to change.** Heavy slop: the full process. Light slop: polish only what the audit found and keep the existing
   brand. No slop: say so, suggest two or three small refinements with exact values and stop. Never change a good screen to make it different.
4. **Write the direction** (five short lines), derived from what the page says the product does, never from trends:
   - **Product:** what it does and for whom, one plain sentence.
   - **Character:** two or three concrete words (`calm, exact, a little warm`). Not clean, modern, sleek, minimal or premium: they fit every template.
   - **World:** the place or material it belongs to (a note app: paper and ink; monitoring: instruments and night shifts).
   - **Moments:** one or two places where the screen gets rich color and detail.
   - **Signature:** one small detail only this product would have, used consistently.
   When the person can answer and the change is large (an existing screen), show the audit and direction and wait before editing.
   When you are building from scratch or can't ask, write the direction in your notes and go on.
5. **Fix in nine passes, in this order**, finishing each across the whole screen before the next. Exact values are in `references/tokens.md`.
6. **Check.** Render again, compare with the audit list, run the checklist below, and fix what is left. Look at the screen at most three times per run.
7. **Report:** the direction, a few lines per pass on what changed, and any claim you removed because it can't be checked.

## The nine passes

1. **Spacing.** Everything on a 4px grid. Same thing, same size (equal rows, equal card padding). Space shows grouping: smaller inside a group than between groups. Things line up (icons in one column, numbers right-aligned). Navigation rows 32 to 36 tall. Remove one-off values like `mt-[13px]`.
2. **Color.** One neutral ramp tinted toward the world; three text roles (primary, secondary, muted); one accent, used rarely, with 4.5:1 contrast under text. In apps the surfaces stay neutral, the content carries the color. No hue gradients on surfaces, no gradient text, no colored glows or shadows, no blobs, no neon borders. Borders are hairlines (text color at 6 to 10%). Dark themes get depth from surface steps, not shadows.
3. **Icons.** Every emoji used as an icon or label decoration becomes a line icon from one set (the project's, else lucide), one size and stroke (16 or 18px, 1.5), in the text role color, in a fixed-width icon box. Drop icons that add nothing.
4. **Copy.** Headlines say what the product does for whom. No exclamation marks, no greeting headlines (`Welcome back! 👋`), short labels, no trailing periods on short strings, no hype words (supercharge, seamless, unlock, magic), no `AI-powered` on everything. A change says what it compares to (`+12% vs last month`). Claims that can't be checked (`Loved by 10,000+ teams`) are removed or confirmed with the person and listed in the report. Never invent facts.
5. **Type.** One family for the interface (keep a real brand font), a few sizes, weights 400 and 500 (600 at most), hierarchy from size and color. Sentence case: no uppercase tracked labels. No negative tracking on small text. `tabular-nums` and one number format per screen. No italic for emphasis.
6. **Layout.** Keep the sections and their order. Apps keep real app proportions (sidebar 240 to 280, fluid content), never a narrow centered column. Long headlines align left. One primary action and at most one secondary. Quiet navigation. On small screens everything stacks in reading order and dense previews get simpler.
7. **Details.** Nested radius (inner = outer minus padding, never below 4; controls 8 to 10, cards 12 to 16). Counts and meta as quiet text, not glowing pills. One main chart that is clearly the biggest; one accent per chart; the chart type fits the data. Stat cards are numbers (label, figure, comparison), no sparklines or icons to fill them. Vary card sizes so the grid has a rhythm. Active state is a small surface step with a hairline, not a gradient with a glow. Hover and visible focus states stay inside the palette. The logo is the product name in the main family, no gradient wordmark or sparkle tile.
8. **Visuals.** Decorative filler goes (glossy blobs, orbs, floating cubes, glowing grids, holographic brains). A landing hero shows something true: a preview of the real product built in code with plausible data. Apps rarely need generated images; their moments come from the product itself.
9. **Motion.** Remove looping motion that isn't live (`animate-pulse`, shimmer, floating, parallax), `transition-all`, bouncy springs and `hover:scale` on cards. Keep motion that explains: quick color or surface changes on hover, a tiny press scale, a menu that fades and rises a few pixels. Transition only color, background, border, opacity and transform; never width, height or margins. One easing curve; at most one short entrance on load.

## Do not

- Do not rename the product or change what it is. Keep a real logo; redraw one that is itself slop (an emoji, a sparkle in a gradient tile) as a flat wordmark.
- Do not replace removed decoration with new decoration, or swap one trend for another (glass, grain, neon, bento grids).
- Do not invent features, claims or data.
- Do not give every product the same look: the direction decides tint, type and signature, not habit.

## Checklist

- [ ] The direction is written and every pass follows it
- [ ] Spacing on the 4px scale; equal things have equal sizes; icons, labels and numbers each in one aligned column
- [ ] One tinted neutral ramp, three text roles, one accent with enough contrast
- [ ] No hue gradients, gradient text, glows, colored shadows or blobs; no emoji left in the interface
- [ ] One icon set at one size and stroke
- [ ] Weights 400 to 600, sentence case, no italics for emphasis, tabular numbers in one format
- [ ] No exclamation marks, greeting headlines or unverified claims
- [ ] Nested radii add up; hover and focus states exist; no looping or bouncy motion
- [ ] Template check: swap in another product's name; if the screen still fits, push the direction harder in copy, visual and signature

## Done when

- The screen was opened in the browser before and after, and the audit list from step 2 has no sign left (or the report says which remain and why).
- The direction and a short list of what changed per pass are in your answer; nothing was invented or renamed.
- The functionality is unchanged: the same actions still work.
