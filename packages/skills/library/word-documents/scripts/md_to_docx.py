#!/usr/bin/env python3
"""Convert Markdown to a styled Word document (.docx) with python-docx.

Supports: # headings (1–3), paragraphs, **bold**, *italic*, `code`, bullet and numbered lists
(one level of nesting with 2+ spaces; every numbered list starts again at 1), tables (| a | b |,
numbers right-aligned), > quotes, --- page breaks, ```code blocks```, and:

    [TOC]                       a REAL table of contents (a Word field, with its entries and page
                                numbers filled in; Word can refresh it: right-click, Update field)
    ![Figure: caption](x.png)   a centred picture with its caption underneath

Header and footer are on by default: the title in the header, "Page X of Y" in the footer (turn off
with --no-header / --no-footer). --cover puts the first # title and the paragraphs under it on a
cover page of their own.

Use --- only where a new page is really wanted (not before every section: that leaves pages empty).

Usage: python3 md_to_docx.py input.md output.docx [--title "Document title"] [--font Calibri] [--size 11]
                             [--cover] [--no-header] [--no-footer]
"""
import argparse
import os
import re
import shutil
import subprocess
import tempfile

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

INLINE = re.compile(r"(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))")
GREY = RGBColor(0x6B, 0x72, 0x80)
TOC_MARK = re.compile(r"^\[\[?TOC\]\]?$", re.I)
NUMERIC = re.compile(r"^[\s₹$€£(+-]*[\d,]+(\.\d+)?\s*(%|[A-Za-z]{0,3})?\)?$")


def add_inline(par, text):
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            par.add_run(part[2:-2]).bold = True
        elif part.startswith("`") and part.endswith("`"):
            r = par.add_run(part[1:-1])
            r.font.name = "Consolas"
        elif part.startswith("*") and part.endswith("*"):
            par.add_run(part[1:-1]).italic = True
        elif m := re.fullmatch(r"\[([^\]]+)\]\(([^)]+)\)", part):
            r = par.add_run(f"{m.group(1)} ({m.group(2)})")
            r.font.color.rgb = RGBColor(0x1F, 0x4E, 0x99)
        else:
            par.add_run(part)


def shade(cell, hex_fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tc_pr.append(shd)


def add_table(doc, rows):
    cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows if not re.fullmatch(r"\|?[\s:|-]+\|?", r.strip())]
    if not cells:
        return
    width = max(len(r) for r in cells)
    t = doc.add_table(rows=len(cells), cols=width)
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, row in enumerate(cells):
        for j in range(width):
            cell = t.cell(i, j)
            cell.text = ""
            text = row[j] if j < len(row) else ""
            add_inline(cell.paragraphs[0], text)
            if i == 0:
                for run in cell.paragraphs[0].runs:
                    run.bold = True
                shade(cell, "E7EBF0")
            elif j > 0 and NUMERIC.match(text):
                cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
    # The header row repeats if the table runs onto another page.
    trpr = t.rows[0]._tr.get_or_add_trPr()
    h = OxmlElement("w:tblHeader")
    h.set(qn("w:val"), "true")
    trpr.append(h)
    doc.add_paragraph()


def add_field(par, instr, placeholder="1", size=None, color=None, dirty=False):
    """A Word field (PAGE, NUMPAGES...) inside a paragraph."""
    def run_with(el):
        r = par.add_run()
        if size:
            r.font.size = Pt(size)
        if color:
            r.font.color.rgb = color
        r._r.append(el)
        return r

    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    if dirty:
        begin.set(qn("w:dirty"), "true")
    run_with(begin)
    it = OxmlElement("w:instrText")
    it.set(qn("xml:space"), "preserve")
    it.text = f" {instr} "
    run_with(it)
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    run_with(sep)
    r = par.add_run(placeholder)
    if size:
        r.font.size = Pt(size)
    if color:
        r.font.color.rgb = color
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run_with(end)


def restart_numbering(doc, pars):
    """Give a numbered list its own numbering, starting at 1."""
    try:
        numbering = doc.part.numbering_part.numbering_definitions._numbering
        style = pars[0].style
        num_id = style.element.pPr.numPr.numId.val
        abstract = next(n for n in numbering.findall(qn("w:num")) if n.get(qn("w:numId")) == str(num_id)).find(qn("w:abstractNumId")).get(qn("w:val"))
        new_id = max(int(n.get(qn("w:numId"))) for n in numbering.findall(qn("w:num"))) + 1
        num = OxmlElement("w:num")
        num.set(qn("w:numId"), str(new_id))
        a = OxmlElement("w:abstractNumId")
        a.set(qn("w:val"), abstract)
        num.append(a)
        ov = OxmlElement("w:lvlOverride")
        ov.set(qn("w:ilvl"), "0")
        so = OxmlElement("w:startOverride")
        so.set(qn("w:val"), "1")
        ov.append(so)
        num.append(ov)
        numbering.append(num)
        for p in pars:
            ppr = p._p.get_or_add_pPr()
            numpr = OxmlElement("w:numPr")
            il = OxmlElement("w:ilvl")
            il.set(qn("w:val"), "0")
            ni = OxmlElement("w:numId")
            ni.set(qn("w:val"), str(new_id))
            numpr.append(il)
            numpr.append(ni)
            ppr.append(numpr)
    except Exception:
        pass  # the list still reads fine, it just keeps counting


