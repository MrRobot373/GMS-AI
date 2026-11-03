#!/usr/bin/env python3
"""Build a clean 16:9 PowerPoint deck from a Markdown outline with python-pptx.

Outline format:
    # Deck title            first H1 = title slide (next non-empty line = subtitle, then > notes)
    ## Slide title          each H2 starts a slide (a real title placeholder: the outline view works)
    - bullet                bullets (indent 2 spaces for a sub-bullet)
    ![](chart.png)          an image on the slide
    | a | b |               a table
    ```chart bar "Revenue by region (INR)"
    North, 3593890          a NATIVE chart: kind bar | barh | line | pie, then "label, value[, value...]"
    South, 3818070          rows (an optional first row of column names: "Region, Revenue, Margin")
    ```
    > note text             speaker notes (write them for every slide)
    ## Section: Results     a slide titled "Section: …" becomes a section divider

A slide's bullets go on the left and its visuals (a table, a chart, an image) on the right; with two
visuals they are stacked top and bottom. The layout is arithmetic, so nothing overlaps. The script
warns about slides with no notes, too many bullets, or a visual that has too little room.

Usage: python3 outline_to_pptx.py outline.md deck.pptx [--accent 0072B2] [--font "Calibri"]
"""
import argparse
import os
import re

from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

W, H = Inches(13.333), Inches(7.5)
DARK = RGBColor(0x11, 0x18, 0x27)
MUTED = RGBColor(0x6B, 0x72, 0x80)
PALETTE = ["0072B2", "E69F00", "009E73", "CC79A7", "56B4E9", "D55E00", "F0E442", "999999"]  # colour-blind safe
CHART_KINDS = {"bar": XL_CHART_TYPE.COLUMN_CLUSTERED, "barh": XL_CHART_TYPE.BAR_CLUSTERED, "line": XL_CHART_TYPE.LINE_MARKERS, "pie": XL_CHART_TYPE.PIE}
MAX_BULLETS = 6


def parse(md):
    deck = {"title": "", "subtitle": "", "notes": [], "slides": []}
    cur = None
    chart = None
    for raw in md.splitlines():
        line = raw.rstrip()
        s = line.strip()
        if chart is not None:  # inside a ```chart block
            if s.startswith("```"):
                cur["charts"].append(chart)
                chart = None
            elif s:
                chart["rows"].append([c.strip() for c in s.split(",")])
            continue
        if m := re.match(r"^```chart\s+(\w+)(?:\s+\"([^\"]*)\")?", s):
            if cur is not None:
                chart = {"kind": m.group(1).lower(), "title": m.group(2) or "", "rows": []}
            continue
        if not s:
            continue
        if s.startswith(">") and cur is None and deck["title"]:
            deck["notes"].append(s.lstrip("> "))  # notes of the title slide
            continue
        if s.startswith("# ") and not deck["title"]:
            deck["title"] = s[2:].strip()
            continue
        if deck["title"] and not deck["slides"] and cur is None and not s.startswith(("#", "-", "*", "|", ">", "!")) and not deck["subtitle"]:
            deck["subtitle"] = s
            continue
        if s.startswith("## "):
            cur = {"title": s[3:].strip(), "bullets": [], "image": None, "table": [], "charts": [], "notes": []}
            deck["slides"].append(cur)
            continue
        if cur is None:
            continue
        if m := re.match(r"^(\s*)[-*+]\s+(.*)", line):
            cur["bullets"].append((1 if len(m.group(1)) >= 2 else 0, m.group(2)))
        elif m := re.match(r"!\[[^\]]*\]\(([^)]+)\)", s):
            cur["image"] = m.group(1)
        elif s.startswith("|"):
            if not re.fullmatch(r"\|?[\s:|-]+\|?", s):
                cur["table"].append([c.strip() for c in s.strip("|").split("|")])
        elif s.startswith(">"):
            cur["notes"].append(s.lstrip("> "))
        else:
            cur["bullets"].append((0, s))
    return deck


def clean(t):
    return re.sub(r"\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`", lambda m: next(g for g in m.groups() if g), t)


def number(text):
    try:
        return float(re.sub(r"[^\d.\-]", "", text))
    except ValueError:
        return None


def style_runs(tf, size, bold=False, color=DARK, font="Calibri"):
    for p in tf.paragraphs:
        for r in p.runs:
            r.font.size, r.font.bold, r.font.color.rgb, r.font.name = Pt(size), bold, color, font


def place(shape, x, y, w, h):
    shape.left, shape.top, shape.width, shape.height = Emu(int(x)), Emu(int(y)), Emu(int(w)), Emu(int(h))


def set_title(slide, text, x, y, w, h, size, color=DARK, font="Calibri", align=PP_ALIGN.LEFT):
    t = slide.shapes.title
    place(t, x, y, w, h)
    tf = t.text_frame
    tf.word_wrap = True
    tf.text = text
    for p in tf.paragraphs:
        p.alignment = align
    style_runs(tf, size, True, color, font)
    return t


