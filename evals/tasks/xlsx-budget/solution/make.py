from openpyxl import Workbook
from openpyxl.chart import LineChart, Reference

wb = Workbook()
ws = wb.active
ws.title = "Plan"
months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
ws.append(["", *months])
income = {"Subscriptions": [12000, 12500, 13000, 13200, 13800, 14500], "Services": [4000, 3500, 5000, 4200, 4800, 5200], "Licences": [1500, 1500, 1800, 1800, 2000, 2000]}
costs = {"Salaries": [11000] * 6, "Rent": [2500] * 6, "Software": [900, 900, 950, 950, 1000, 1000], "Marketing": [1200, 1500, 1300, 1800, 1600, 2000]}
for name, vals in income.items():
    ws.append([name, *vals])
ws.append(["Total income", *[f"=SUM({c}2:{c}4)" for c in "BCDEFG"]])
for name, vals in costs.items():
    ws.append([name, *vals])
ws.append(["Total expenses", *[f"=SUM({c}6:{c}9)" for c in "BCDEFG"]])
ws.append(["Net", *[f"={c}5-{c}10" for c in "BCDEFG"]])
chart = LineChart()
chart.title = "Net by month"
chart.add_data(Reference(ws, min_col=1, max_col=7, min_row=11), titles_from_data=True, from_rows=True)
chart.set_categories(Reference(ws, min_col=2, max_col=7, min_row=1))
ws.add_chart(chart, "A14")
wb.save("budget.xlsx")
