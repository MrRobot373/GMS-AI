---
name: presentations
description: "Use when making a slide deck (.pptx): pitch, update, sales or training presentations; storyline and a script that builds the deck."
category: Documents & writing
---

# Presentations (.pptx)

## Router

This skill stays the router for its family. Use the `skill-router` skill when a narrower catalog name might apply. Do the work here unless that narrower skill is installed. A name that exists only in the catalog is not a skill.

A good deck is a story: each slide makes one point, and the titles alone tell the story.

## 1. Storyline first

Write the outline before any slide:
1. Audience and the decision or action you want from them.
2. The key message in one sentence.
3. 3–5 supporting points, each with its evidence (numbers, examples, charts).
4. The ask / next steps.

Common shapes:
- **Update**: Summary → Progress vs plan → Results → Risks/issues → Next steps → Asks.
- **Pitch**: Problem → Why now → Solution → How it works → Traction → Business model → Team → Ask.
- **Proposal**: Situation → Complication → Recommendation → Options compared → Plan & cost → Decision.
- **Training**: Goal → Concepts (one per slide) → Example → Practice → Recap.

## 2. Write the slides

- **Action titles**: a full sentence with the takeaway ("Churn fell to 2.1% after onboarding
  changes"), not a label ("Churn").
- One idea per slide; 3–5 bullets of ≤ 12 words; no paragraphs (put detail in speaker notes).
- Numbers over adjectives; show the comparison (vs last quarter, vs target).
- Charts made with `charts-visualization`, one message per chart.
- 10–15 slides for a 20-minute talk; appendix for backup detail.

## 3. Build the deck (script)

Write the outline as Markdown and build it with this skill's script:

```markdown
# Q3 Business Review
Acme Services · October 2026

## Revenue grew 18% to $412k, ahead of plan
- New customers: 46 (target 40)
- Expansion revenue +31% from upsells
  - Driven by the Pro plan launch
![](revenue_trend.png)
> Mention the one large deal that slipped to Q4.

## Where the revenue came from
- West led at ₹4.53M (23.3%)
```chart bar "Revenue by region (INR)"
West, 4527582
Central, 3988472
```
> West is the biggest region; East trails.

## Section: Next quarter

## Three priorities for Q4
| Priority | Owner | Due |
|---|---|---|
| Launch EU pricing | Maya | Nov 15 |
```

```bash
python3 scripts/outline_to_pptx.py outline.md "Q3 Review.pptx" --accent 0072B2 --font Calibri
```

Supports: title slide, bullet slides (2 levels), a table, a **native chart** (` ```chart bar|barh|line|pie "Title" `
then `label, value[, value]` rows) or an image beside the bullets, section dividers (`## Section: …`),
speaker notes (`> …`, also on the title slide), real title placeholders, slide numbers, 16:9.
Draw charts with the chart block, not by adding shapes yourself afterwards: the script lays out
bullets, table and chart so they cannot overlap, and a chart you place by hand on top of a table is
the usual way a deck goes wrong. It prints a WARNING for each slide with no notes, more than 6
bullets, or too little room; fix them and run it again.
Write the notes for **every** slide, the title and section slides too, when the request asks for notes.

## 4. Refine with python-pptx (optional)

```python
from pptx import Presentation
prs = Presentation("Q3 Review.pptx")
for i, s in enumerate(prs.slides, 1):
    print(i, [sh.text_frame.text[:60] for sh in s.shapes if sh.has_text_frame])
```

Edit text runs, swap images, or add shapes there. When the person provides a branded template
(.pptx/.potx), open it with `Presentation("template.pptx")` and add slides using its layouts instead.

## Checks

Use the `document-checks` skill; it is not optional for a deck.

- Run its `office_audit.py` on the .pptx (with `--require notes` if notes were asked for, and
  `--agree` against the workbook the figures come from) and fix every FAIL.
- Render the deck to PDF and read each slide (`soffice --headless --convert-to pdf`, `pdftotext -layout`).
- Read only the titles in order: do they tell the whole story?
- Every figure comes from the data in code (never typed from memory); units and periods on every chart.
- A claim like "X leads" or "Y is the top product" is computed (`idxmax`), never written by hand.

## Done when

The audit shows no FAIL, you read the rendered slides, titles carry the story, each slide has one
point with evidence, notes hold the detail, and your answer lists what you checked.
