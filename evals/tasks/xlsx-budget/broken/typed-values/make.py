from openpyxl import Workbook

wb = Workbook()
ws = wb.active
ws.title = "Plan"
ws.append(["", "Jan", "Feb"])
ws.append(["Income", 100, 110])
ws.append(["Total income", 100, 110])
ws.append(["Net", 80, 90])
wb.save("budget.xlsx")