def add_chart(slide, spec, x, y, w, h, font, warn):
    rows = [r for r in spec["rows"] if r]
    if not rows:
        warn("a chart block has no rows")
        return
    header = None
    if len(rows) > 1 and len(rows[0]) > 1 and all(number(c) is None for c in rows[0][1:]):
        header, rows = rows[0], rows[1:]
    ncols = max(len(r) for r in rows)
    data = CategoryChartData()
    data.categories = [r[0] for r in rows]
    for j in range(1, ncols):
        name = header[j] if header and j < len(header) else (spec["title"] or "Series") if ncols == 2 else f"Series {j}"
        data.add_series(name, [number(r[j]) if j < len(r) and number(r[j]) is not None else 0 for r in rows])
    kind = CHART_KINDS.get(spec["kind"])
    if kind is None:
        warn(f"unknown chart kind '{spec['kind']}' (use bar, barh, line or pie): drawn as bar")
        kind = CHART_KINDS["bar"]
    gf = slide.shapes.add_chart(kind, Emu(int(x)), Emu(int(y)), Emu(int(w)), Emu(int(h)), data)
    ch = gf.chart
    ch.font.size, ch.font.name = Pt(12), font
    ch.has_title = bool(spec["title"])
    if spec["title"]:
        ch.chart_title.text_frame.text = spec["title"]
        style_runs(ch.chart_title.text_frame, 14, True, DARK, font)
    multi = ncols > 2 or spec["kind"] == "pie"
    ch.has_legend = multi
    if multi:
        ch.legend.position = XL_LEGEND_POSITION.BOTTOM
        ch.legend.include_in_layout = False
    if spec["kind"] != "pie":
        try:
            ch.value_axis.tick_labels.number_format = "#,##0"
            ch.value_axis.tick_labels.number_format_is_linked = False
            ch.value_axis.has_major_gridlines = True
            ch.value_axis.major_gridlines.format.line.color.rgb = RGBColor(0xE5, 0xE7, 0xEB)
        except Exception:
            pass
        for i, s in enumerate(ch.plots[0].series):
            if spec["kind"] == "line":
                s.format.line.color.rgb = RGBColor.from_string(PALETTE[i % len(PALETTE)])
            else:
                s.format.fill.solid()
                s.format.fill.fore_color.rgb = RGBColor.from_string(PALETTE[i % len(PALETTE)])
    else:
        for i, pt in enumerate(ch.plots[0].series[0].points):
            pt.format.fill.solid()
            pt.format.fill.fore_color.rgb = RGBColor.from_string(PALETTE[i % len(PALETTE)])
        ch.plots[0].has_data_labels = True
        dl = ch.plots[0].data_labels
        dl.show_value, dl.show_category_name, dl.show_percentage = False, False, True
        dl.number_format, dl.number_format_is_linked = "0.0%", False
        dl.font.size = Pt(12)


def add_table(slide, rows, x, y, w, row_h, acc, font):
    cols = max(len(r) for r in rows)
    shape = slide.shapes.add_table(len(rows), cols, Emu(int(x)), Emu(int(y)), Emu(int(w)), Emu(int(row_h * len(rows))))
    tbl = shape.table
    size = 14 if len(rows) <= 8 else 12 if len(rows) <= 11 else 10
    for i, row in enumerate(rows):
        tbl.rows[i].height = Emu(int(row_h))
        for j in range(cols):
            c = tbl.cell(i, j)
            c.text = clean(row[j]) if j < len(row) else ""
            c.fill.solid()
            c.fill.fore_color.rgb = acc if i == 0 else (RGBColor(0xF3, 0xF4, 0xF6) if i % 2 else RGBColor(0xFF, 0xFF, 0xFF))
            for p in c.text_frame.paragraphs:
                numeric = j > 0 and number(c.text) is not None and i > 0
                p.alignment = PP_ALIGN.RIGHT if numeric else PP_ALIGN.LEFT
                for r in p.runs:
                    r.font.size, r.font.name = Pt(size), font
                    r.font.bold = i == 0
                    r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF) if i == 0 else DARK
    return shape


