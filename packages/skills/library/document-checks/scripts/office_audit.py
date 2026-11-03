#!/usr/bin/env python3
"""Audit Excel, PowerPoint, Word and PDF files the way a careful reviewer would.

    python3 office_audit.py FILE [FILE ...] [--require notes,toc,pages:6-8,charts:2] [--agree] [--json]

For every file it reports what is wrong (FAIL), what looks wrong (WARN) and what is there (INFO):

  xlsx  formulas that don't calculate (#DIV/0!, #REF!...), percent-formatted cells holding values
        above 1 (9.37 shows as 937%), numbers stored as text, charts with no data, chart/formula counts
  pptx  shapes that overlap (a chart on a table), shapes off the slide, empty slides, slides with no
        title, text that won't fit its box, speaker notes, native charts, repeated words, leftovers
  docx  a "table of contents" typed by hand instead of a real field, page count and pages that are
        mostly empty (needs LibreOffice), page numbers, header, numbered lists that keep counting
        across sections, text in a stray script (a Chinese sentence in an English report), template
        leftovers like {datetime.now()}, repeated words
  pdf   pages, pages with no text, leftovers

--agree  treats the first .xlsx as the source and checks that the figures written in the other files
         (1,234,567 and 33.8%) exist in it; "0.0%" and "NaN" are failures, other unmatched figures
         are warnings (they may be derived: check them).
--require  things the request asked for, checked as FAIL when missing: notes (speaker notes on every
         slide), toc, page_numbers, header_title, pages:A-B, slides:A-B, charts:N, formulas:N.

The exit status is 1 when anything FAILs (0 with --json: read the "ok" field). Rendering and
recalculating need LibreOffice (soffice); without it those checks are skipped and say so.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

AGGREGATES = re.compile(r"\b(SUMIFS?|COUNTIFS?|AVERAGEIFS?|SUMPRODUCT|MAXIFS|MINIFS)\s*\(", re.I)
CELL_REF = re.compile(r"(?<![:\w.$])(?:(?:'([^']+)'|([A-Za-z_][\w.]*))!)?\$?([A-Z]{1,3})\$?(\d{1,7})(?![\d(:])")
ERROR_VALUES = {"#DIV/0!", "#REF!", "#NAME?", "#VALUE!", "#N/A", "#NUM!", "#NULL!", "Err:502", "Err:504", "Err:508", "Err:522"}
# Words that mean a generator printed a failed value or left a placeholder.
LEFTOVER = re.compile(
    r"\{\{.*?\}\}|\$\{[^}]*\}|\{%.*?%\}|\{[A-Za-z_][\w.]*\([^}]*\)[^}]*\}|<<[A-Z_ ]+>>|\bNaN\b|\bnan%|\bundefined\b|\bnull%|\bTODO\b|\bTBD\b|\bFIXME\b|lorem ipsum|\bINSERT [A-Z ]+ HERE\b|\[\s*(?:placeholder|insert[^\]]*)\]|\[\s*(?:date|name|company|client|month|year|amount|number|x{1,4}|\.\.\.|tbd|tba)\s*\]|(?<![\w-])--(?:cover|no-header|no-footer|title|font|size|accent|require|agree)\b",
    re.I,
)
SCRIPTS = {
    "CJK": r"[぀-ヿ㐀-䶿一-鿿豈-﫿]",
    "Hangul": r"[가-힯]",
    "Cyrillic": r"[Ѐ-ӿ]",
    "Arabic": r"[؀-ۿ]",
    "Devanagari": r"[ऀ-ॿ]",
    "Thai": r"[฀-๿]",
}
LATIN = re.compile(r"[A-Za-zÀ-ɏ]")


class Report:
    def __init__(self, path, kind):
        self.file = os.path.basename(path)
        self.path = path
        self.kind = kind
        self.findings = []
        self.facts = []
        self.text = ""  # all the text of the file, for --agree

    def fail(self, where, msg):
        self.findings.append({"level": "fail", "where": where, "message": msg})

    def warn(self, where, msg):
        self.findings.append({"level": "warn", "where": where, "message": msg})

    def info(self, msg):
        self.facts.append(msg)


def soffice():
    return shutil.which("soffice") or shutil.which("libreoffice")


def convert(path, fmt, outdir):
    """Convert with LibreOffice; returns the output path or None."""
    exe = soffice()
    if not exe:
        return None
    profile = tempfile.mkdtemp(prefix="lo-profile-")
    try:
        subprocess.run(
            [exe, f"-env:UserInstallation=file://{profile}", "--headless", "--convert-to", fmt, "--outdir", outdir, path],
            capture_output=True,
            timeout=150,
        )
    except Exception:
        return None
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    stem = os.path.splitext(os.path.basename(path))[0]
    out = os.path.join(outdir, f"{stem}.{fmt.split(':')[0]}")
    return out if os.path.exists(out) else None


def pdf_pages_text(pdf):
    """The text of each page of a PDF (list of str), or None."""
    if shutil.which("pdftotext"):
        r = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, timeout=60)
        if r.returncode == 0:
            pages = r.stdout.decode("utf-8", "replace").split("\f")
            return pages[:-1] if pages and not pages[-1].strip() else pages
    try:
        from pypdf import PdfReader

        return [(p.extract_text() or "") for p in PdfReader(pdf).pages]
    except Exception:
        return None


def page_fill(pdf, n_pages):
    """For each page, how far down the page its content reaches (0-1, footer band ignored), or None."""
    if not shutil.which("pdftoppm"):
        return None
    try:
        from PIL import Image, ImageChops
    except Exception:
        return None
    tmp = tempfile.mkdtemp(prefix="pages-")
    try:
        subprocess.run(["pdftoppm", "-r", "30", "-png", pdf, os.path.join(tmp, "p")], capture_output=True, timeout=120)
        out = []
        for name in sorted(os.listdir(tmp)):
            im = Image.open(os.path.join(tmp, name)).convert("L")
            w, h = im.size
            body = im.crop((0, int(h * 0.07), w, int(h * 0.92)))  # without header and footer bands
            bbox = ImageChops.invert(body).getbbox()
            out.append(0.0 if bbox is None else round((bbox[3]) / body.size[1], 2))
        return out if len(out) == n_pages else None
    except Exception:
        return None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def text_checks(rep, text, where="text"):
    """Leftovers, repeated words, stray scripts and double punctuation in the text of a file."""
    seen = set()
    for m in LEFTOVER.finditer(text):
        s = m.group(0)
        if s.lower() in seen:
            continue
        seen.add(s.lower())
        rep.fail(where, f'leftover that should not be there: "{s[:60]}"')
        if len(seen) >= 5:
            break
    letters = len(LATIN.findall(text))
    if letters > 200:
        for name, rx in SCRIPTS.items():
            found = re.findall(rx, text)
            if found and len(found) / max(letters, 1) < 0.05:
                snippet = re.search(rx + r".{0,24}", text)
                rep.fail(where, f'text in another script ({name}) inside an English document: "{snippet.group(0) if snippet else ""}"')
    reps = []
    for m in re.finditer(r"\b([A-Za-z]{3,})[ \t]+\1\b", text, re.I):
        w = m.group(1).lower()
        if w not in ("that", "had", "very") and m.group(0).lower() not in reps:
            reps.append(m.group(0).lower())
    if reps:
        rep.warn(where, "a word is repeated: " + ", ".join(f'"{r}"' for r in reps[:4]))
    dots = re.findall(r"(?<![.…])\.\.(?!\.)|,,|;;", text)
    if dots:
        rep.warn(where, f"doubled punctuation ({len(dots)} places, like '..')")


def parse_range(spec):
    m = re.match(r"^(\d+)-(\d+)$", spec)
    return (int(m.group(1)), int(m.group(2))) if m else (int(spec), int(spec))


def want(requires, name):
    for r in requires:
        k, _, v = r.partition(":")
        if k == name:
            return v or True
    return None


# ───────────────────────── Excel ─────────────────────────


def lint_calculated(rep, wb, calc):
    """What only a calculated copy shows: a table of aggregations that all come to 0, and formulas
    that refer to an empty cell (a criterion in a header that was never written, a wrong column)."""
    for ws in wb:
        cs = calc[ws.title]
        zeros, empty_refs = [], {}
        for row in ws.iter_rows():
            for c in row:
                v = c.value
                if not (isinstance(v, str) and v.startswith("=") and AGGREGATES.search(v)):
                    continue
                if cs[c.coordinate].value == 0:
                    zeros.append(c.coordinate)
                # Single-cell references only (ranges are meant to include blanks).
                for m in CELL_REF.finditer(re.sub(r'"[^"]*"', "", v)):
                    sheet = m.group(1) or m.group(2)
                    target = wb[sheet] if sheet in wb.sheetnames else (ws if not sheet else None)
                    if target is None:
                        continue
                    ref = f"{m.group(3)}{m.group(4)}"
                    if target[ref].value is None and ref not in empty_refs:
                        empty_refs[ref] = (c.coordinate, target.title)
        if len(zeros) >= 3:
            rep.fail(ws.title, f"{len(zeros)} aggregation formulas (SUMIFS and the like) calculate to 0, like {', '.join(zeros[:4])}: a criterion probably matches nothing (a header cell that is empty, a month or name that is not in the data)")
        for ref, (at, sheet_name) in list(empty_refs.items())[:3]:
            rep.fail(ws.title, f"the formula in {at} refers to {sheet_name}!{ref}, which is empty")


def audit_xlsx(path, requires, ctx):
    import openpyxl

    rep = Report(path, "xlsx")
    try:
        wb = openpyxl.load_workbook(path)
        cached = openpyxl.load_workbook(path, data_only=True)
    except Exception as e:
        rep.fail("file", f"does not open as a workbook: {str(e)[:120]}")
        return rep
    formulas = 0
    charts = 0
    uncached = 0
    values = []
    colsums = {}
    for ws in wb:
        cs = cached[ws.title]
        charts += len(ws._charts)
        bigpct, texty = [], []
        cells = 0
        for row in ws.iter_rows():
            for c in row:
                v = c.value
                if v is None:
                    continue
                cells += 1
                if cells > 60000:
                    break
                if isinstance(v, str) and v.startswith("="):
                    formulas += 1
                    cv = cs[c.coordinate].value
                    if cv is None:
                        uncached += 1
                    elif isinstance(cv, str) and cv in ERROR_VALUES:
                        rep.fail(f"{ws.title}!{c.coordinate}", f"formula shows {cv}")
                    elif isinstance(cv, (int, float)) and not isinstance(cv, bool):
                        values.append(float(cv))
                        colsums[(ws.title, c.column)] = colsums.get((ws.title, c.column), 0.0) + float(cv)
                    continue
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    values.append(float(v))
                    colsums[(ws.title, c.column)] = colsums.get((ws.title, c.column), 0.0) + float(v)
                    if "%" in (c.number_format or "") and abs(v) > 1.5:
                        bigpct.append((c.coordinate, v))
                elif isinstance(v, str):
                    if v in ERROR_VALUES:
                        rep.fail(f"{ws.title}!{c.coordinate}", f"cell holds {v}")
                    elif re.fullmatch(r"-?[\d,]*\d(\.\d+)?", v.strip()) and len(v.strip()) > 0:
                        texty.append(c.coordinate)
        if bigpct:
            ex = bigpct[0]
            rep.fail(
                ws.title,
                f"{len(bigpct)} cells are formatted as percent but hold values above 1 (like {ex[0]} = {ex[1]}, which shows as {ex[1] * 100:,.0f}%). Store a fraction ({ex[1] / 100:g}) or use a number format without %.",
            )
        if len(texty) >= 3:
            rep.warn(ws.title, f"{len(texty)} numbers are stored as text (like {texty[0]}): they won't add up")
        for i, ch in enumerate(ws._charts, 1):
            try:
                if not ch.series:
                    rep.fail(ws.title, f"chart {i} has no data series")
                elif ch.title is None:
                    rep.warn(ws.title, f"chart {i} has no title")
            except Exception:
                pass
    suspicious = []  # filled from the calculated copy below

    # Formulas that were never calculated (a workbook written by a library): calculate them with LibreOffice.
    if formulas and uncached:
        tmp = tempfile.mkdtemp(prefix="recalc-")
        out = convert(path, "xlsx", tmp)
        if out:
            try:
                calc = openpyxl.load_workbook(out, data_only=True)
                lint_calculated(rep, wb, calc)
                values = []
                colsums = {}
                for ws in calc:
                    for row in ws.iter_rows():
                        for c in row:
                            v = c.value
                            if isinstance(v, str) and v in ERROR_VALUES:
                                rep.fail(f"{ws.title}!{c.coordinate}", f"formula shows {v}")
                            elif isinstance(v, (int, float)) and not isinstance(v, bool):
                                values.append(float(v))
                                colsums[(ws.title, c.column)] = colsums.get((ws.title, c.column), 0.0) + float(v)
                rep.info(f"{formulas} formulas calculated with LibreOffice: no errors" if not any(f["level"] == "fail" and "formula shows" in f["message"] for f in rep.findings) else f"{formulas} formulas calculated")
            except Exception as e:
                rep.warn("file", f"could not read the recalculated copy: {str(e)[:80]}")
        else:
            rep.warn("file", f"{uncached} formulas have never been calculated and LibreOffice isn't installed here, so they could not be checked")
        shutil.rmtree(tmp, ignore_errors=True)
    ctx.setdefault("xlsx_values", values + list(colsums.values()))
    rep.info(f"sheets: {', '.join(ws.title for ws in wb)}; formulas: {formulas}; charts: {charts}")
    n = want(requires, "charts")
    if n and n is not True and charts < int(n):
        rep.fail("charts", f"{charts} charts, the request needs at least {n}")
    n = want(requires, "formulas")
    if n and n is not True and formulas < int(n):
        rep.fail("formulas", f"{formulas} formulas, the request needs at least {n}")
    return rep


# ───────────────────────── PowerPoint ─────────────────────────


def _blocks(slide):
    """The shapes that carry content, as (name, kind, left, top, width, height)."""
    out = []
    for sh in slide.shapes:
        try:
            l, t, w, h = sh.left, sh.top, sh.width, sh.height
        except Exception:
            continue
        if l is None or t is None or w is None or h is None:
            continue
        if getattr(sh, "has_chart", False) and sh.has_chart:
            kind, name = "chart", "the chart"
        elif getattr(sh, "has_table", False) and sh.has_table:
            kind, name = "table", "the table"
        elif sh.shape_type == 13:
            kind, name = "picture", "a picture"
        elif sh.has_text_frame and sh.text_frame.text.strip():
            kind = "text"
            name = 'the text "' + sh.text_frame.text.strip().split("\n")[0][:28] + '"'
        else:
            continue  # decoration with no content
        out.append((name, kind, l, t, w, h, sh))
    return out


def audit_pptx(path, requires, ctx):
    from pptx import Presentation

    rep = Report(path, "pptx")
    try:
        prs = Presentation(path)
    except Exception as e:
        rep.fail("file", f"does not open as a presentation: {str(e)[:120]}")
        return rep
    W, H = prs.slide_width, prs.slide_height
    charts = tables = pics = with_notes = 0
    no_title, no_notes, overflow = [], [], []
    texts = []
    for i, s in enumerate(prs.slides, 1):
        blocks = _blocks(s)
        if not blocks:
            rep.fail(f"slide {i}", "the slide is empty")
        for name, kind, l, t, w, h, sh in blocks:
            charts += kind == "chart"
            tables += kind == "table"
            pics += kind == "picture"
            tol = 91440 // 4
            if l < -tol or t < -tol or l + w > W + tol or t + h > H + tol:
                rep.fail(f"slide {i}", f"{name} runs off the slide")
            if kind == "text":
                size = None
                for p in sh.text_frame.paragraphs:
                    for r in p.runs:
                        if r.font.size:
                            size = r.font.size.pt
                            break
                    if size:
                        break
                size = size or 18.0
                width_in = max(w / 914400 - 0.2, 0.5)
                lines = 0
                for p in sh.text_frame.paragraphs:
                    chars = len(p.text)
                    per_line = max(int(width_in * 72 / (size * 0.5)), 1)
                    lines += max(1, -(-chars // per_line))
                need = lines * size * 1.2 / 72
                if need > (h / 914400) * 1.25 and need > 0.6:
                    overflow.append(f"slide {i}")
        # Overlaps: a chart, table or picture on top of anything else with content.
        for a in range(len(blocks)):
            for b in range(a + 1, len(blocks)):
                na, ka, la, ta, wa, ha, _ = blocks[a]
                nb, kb, lb, tb, wb_, hb, _ = blocks[b]
                if "text" == ka == kb:
                    continue
                ix = max(0, min(la + wa, lb + wb_) - max(la, lb))
                iy = max(0, min(ta + ha, tb + hb) - max(ta, tb))
                small = min(wa * ha, wb_ * hb)
                if small and ix * iy / small > 0.12:
                    rep.fail(f"slide {i}", f"{na} overlaps {nb} ({ix * iy / small:.0%} of the smaller one)")
        title = s.shapes.title
        if title is None or not title.text_frame.text.strip():
            no_title.append(i)
        has_note = s.has_notes_slide and s.notes_slide.notes_text_frame.text.strip()
        if has_note:
            with_notes += 1
            texts.append(s.notes_slide.notes_text_frame.text)
        else:
            no_notes.append(i)
        for sh in s.shapes:
            if sh.has_text_frame:
                texts.append(sh.text_frame.text)
            if getattr(sh, "has_table", False) and sh.has_table:
                for row in sh.table.rows:
                    for c in row.cells:
                        texts.append(c.text)
    n = len(prs.slides)
    full = "\n".join(texts)
    rep.text = full
    text_checks(rep, full, "text")
    if no_title:
        rep.warn("titles", f"slides {', '.join(map(str, no_title[:8]))} have no title placeholder (slide outline and screen readers can't see their titles)")
    if overflow:
        rep.warn("text", f"text may not fit its box on {', '.join(overflow[:6])}")
    rep.info(f"slides: {n}; charts: {charts}; tables: {tables}; pictures: {pics}; speaker notes on {with_notes} of {n}")
    if want(requires, "notes") and no_notes:
        rep.fail("notes", f"speaker notes are missing on slide(s) {', '.join(map(str, no_notes[:12]))}")
    r = want(requires, "slides")
    if r and r is not True:
        lo, hi = parse_range(r)
        if not lo <= n <= hi:
            rep.fail("slides", f"{n} slides, the request asks for {lo} to {hi}")
    c = want(requires, "charts")
    if c and c is not True and charts < int(c):
        rep.fail("charts", f"{charts} native charts, the request needs at least {c} (pictures of charts don't count)")
    return rep


# ───────────────────────── Word ─────────────────────────

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def audit_docx(path, requires, ctx, render=True):
    import docx

    rep = Report(path, "docx")
    try:
        d = docx.Document(path)
    except Exception as e:
        rep.fail("file", f"does not open as a document: {str(e)[:120]}")
        return rep
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf8", "replace")
    paras = d.paragraphs
    texts = [p.text for p in paras]
    for t in d.tables:
        for row in t.rows:
            for c in row.cells:
                texts.append(c.text)
    full = "\n".join(texts)
    rep.text = full
    heads = [p for p in paras if p.style is not None and (p.style.name.startswith("Heading") or p.style.name == "Title")]
    toc_field = bool(re.search(r"<w:instrText[^>]*>\s*TOC\b", xml) or re.search(r'<w:fldSimple[^>]*w:instr="\s*TOC\b', xml) or "Table of Contents" in xml and "docPartGallery" in xml)
    typed = False
    for i, p in enumerate(paras):
        if re.fullmatch(r"\s*(table of )?contents\s*", p.text, re.I):
            nxt = [q.text for q in paras[i + 1 : i + 5]]
            if sum(1 for t in nxt if re.search(r"(\.{3,}|…|\t)\s*\d+\s*$", t) or re.search(r"\.{4,}", t)) >= 2:
                typed = True
    if typed and not toc_field:
        rep.fail("contents", 'the "table of contents" is typed text with dot leaders, not a real contents field (its page numbers will be wrong). Insert a TOC field.')
    if want(requires, "toc") and not toc_field and not typed:
        rep.fail("contents", "no real table-of-contents field in the document")
    # Footer page numbers and a header.
    page_field = False
    header_text = ""
    for sec in d.sections:
        fx = sec.footer._element.xml if sec.footer is not None else ""
        if re.search(r"instrText[^>]*>\s*PAGE|w:fldSimple[^>]*PAGE", fx):
            page_field = True
        header_text = header_text or " ".join(p.text for p in sec.header.paragraphs).strip()
    if want(requires, "page_numbers") and not page_field:
        rep.fail("footer", "no page-number field in the footer")
    if want(requires, "header_title") and not header_text:
        rep.fail("header", "the header is empty (the request asks for the title there)")
    # Numbered lists that never restart.
    groups, cur, last_style = [], [], False
    for p in paras:
        is_num = p.style is not None and p.style.name.lower().startswith("list number")
        if p.style is not None and p.style.name.startswith("Heading"):
            if cur:
                groups.append(cur)
            cur = []
        elif is_num:
            cur.append(p)
    if cur:
        groups.append(cur)
    groups = [g for g in groups if g]
    if len(groups) >= 2:
        ids = set()
        for g in groups:
            m = re.search(r"<w:numId w:val=\"(\d+)\"", g[0]._p.xml)
            ids.add(m.group(1) if m else (g[0].style.name if g[0].style else ""))
        if len(ids) == 1:
            rep.warn("lists", f"{len(groups)} numbered lists share one numbering, so each continues where the last ended (a list in a later section starts at {sum(len(g) for g in groups[:-1]) + 1}, not 1)")
    text_checks(rep, full, "text")
    pics = len(re.findall(r"<a:blip\b", xml))
    rep.info(f"headings: {len(heads)}; tables: {len(d.tables)}; pictures: {pics}; contents field: {'yes' if toc_field else 'no'}; page numbers: {'yes' if page_field else 'no'}; header: {'yes' if header_text else 'no'}")
    c = want(requires, "charts")
    if c and c is not True and pics < int(c):
        rep.fail("charts", f"{pics} pictures/charts, the request needs at least {c}")
    # Render: page count and pages that are mostly empty.
    pr = want(requires, "pages")
    if render:
        tmp = tempfile.mkdtemp(prefix="render-")
        pdf = convert(path, "pdf", tmp)
        if pdf:
            pages = pdf_pages_text(pdf) or []
            n = len(pages)
            fills = page_fill(pdf, n) if n else None
            rep.info(f"rendered pages: {n}")
            if fills:
                thin = [i + 1 for i, f in enumerate(fills[:-1]) if f < 0.34]  # the last page may be short
                if len(thin) >= 2 or (thin and n <= 4):
                    rep.warn("layout", f"pages {', '.join(map(str, thin[:10]))} of {n} are less than a third full (page breaks before every section leave blank space)")
            elif pages:
                thin = [i + 1 for i, t in enumerate(pages[:-1]) if len(t.strip()) < 220]
                if len(thin) >= 2:
                    rep.warn("layout", f"pages {', '.join(map(str, thin[:10]))} of {n} hold very little text")
            if pr and pr is not True:
                lo, hi = parse_range(pr)
                if not lo <= n <= hi:
                    rep.fail("pages", f"{n} pages when rendered, the request asks for {lo} to {hi}")
            ctx.setdefault("pdfs", {})[path] = pdf
        else:
            rep.warn("layout", "page count and layout were not checked: LibreOffice isn't installed here" + (f" (the request asks for {pr} pages)" if pr and pr is not True else ""))
            shutil.rmtree(tmp, ignore_errors=True)
    return rep


# ───────────────────────── PDF ─────────────────────────


def audit_pdf(path, requires, ctx):
    rep = Report(path, "pdf")
    pages = pdf_pages_text(path)
    if pages is None:
        rep.fail("file", "does not open as a PDF")
        return rep
    empty = [i + 1 for i, t in enumerate(pages) if len(t.strip()) < 20]
    full = "\n".join(pages)
    rep.text = full
    if empty:
        rep.warn("pages", f"pages {', '.join(map(str, empty[:10]))} have no text")
    text_checks(rep, full, "text")
    rep.info(f"pages: {len(pages)}")
    r = want(requires, "pages")
    if r and r is not True:
        lo, hi = parse_range(r)
        if not lo <= len(pages) <= hi:
            rep.fail("pages", f"{len(pages)} pages, the request asks for {lo} to {hi}")
    return rep


# ───────────────────────── Numbers across files ─────────────────────────

NUM = re.compile(r"(?<![\w.])[₹$€£]?\s?\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![\w.])\d+(?:\.\d+)?\s?%")


def figures(text):
    out = []
    for m in NUM.finditer(text):
        s = m.group(0).strip()
        if s.endswith("%"):
            out.append((s, float(s[:-1].strip()), "pct"))
        else:
            out.append((s, float(re.sub(r"[^\d.]", "", s)), "num"))
    return out


def agree(reports, ctx):
    src = ctx.get("xlsx_values")
    if not src:
        return None
    rep = Report("figures", "agree")
    values = sorted(set(round(v, 4) for v in src))

    def has(x, tol):
        import bisect

        i = bisect.bisect_left(values, x - tol)
        return i < len(values) and values[i] <= x + tol

    checked = missing = 0
    for r in reports:
        if r.kind == "xlsx" or not r.text:
            continue
        seen = set()
        for s, x, kind in figures(r.text):
            if s in seen:
                continue
            seen.add(s)
            checked += 1
            if kind == "pct":
                if x == 0:
                    rep.fail(r.file, f'"{s}" looks like a failed calculation')
                    continue
                ok = has(x, 0.06) or has(x / 100, 0.0006) or has(x * 100, 6)
            else:
                ok = has(x, max(0.5, abs(x) * 0.0005)) or has(x / 1000, 0.5) or has(x * 1000, 0.5 * 1000)
            if not ok:
                missing += 1
                if missing <= 12:
                    rep.warn(r.file, f'"{s}" is not a figure in the workbook (it may be derived: check it)')
    rep.info(f"{checked} figures in the other files compared with the workbook; {missing} not found in it")
    return rep


# ───────────────────────── main ─────────────────────────


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+")
    ap.add_argument("--require", default="", help="comma-separated: notes,toc,page_numbers,header_title,pages:A-B,slides:A-B,charts:N,formulas:N")
    ap.add_argument("--agree", action="store_true", help="check the figures in the other files against the first workbook")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--no-render", action="store_true", help="skip LibreOffice (no page count or layout check)")
    a = ap.parse_args(argv)
    requires = [r.strip() for r in a.require.split(",") if r.strip()]
    ctx, reports = {}, []
    ordered = sorted(a.files, key=lambda f: 0 if f.lower().endswith((".xlsx", ".xlsm")) else 1)
    for f in ordered:
        low = f.lower()
        if not os.path.exists(f):
            r = Report(f, "missing")
            r.fail("file", "the file does not exist")
        elif low.endswith((".xlsx", ".xlsm")):
            r = audit_xlsx(f, requires, ctx)
        elif low.endswith(".pptx"):
            r = audit_pptx(f, requires, ctx)
        elif low.endswith(".docx"):
            r = audit_docx(f, requires, ctx, render=not a.no_render)
        elif low.endswith(".pdf"):
            r = audit_pdf(f, requires, ctx)
        else:
            r = Report(f, "other")
            r.warn("file", "not an Excel, PowerPoint, Word or PDF file: nothing checked")
        reports.append(r)
    if a.agree:
        ag = agree(reports, ctx)
        if ag is not None:
            reports.append(ag)
    ok = not any(f["level"] == "fail" for r in reports for f in r.findings)
    if a.json:
        print(json.dumps({"ok": ok, "files": [{"file": r.file, "kind": r.kind, "facts": r.facts, "findings": r.findings} for r in reports]}, ensure_ascii=False))
        return 0
    for r in reports:
        print(f"== {r.file} ({r.kind})")
        for fact in r.facts:
            print(f"   info  {fact}")
        for f in r.findings:
            print(f"   {f['level'].upper():5} {f['where']}: {f['message']}")
        if not r.findings:
            print("   no problems found")
    print("RESULT:", "no failures" if ok else "FAILURES: fix them, then run this again")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