def headings_of(md, skip_first_h1):
    """(level, text) of the headings to list in a table of contents."""
    out, fenced, first = [], False, True
    for line in md.splitlines():
        s = line.strip()
        if s.startswith("```"):
            fenced = not fenced
        if fenced:
            continue
        m = re.match(r"^(#{1,3})\s+(.*)", s)
        if not m:
            continue
        text = m.group(2).strip()
        if len(m.group(1)) == 1 and first:
            first = False
            if skip_first_h1:
                continue
        if re.fullmatch(r"(table of )?contents", text, re.I):
            continue
        if len(m.group(1)) <= 2:
            out.append((len(m.group(1)), text))
    return out


def add_toc(doc, entries, pages, font_size):
    """A real TOC field: its entries (and page numbers when known) are the cached result Word shows until refreshed."""
    items = entries or [(1, "")]
    for k, (level, text) in enumerate(items):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.6 * (level - 1))
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.tab_stops.add_tab_stop(Cm(16), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
        if k == 0:
            b = OxmlElement("w:fldChar")
            b.set(qn("w:fldCharType"), "begin")
            r = p.add_run()
            r._r.append(b)
            it = OxmlElement("w:instrText")
            it.set(qn("xml:space"), "preserve")
            it.text = ' TOC \\o "1-2" \\h \\z \\u '
            r = p.add_run()
            r._r.append(it)
            s = OxmlElement("w:fldChar")
            s.set(qn("w:fldCharType"), "separate")
            r = p.add_run()
            r._r.append(s)
        num = pages.get(text) if pages else None
        p.add_run(text + (f"\t{num}" if num else ""))
        if k == len(items) - 1:
            e = OxmlElement("w:fldChar")
            e.set(qn("w:fldCharType"), "end")
            r = p.add_run()
            r._r.append(e)


def convert(md: str, out: str, title=None, font="Calibri", size=11, base=".", cover=False, header=True, footer=True, pages=None):
    doc = Document()
    st = doc.styles["Normal"]
    st.font.name = font
    st.font.size = Pt(size)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), font)
    if title:
        doc.core_properties.title = title
    lines = md.splitlines()
    first_h1 = next((m.group(1).strip() for m in (re.match(r"^#\s+(.*)", l.strip()) for l in lines) if m), None)
    header_text = title or first_h1 or ""
    toc_entries = headings_of(md, cover)
    used_toc = False
    sec = doc.sections[0]
    sec.left_margin = sec.right_margin = Cm(2.2)
    if cover:
        sec.different_first_page_header_footer = True
    if header and header_text:
        hp = sec.header.paragraphs[0]
        hp.text = header_text
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        for r in hp.runs:
            r.font.size, r.font.color.rgb = Pt(9), GREY
    if footer:
        fp = sec.footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = fp.add_run("Page ")
        r.font.size, r.font.color.rgb = Pt(9), GREY
        add_field(fp, "PAGE", "1", 9, GREY)
        r = fp.add_run(" of ")
        r.font.size, r.font.color.rgb = Pt(9), GREY
        add_field(fp, "NUMPAGES", "1", 9, GREY)
    i = 0
    seen_h1 = False
    on_cover = False
    list_block = []

    def flush_list():
        nonlocal list_block
        if list_block:
            restart_numbering(doc, list_block)
        list_block = []

    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if not s:
            i += 1
            continue
        is_list = bool(re.match(r"^(\s*)(\d+[.)])\s+(.*)", line)) and not re.match(r"^(\s*)([-*+])\s", line)
        if not is_list and not re.match(r"^\s{2,}([-*+]|\d+[.)])\s", line):
            flush_list()
        if s.startswith("```"):
            code = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.append(lines[i])
                i += 1
            p = doc.add_paragraph()
            r = p.add_run("\n".join(code))
            r.font.name = "Consolas"
            r.font.size = Pt(size - 1)
            i += 1
            continue
        if on_cover and (s == "---" or s.startswith("#")):
            on_cover = False
            doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
            if s == "---":
                i += 1
                continue
        if TOC_MARK.match(s):
            add_toc(doc, toc_entries, pages, size)
            used_toc = True
        elif s == "---":
            doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
        elif m := re.match(r"^(#{1,3})\s+(.*)", s):
            text = m.group(2).strip()
            if cover and len(m.group(1)) == 1 and not seen_h1:
                seen_h1 = True
                on_cover = True
                for _ in range(6):
                    doc.add_paragraph()
                p = doc.add_paragraph(text, style="Title")
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            else:
                if len(m.group(1)) == 1:
                    seen_h1 = True
                doc.add_heading(text, level=len(m.group(1)))
        elif m := re.match(r"!\[([^\]]*)\]\(([^)]+)\)", s):
            path = m.group(2) if os.path.isabs(m.group(2)) else os.path.join(base, m.group(2))
            if os.path.exists(path):
                pp = doc.add_paragraph()
                pp.alignment = WD_ALIGN_PARAGRAPH.CENTER
                pp.paragraph_format.keep_with_next = True
                pp.add_run().add_picture(path, width=Cm(15))
                if m.group(1).strip():
                    cp = doc.add_paragraph(m.group(1).strip(), style="Caption")
                    cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                doc.add_paragraph(f"[missing picture: {m.group(2)}]")
        elif s.startswith("|"):
            block = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i])
                i += 1
            add_table(doc, block)
            continue
        elif m := re.match(r"^(\s*)([-*+]|\d+[.)])\s+(.*)", line):
            nested = len(m.group(1).replace("\t", "  ")) >= 2
            numbered = m.group(2)[0].isdigit()
            style = ("List Number" if numbered else "List Bullet") + (" 2" if nested else "")
            par = doc.add_paragraph(style=style)
            add_inline(par, m.group(3))
            if numbered and not nested:
                list_block.append(par)
        elif s.startswith(">"):
            p = doc.add_paragraph(style="Intense Quote")
            add_inline(p, s.lstrip("> "))
        else:
            para = [s]
            while i + 1 < len(lines) and lines[i + 1].strip() and not re.match(r"^(\s*([-*+]|\d+[.)])\s|#|\||>|```|---|!\[|\[\[?TOC)", lines[i + 1].strip()):
                i += 1
                para.append(lines[i].strip())
            p = doc.add_paragraph()
            add_inline(p, " ".join(para))
            if on_cover:
                for r in p.runs:
                    r.font.size, r.font.color.rgb = Pt(14), GREY
        i += 1
    flush_list()
    if used_toc and not pages:
        # Without page numbers yet, ask Word to fill the contents in when the file is opened.
        us = OxmlElement("w:updateFields")
        us.set(qn("w:val"), "true")
        doc.settings.element.append(us)
    doc.save(out)
    return out, toc_entries if used_toc else []


