---
name: word-documents
description: "Use when creating or editing Word documents (.docx): letters, reports, proposals, policies, or reading .docx files. Has a Markdown converter."
category: Documents & writing
---

# Word documents (.docx)

## Router

This skill stays the router for its family. Use the `skill-router` skill when a narrower catalog name might apply. Do the work here unless that narrower skill is installed. A name that exists only in the catalog is not a skill.

python-docx is installed. The fastest reliable path: write the content in Markdown, then convert.

## Create

1. Write the document as Markdown (`draft.md`): headings, paragraphs, lists, tables. Get the
   content right first (structure and wording); see `business-writing` / `report-writing`.
2. Convert with this skill's script:
   ```bash
   python3 scripts/md_to_docx.py draft.md "Proposal - Acme.docx" --title "Proposal for Acme" --font Calibri --size 11
   ```
   It handles headings 1–3, bold/italic/code, bullet and numbered lists (one nested level; each
   numbered list restarts at 1), tables with a shaded header row and right-aligned numbers, quotes,
   code blocks and `---` page breaks. It also does what reports need, so do not fake them:
   - `[TOC]` on a line: a **real table of contents** (a Word field, entries and page numbers filled in).
     Never type a contents list with dots and numbers yourself: its page numbers are wrong.
   - `![Figure 1: Revenue by region](chart.png)`: a centred picture with its caption.
   - `--cover`: the first `# Title` and the paragraphs under it become a cover page.
   - the title in the header and "Page X of Y" in the footer, on by default.
   - Use `---` (a page break) only where a new page is wanted, not before every section: that leaves
     pages mostly empty and doubles the page count. Say how long the document should be and keep to it.
3. For extra polish, open the result with python-docx and adjust (below).

## python-docx essentials

```python
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document("Proposal - Acme.docx")
sec = doc.sections[0]
sec.left_margin = sec.right_margin = Cm(2.2)
header = sec.header.paragraphs[0]; header.text = "Acme Services · Confidential"
footer = sec.footer.paragraphs[0]; footer.text = "Proposal v1.0"; footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
p = doc.add_paragraph(); run = p.add_run("Total: $14,160"); run.bold = True; run.font.size = Pt(12)
doc.add_picture("chart.png", width=Cm(15))
doc.save("Proposal - Acme.docx")
```

Use built-in styles (`Heading 1`, `List Bullet`, `Table Grid`) instead of manual formatting so the
document stays consistent and the navigation pane works.

## Edit an existing document

- Read it: `"\n".join(p.text for p in Document(path).paragraphs)`; tables via `doc.tables`.
- Replace text inside runs carefully: text can be split across runs; replace at paragraph level when
  formatting allows, or edit the specific run.
- Save under a new name (`… - edited.docx`) unless asked to overwrite; list what changed.

## Document conventions

- Title, date, author/company; a short summary up front for anything over two pages.
- Headings that a skimmer can follow; numbered sections for contracts and policies.
- Tables for comparisons, prices, schedules; right-align numbers.
- Consistent dates (e.g. 7 October 2026) and currency formatting.
- Page numbers in the footer for long documents (add a PAGE field via python-docx XML if needed).

## Write the facts from the data

Every figure and every claim in the prose ("West led", "Fertilizer is the top product", "up 12%") must
be computed from the data in code and written into the text with an f-string, never typed from
memory. Build the Markdown from the same numbers the workbook and deck use. Write in one language
and one script, and never leave `{placeholders}` or `TODO` in the text.

## Verify

Use the `document-checks` skill; it is not optional for a report.

- Run its `office_audit.py` on the .docx (with `--require toc,page_numbers,header_title,pages:A-B`
  for whatever the request asked) and fix every FAIL; read each WARN.
- Render it (`soffice --headless --convert-to pdf`, then `pdftotext -layout`) and read every page.
- Proofread the Markdown source once more for typos, names and numbers.

## Done when

The audit shows no FAIL, you read the rendered pages, the page count matches the request, every
number and claim was computed from the data, and your answer lists what you checked.
