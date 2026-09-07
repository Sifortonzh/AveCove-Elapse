"""Read-only PDF audit; outputs stay local, never treated as OCR or ground truth."""

import hashlib
import json
from pathlib import Path

import pymupdf

out = Path("tmp/forge-reference")
out.mkdir(parents=True, exist_ok=True)
for folder in ("curriculums", "ocr-benchmarks"):
    for path in sorted((Path.home() / "Downloads" / folder).glob("*.pdf")):
        doc = pymupdf.open(path)
        pages = []
        for i, page in enumerate(doc):
            text = page.get_text(sort=True)
            pages.append(
                {
                    "page": i + 1,
                    "size": list(page.rect),
                    "rotation": page.rotation,
                    "text_length": len(text),
                    "images": len(page.get_images()),
                    "text": text,
                }
            )
        result = {
            "file": path.name,
            "role": folder,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "pages": pages,
        }
        (out / (path.stem + ".json")).write_text(
            json.dumps(result, ensure_ascii=False, indent=2)
        )
        print(path.name, len(doc), "pages;", [p["text_length"] for p in pages])
        if folder == "ocr-benchmarks":
            # Contact sheet of every page to see transitions and answer regions.
            sheet = pymupdf.open()
            for start in range(0, len(doc), 6):
                canvas = sheet.new_page(width=1000, height=1350)
                for slot, i in enumerate(range(start, min(start + 6, len(doc)))):
                    pix = doc[i].get_pixmap(matrix=pymupdf.Matrix(1, 1))
                    x, y = (slot % 2) * 500, (slot // 2) * 450
                    canvas.insert_image(
                        pymupdf.Rect(x, y + 20, x + 490, y + 445),
                        stream=pix.tobytes("png"),
                    )
                    canvas.insert_text((x + 10, y + 14), f"PDF page {i + 1}")
                canvas.get_pixmap().save(
                    out / f"{path.stem}-sheet-{start // 6 + 1}.png"
                )