def build(deck, out, accent="0072B2", font="Calibri"):
    acc = RGBColor.from_string(accent)
    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H
    title_slide, title_only = prs.slide_layouts[0], prs.slide_layouts[5]
    warnings = []

    def bar(slide):
        shp = slide.shapes.add_shape(1, 0, 0, Inches(0.18), H)
        shp.fill.solid()
        shp.fill.fore_color.rgb = acc
        shp.line.fill.background()

    def drop_unused(slide):
        for ph in list(slide.placeholders):
            if not ph.text_frame.text.strip() and ph.placeholder_format.type is not None and ph != slide.shapes.title:
                ph._element.getparent().remove(ph._element)

    s = prs.slides.add_slide(title_slide)
    bar(s)
    set_title(s, deck["title"] or "Presentation", Inches(0.9), Inches(2.4), Inches(11.5), Inches(1.5), 40, font=font)
    sub = s.placeholders[1]
    if deck["subtitle"]:
        place(sub, Inches(0.9), Inches(4.0), Inches(11.5), Inches(0.9))
        sub.text_frame.text = deck["subtitle"]
        for p in sub.text_frame.paragraphs:
            p.alignment = PP_ALIGN.LEFT
        style_runs(sub.text_frame, 20, False, MUTED, font)
    if deck["notes"]:
        s.notes_slide.notes_text_frame.text = "\n".join(deck["notes"])
    else:
        warnings.append("title slide: no speaker notes: add a line starting with '> ' under the subtitle")
    drop_unused(s)

    for n, sl in enumerate(deck["slides"], start=2):
        warn = lambda msg, n=n, sl=sl: warnings.append(f"slide {n} ({sl['title'][:40]}): {msg}")
        s = prs.slides.add_slide(title_only)
        bar(s)
        if sl["title"].lower().startswith("section:"):
            set_title(s, sl["title"].split(":", 1)[1].strip(), Inches(0.9), Inches(3.0), Inches(11.5), Inches(1.2), 36, acc, font)
        else:
            set_title(s, clean(sl["title"]), Inches(0.9), Inches(0.45), Inches(11.6), Inches(1.1), 28, font=font)
            left, top, bottom = Inches(0.9), Inches(1.7), Inches(6.85)
            visuals = ([("table", sl["table"])] if sl["table"] else []) + [("chart", c) for c in sl["charts"]] + ([("image", sl["image"])] if sl["image"] else [])
            has_bullets = bool(sl["bullets"])
            body_w = Inches(5.6) if has_bullets and visuals else Inches(11.6)
            if len(sl["bullets"]) > MAX_BULLETS:
                warn(f"{len(sl['bullets'])} bullets: keep it to {MAX_BULLETS} (move detail to the notes)")
            if has_bullets:
                tb = s.shapes.add_textbox(left, top, body_w, bottom - top)
                tf = tb.text_frame
                tf.word_wrap = True
                for i, (lvl, txt) in enumerate(sl["bullets"]):
                    p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
                    p.level = lvl
                    p.space_after = Pt(10)
                    r = p.add_run()
                    r.text = ("•  " if lvl == 0 else "–  ") + clean(txt)
                    r.font.size = Pt(22 if lvl == 0 else 18)
                    r.font.color.rgb = DARK if lvl == 0 else MUTED
                    r.font.name = font
            if visuals:
                x = left + body_w + Inches(0.4) if has_bullets else left
                w = Inches(12.6) - x
                # Divide the height among the visuals: a table needs its rows, the rest share what's left.
                gap = Inches(0.25)
                avail = bottom - top - gap * (len(visuals) - 1)
                heights = []
                for kind, v in visuals:
                    heights.append(min(Inches(0.42) * len(v), Inches(4.6)) if kind == "table" else None)
                free = avail - sum(h for h in heights if h)
                nfree = sum(1 for h in heights if h is None)
                for i, h in enumerate(heights):
                    if h is None:
                        heights[i] = free / nfree if nfree else 0
                if any(h < Inches(1.8) for (k, _), h in zip(visuals, heights) if k != "table"):
                    warn("not enough room for the visuals: give the slide one visual or fewer table rows")
                y = top
                for (kind, v), h in zip(visuals, heights):
                    if kind == "table":
                        add_table(s, v, x, y, w, h / len(v), acc, font)
                    elif kind == "chart":
                        add_chart(s, v, x, y, w, h, font, warn)
                    else:
                        pic = s.shapes.add_picture(v, Emu(int(x)), Emu(int(y)))
                        scale = min(w / pic.width, h / pic.height, 1.0)
                        pic.width, pic.height = Emu(int(pic.width * scale)), Emu(int(pic.height * scale))
                    y += h + gap
            elif not has_bullets:
                warn("the slide has nothing on it")
        tb = s.shapes.add_textbox(Inches(12.3), Inches(6.95), Inches(0.8), Inches(0.4))
        tb.text_frame.text = str(n)
        tb.text_frame.paragraphs[0].alignment = PP_ALIGN.RIGHT
        style_runs(tb.text_frame, 11, False, MUTED, font)
        if sl["notes"]:
            s.notes_slide.notes_text_frame.text = "\n".join(sl["notes"])
        else:
            warn("no speaker notes: add a line starting with '> '")
        drop_unused(s)
    prs.save(out)
    return out, warnings


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("outline")
    ap.add_argument("output")
    ap.add_argument("--accent", default="0072B2")
    ap.add_argument("--font", default="Calibri")
    a = ap.parse_args()
    deck = parse(open(a.outline, encoding="utf-8").read())
    base = os.path.dirname(os.path.abspath(a.outline))
    for sl in deck["slides"]:
        if sl["image"] and not os.path.isabs(sl["image"]):
            sl["image"] = os.path.join(base, sl["image"])
    _, warnings = build(deck, a.output, a.accent, a.font)
    print(f"Wrote {a.output}")
    for w in warnings:
        print(f"WARNING {w}")
    if warnings:
        print("Fix the warnings (they are things a person would notice) and run the script again.")