def page_numbers(docx_path, entries):
    """The page each heading lands on, from a LibreOffice render (None when it can't be rendered)."""
    exe = shutil.which("soffice") or shutil.which("libreoffice")
    if not exe or not shutil.which("pdftotext") or not entries:
        return None
    tmp = tempfile.mkdtemp(prefix="toc-")
    try:
        subprocess.run([exe, f"-env:UserInstallation=file://{tmp}/profile", "--headless", "--convert-to", "pdf", "--outdir", tmp, docx_path], capture_output=True, timeout=150)
        pdf = os.path.join(tmp, os.path.splitext(os.path.basename(docx_path))[0] + ".pdf")
        r = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, timeout=60)
        pages = [re.sub(r"\s+", " ", p) for p in r.stdout.decode("utf-8", "replace").split("\f")]
    except Exception:
        return None
    finally:
        pass
    norm = lambda t: re.sub(r"\s+", " ", t).strip()
    first = norm(entries[0][1])
    toc_page = next((k for k, p in enumerate(pages) if first in p), None)
    if toc_page is None:
        shutil.rmtree(tmp, ignore_errors=True)
        return None
    out, at = {}, toc_page
    for _, text in entries:
        t = norm(text)
        for k in range(at, len(pages)):
            need = 2 if k == toc_page else 1
            if pages[k].count(t) >= need:
                out[text] = k + 1
                at = k
                break
    shutil.rmtree(tmp, ignore_errors=True)
    return out or None


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--title")
    ap.add_argument("--font", default="Calibri")
    ap.add_argument("--size", type=int, default=11)
    ap.add_argument("--cover", action="store_true", help="the first # title and the paragraphs under it make a cover page")
    ap.add_argument("--no-header", action="store_true")
    ap.add_argument("--no-footer", action="store_true")
    a = ap.parse_args()
    md = open(a.input, encoding="utf-8").read()
    base = os.path.dirname(os.path.abspath(a.input))
    kw = dict(title=a.title, font=a.font, size=a.size, base=base, cover=a.cover, header=not a.no_header, footer=not a.no_footer)
    _, entries = convert(md, a.output, **kw)
    if entries:
        pages = page_numbers(a.output, entries)
        if pages:
            convert(md, a.output, pages=pages, **kw)
            print("Contents page numbers filled in from a render.")
        else:
            print("Contents entries are in; Word fills in the page numbers when you open the file (LibreOffice isn't here to do it now).")
    print(f"Wrote {a.output}")
