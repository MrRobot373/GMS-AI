import sys

from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from pptx.util import Inches

notes = sys.argv[1] != "no-notes" if len(sys.argv) > 1 else True
prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)


def add(layout, title, body=None, note="Talk through this slide in about a minute."):
    s = prs.slides.add_slide(prs.slide_layouts[layout])
    s.shapes.title.text = title
    if body is not None:
        s.placeholders[1].text = body
    if notes:
        s.notes_slide.notes_text_frame.text = note
    return s


add(0, "Welcome: your first 30 days", "New-hire onboarding plan")
add(1, "What you can expect", "Week 1 setup and training\nWeek 2 shadowing\nWeeks 3-4 real work with support")
add(1, "Week 1: get set up", "Accounts, equipment and a buddy\nTraining on our tools\nMeet the team")
add(1, "Weeks 2-4: learn by doing", "Shadow a colleague\nTake a small project\nWeekly check-in with your manager")
s = add(5, "Where your time goes")
cd = CategoryChartData()
cd.categories = ["Week 1", "Week 2", "Week 3", "Week 4"]
cd.add_series("Training", (70, 30, 15, 5))
cd.add_series("Shadowing", (20, 50, 25, 10))
cd.add_series("Real work", (10, 20, 60, 85))
s.shapes.add_chart(XL_CHART_TYPE.COLUMN_STACKED_100, Inches(1.5), Inches(1.6), Inches(10), Inches(5), cd)
add(1, "Questions and next steps", "Your buddy and manager are your first stop\nBook your Friday check-in")
prs.save("deck.pptx")
