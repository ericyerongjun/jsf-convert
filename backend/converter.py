#!/usr/bin/env python3
"""
Convert a .jsf file (plain text) to a simple PDF.
"""
from __future__ import annotations

import sys
import shutil
from pathlib import Path
from typing import Iterable

from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas

MARGIN = 72  # points
LINE_HEIGHT = 14  # points


def wrap_lines(text: str, max_chars: int = 100) -> Iterable[str]:
    for line in text.splitlines() or [""]:
        if len(line) <= max_chars:
            yield line
            continue
        start = 0
        while start < len(line):
            yield line[start : start + max_chars]
            start += max_chars


def convert(jsf_path: Path, pdf_path: Path) -> None:
    if not jsf_path.exists():
        raise FileNotFoundError(f"Missing input: {jsf_path}")

    data = jsf_path.read_bytes()

    # If the input is already a PDF, copy it straight through.
    if data.startswith(b"%PDF-"):
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(jsf_path, pdf_path)
        return

    # Otherwise try to decode as text, being lenient on encoding.
    text: str | None = None
    for encoding in ("utf-8-sig", "utf-16", "latin-1"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = data.decode("utf-8", errors="ignore")

    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    doc = canvas.Canvas(str(pdf_path), pagesize=LETTER)
    width, height = LETTER
    y = height - MARGIN

    doc.setFont("Helvetica", 11)
    doc.drawString(MARGIN, y, f"Source: {jsf_path.name}")
    y -= LINE_HEIGHT * 2

    for segment in wrap_lines(text):
        if y <= MARGIN:
            doc.showPage()
            doc.setFont("Helvetica", 11)
            y = height - MARGIN
        doc.drawString(MARGIN, y, segment)
        y -= LINE_HEIGHT

    doc.save()


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: converter.py <input.jsf> <output.pdf>", file=sys.stderr)
        return 1

    jsf_path = Path(sys.argv[1]).expanduser().resolve()
    pdf_path = Path(sys.argv[2]).expanduser().resolve()

    try:
        convert(jsf_path, pdf_path)
    except Exception as exc:  # noqa: BLE001
        print(f"Conversion failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
