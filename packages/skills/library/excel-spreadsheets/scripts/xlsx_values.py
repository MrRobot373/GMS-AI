#!/usr/bin/env python3
"""Read a workbook's CALCULATED values (what Excel would show), not its formulas.

A workbook written by openpyxl holds formulas but no results until a spreadsheet program opens it:
`pandas.read_excel` or `load_workbook(data_only=True)` then give NaN or None for every formula cell,
so a later step (the deck, the report) sees empty numbers and invents its own. This calculates a
copy with LibreOffice and reads that.

    from xlsx_values import read_calculated
    sheets = read_calculated("Sales.xlsx")          # {"Data": DataFrame, "Summary": DataFrame, ...}
    total = sheets["Summary"]["Revenue (INR)"].sum()

    python3 xlsx_values.py Sales.xlsx outdir        # one CSV per sheet, calculated values

Needs LibreOffice (`soffice`). Without it the cached values are returned, and the function says when
formulas have none.
"""
import os
import shutil
import subprocess
import sys
import tempfile


def _calculated_copy(path, outdir):
    exe = shutil.which("soffice") or shutil.which("libreoffice")
    if not exe:
        return None
    profile = tempfile.mkdtemp(prefix="lo-profile-")
    try:
        subprocess.run([exe, f"-env:UserInstallation=file://{profile}", "--headless", "--convert-to", "xlsx", "--outdir", outdir, path], capture_output=True, timeout=150)
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    out = os.path.join(outdir, os.path.splitext(os.path.basename(path))[0] + ".xlsx")
    return out if os.path.exists(out) else None


def read_calculated(path, header=0):
    """{sheet name: DataFrame} of the workbook's calculated values."""
    import pandas as pd

    tmp = tempfile.mkdtemp(prefix="calc-")
    try:
        src = _calculated_copy(os.path.abspath(path), tmp)
        if src is None:
            sheets = pd.read_excel(path, sheet_name=None, header=header)
            empty = [n for n, df in sheets.items() if df.isna().all().any() and len(df)]
            if empty:
                print(f"WARNING: LibreOffice is not installed; formula cells in {', '.join(empty)} have no stored values.", file=sys.stderr)
            return sheets
        return pd.read_excel(src, sheet_name=None, header=header)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    os.makedirs(sys.argv[2], exist_ok=True)
    for name, df in read_calculated(sys.argv[1]).items():
        out = os.path.join(sys.argv[2], f"{name}.csv")
        df.to_csv(out, index=False)
        print(f"{name}: {len(df)} rows -> {out}")
