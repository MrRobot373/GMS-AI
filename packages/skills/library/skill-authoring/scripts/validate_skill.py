#!/usr/bin/env python3
"""Validate one governed skill folder. Exit 0 when the contract holds, 1 otherwise.

Usage: python validate_skill.py <skill-folder>
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

CATEGORIES = {
    "Software development",
    "Data",
    "Documents & writing",
    "Business",
    "Apps",
    "Platform",
}
RISK = {"low", "medium", "high", "restricted"}
MATURITY = {"draft", "tested", "verified", "production", "restricted", "deprecated"}
HEADINGS = [
    "Purpose",
    "Trigger examples",
    "Exclusions",
    "Inputs",
    "Operating modes",
    "Workflow",
    "Tool selection",
    "Permissions",
    "Output contract",
    "Quality gates",
    "Failure behavior",
    "Done when",
]
CASE_HEADINGS = [
    "Routing-positive",
    "Routing-negative",
    "Happy-path",
    "Edge-case",
    "Permission",
    "Evidence",
    "Artifact",
    "Regression",
]
NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
VERSION = re.compile(r"^\d+\.\d+\.\d+$")
RESOURCE = re.compile(r"(?:references|scripts|tests)/[\w./-]+\.(?:md|py|json|yml|yaml|txt)")


def frontmatter(text: str) -> dict[str, str]:
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?", text)
    if not m:
        return {}
    data: dict[str, str] = {}
    for line in m.group(1).splitlines():
        kv = re.match(r"^([A-Za-z][\w-]*):\s*(.*)$", line.strip())
        if not kv:
            continue
        value = kv.group(2).strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = json.loads(value) if value[0] == '"' else value[1:-1]
        data[kv.group(1)] = value
    return data


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate_skill.py <skill-folder>", file=sys.stderr)
        return 2
    folder = Path(sys.argv[1]).resolve()
    errors: list[str] = []
    skill_md = folder / "SKILL.md"
    if not skill_md.is_file():
        errors.append("missing SKILL.md")
        print("\n".join(errors))
        return 1
    raw = skill_md.read_text(encoding="utf-8")
    if len(raw.splitlines()) > 500:
        errors.append("SKILL.md is over 500 lines")
    data = frontmatter(raw)
    name = data.get("name", "")
    if name != folder.name or not NAME.match(name or ""):
        errors.append(f"name {name!r} must match the folder {folder.name!r}")
    description = data.get("description", "")
    if not description.startswith(("Use when", "Use for")):
        errors.append("description must start with 'Use when' or 'Use for'")
    if not 60 < len(description) <= 160:
        errors.append(f"description length {len(description)} is outside 61-160")
    if data.get("category") not in CATEGORIES:
        errors.append(f"category {data.get('category')!r} is not a library category")
    if not VERSION.match(data.get("version", "")):
        errors.append("version must be major.minor.patch")
    if not data.get("owner_team"):
        errors.append("owner_team is required")
    if data.get("risk_level") not in RISK:
        errors.append("risk_level must be low, medium, high, or restricted")
    if data.get("maturity") not in MATURITY:
        errors.append("maturity must be a defined maturity level")
    for heading in HEADINGS:
        if f"## {heading}" not in raw:
            errors.append(f"missing heading: {heading}")
    cases = folder / "tests" / "cases.md"
    if not cases.is_file():
        errors.append("missing tests/cases.md")
    else:
        case_text = cases.read_text(encoding="utf-8")
        for heading in CASE_HEADINGS:
            if f"## {heading}" not in case_text:
                errors.append(f"tests/cases.md missing {heading}")
    for match in RESOURCE.findall(raw):
        if not (folder / match).is_file():
            errors.append(f"missing resource named in SKILL.md: {match}")
    for dirpath, dirnames, filenames in os.walk(folder):
        dirnames[:] = [d for d in dirnames if d != "__pycache__" and not d.startswith(".")]
        current = Path(dirpath)
        if current != folder and not filenames and not dirnames:
            errors.append(f"empty directory: {current.relative_to(folder).as_posix()}")
    if errors:
        print("\n".join(errors))
        return 1
    print(f"ok {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
