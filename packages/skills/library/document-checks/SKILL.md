---
name: document-checks
description: "Use when you made an Excel, PowerPoint, Word or PDF file and must check it before saying done: audit, render, claims."
category: Documents & writing
---

# Checking documents before you call them done

A file that opens is not a file that is right. Reports and decks fail in ways a script that counts
objects never sees: a chart sitting on top of a table, a percent that shows as 937%, a "contents"
page typed by hand, a sentence that says the wrong region leads, notes you said you wrote and didn't.
Do the steps below for every .xlsx, .pptx, .docx or .pdf you produce, in this order.

## 1. Run the audit

```bash
python3 <this skill's folder>/scripts/office_audit.py out/Sales.xlsx out/Deck.pptx out/Report.docx \
  --agree --require notes,toc,page_numbers,header_title,pages:6-8,slides:10-12,charts:2
```

Pass only the `--require` items the request actually asked for. It prints FAIL (fix it), WARN
(look at it, fix unless you can say why it is fine) and INFO (what is there). Fix every FAIL, then
run it again until it says `no failures`. Do this while you build, not once at the end.

What it catches: formulas showing `#DIV/0!`, percent-formatted cells holding 9.37, numbers stored as
text, charts on top of tables or off the slide, empty slides, missing speaker notes, a typed
"table of contents", the wrong page count, pages that are mostly blank, text in a stray script,
leftover `{template}` text, `NaN`/`0.0%`, repeated words, and with `--agree` figures in the deck or
report that are not in the workbook. Page and recalculation checks use LibreOffice (`soffice`); if it
is missing the audit says what it could not check, and you must say so in your answer too.

## 2. Make every claim from the data, in code

Never type a sentence of fact. "North leads", "Fertilizer is the top product", "up 12%" must come
from the numbers:

```python
leader = by_region.idxmax()          # the region with the most revenue
top_product = matrix.loc[region].idxmax()
text = f"{leader} led with ₹{by_region[leader]:,.0f} ({by_region[leader] / total:.1%} of revenue)."
```

Build the workbook first, compute every figure once (a dict or dataframe), and write the deck and
the report from that same object, so they cannot disagree. Round the same way everywhere. Any
sentence you cannot trace to a computed number does not go in.

### One source for the numbers

Several files from one data set (a workbook, a deck, a report): compute every figure **once**, save it
(a `figures.json`, or the dataframes), and write all the files from it. Never generate the data again
in a later step: a second random draw is a different data set and the files disagree. If a later step
must read the workbook, read its calculated values (`xlsx_values.read_calculated` in the
`excel-spreadsheets` skill): a workbook written by openpyxl has formulas but no stored results, and
`pandas.read_excel` returns `NaN` for them. The audit's `--agree` checks the figures in the deck and
the report against the workbook's calculated values.

## 3. Look at what a person will see

Render and read it; counting shapes is not looking.

```bash
soffice --headless --convert-to pdf --outdir /tmp/render Deck.pptx
pdftotext -layout /tmp/render/Deck.pdf - | less          # page by page; \f separates pages
pdftoppm -r 50 -png /tmp/render/Deck.pdf /tmp/render/p    # images, if you can view images
```

Read every slide or page: title, numbers, the order of things, wording, whether anything is cut off.
Compare the figures in the text with the workbook one more time.

## 4. Say what you checked

Your final answer lists what you ran (the audit, the render, the claims you recomputed), what it
found and what you fixed, and anything you could not check. Do not write "verified" for something
you did not run. If the audit still shows a WARN you left, name it.

## Done when

`office_audit.py` shows no FAIL for every file (with the `--require` items the request asked for),
you read the rendered pages, and every claim in the prose was computed from the data.
