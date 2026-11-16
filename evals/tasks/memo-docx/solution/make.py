from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

doc = Document()
doc.add_heading("Memo: moving to a four-day work week", 0)
doc.add_paragraph("To: the whole team. From: Operations.")
doc.add_paragraph("We propose a six-month trial of a four-day work week, Monday to Thursday, at the same pay. This memo sets out what changes and what we ask of you.")
doc.add_heading("What changes", 1)
t = doc.add_table(rows=1, cols=3)
t.style = "Light Grid Accent 1"
for cell, text in zip(t.rows[0].cells, ["", "Now", "Proposed"]):
    cell.text = text
for row in [("Working hours", "Mon-Fri, 40 h", "Mon-Thu, 36 h"), ("Meeting days", "Every day", "Tuesday and Wednesday"), ("On-call cover", "Rota of five", "Rota of four, Friday by email")]:
    cells = t.add_row().cells
    for c, v in zip(cells, row):
        c.text = v
doc.add_heading("Our ask", 1)
doc.add_paragraph("Please tell your manager by Friday whether the trial works for your team, and what would make it work better.")
p = doc.sections[0].footer.paragraphs[0]
run = p.add_run()
for kind, text in (("begin", None), (None, "PAGE"), ("end", None)):
    if kind:
        el = OxmlElement("w:fldChar")
        el.set(qn("w:fldCharType"), kind)
    else:
        el = OxmlElement("w:instrText")
        el.set(qn("xml:space"), "preserve")
        el.text = text
    run._r.append(el)
doc.save("memo.docx")
