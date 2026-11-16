from docx import Document

doc = Document()
doc.add_heading("Memo: four-day week", 0)
for i in range(60):
    doc.add_paragraph(("We propose a trial of a four-day work week. " * 12).strip())
doc.save("memo.docx")
