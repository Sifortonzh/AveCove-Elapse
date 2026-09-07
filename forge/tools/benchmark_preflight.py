"""Inspect user-owned references and runtime; no OCR is claimed by this command."""

import argparse
import hashlib
import json
from pathlib import Path

import pymupdf

from elapse_forge.benchmark import GroundTruth
from elapse_forge.config import Settings
from elapse_forge.models import Document, Question, now
from elapse_forge.ocr import MinerUProvider

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("forge/benchmarks"))
    args = parser.parse_args()
    samples = []
    for path in sorted(args.samples.glob("*.pdf")):
        with pymupdf.open(path) as pdf:
            samples.append(
                {
                    "file": path.name,
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "page_count": len(pdf),
                    "role": "ocr-benchmark-not-canonical",
                    "pages_with_text_layer": sum(
                        bool(p.get_text().strip()) for p in pdf
                    ),
                    "rotations": sorted({p.rotation for p in pdf}),
                    "ground_truth": None,
                }
            )
    args.output.mkdir(parents=True, exist_ok=True)
    report = {
        "at": now(),
        "samples": samples,
        "mineru": MinerUProvider(Settings()).preflight(),
        "mineru_executed": False,
        "normalized_real_ocr_result": None,
        "accuracy": None,
    }
    (args.output / "preflight.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2)
    )
    for name, model in [
        ("ground-truth", GroundTruth),
        ("document", Document),
        ("question", Question),
    ]:
        (args.output / f"{name}.schema.json").write_text(
            json.dumps(model.model_json_schema(), ensure_ascii=False, indent=2)
        )
    print(json.dumps(report, ensure_ascii=False, indent=2))
