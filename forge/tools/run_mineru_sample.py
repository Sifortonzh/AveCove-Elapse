"""Run real MinerU on an explicitly selected small sample window, retaining every artifact."""

import argparse
import hashlib
from pathlib import Path

import pymupdf

from elapse_forge.config import Settings
from elapse_forge.models import Document
from elapse_forge.ocr import MinerUProvider

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument(
        "--pages",
        default="1",
        help="Original PDF page numbers, comma-separated; at most 3",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="New directory, never overwrite evidence",
    )
    args = parser.parse_args()
    numbers = sorted(set(int(n) for n in args.pages.split(",")))
    if not 1 <= len(numbers) <= 3:
        parser.error("Select 1–3 pages for first real benchmark run")
    settings = Settings()
    provider = MinerUProvider(settings)
    if not provider.preflight()["ready"]:
        parser.error("; ".join(provider.preflight()["issues"]))
    args.output.mkdir(parents=True, exist_ok=False)
    pages, refs = [], []
    with pymupdf.open(args.pdf) as pdf:
        for number in numbers:
            if not 1 <= number <= len(pdf):
                parser.error("Page out of bounds")
            original = pdf[number - 1]
            single_path = args.output / f"page-{number}.pdf"
            with pymupdf.open() as single:
                single.insert_pdf(pdf, from_page=number - 1, to_page=number - 1)
                single.save(single_path)
            page, files = provider.recognize(
                single_path,
                args.output / f"raw-{number}",
                number,
                original.rect.width,
                original.rect.height,
            )
            page.rotation = original.rotation
            pages.append(page)
            refs.extend(str(p.relative_to(args.output)) for p in files)
    sha = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    document = Document(
        id=sha,
        metadata={"source_file": args.pdf.name, "sha256": sha},
        pages=pages,
        provider="mineru",
        raw_output_reference=refs,
    )
    (args.output / "document.json").write_text(document.model_dump_json(indent=2))
    print(f"Real MinerU output: {args.output / 'document.json'}; no accuracy computed")
