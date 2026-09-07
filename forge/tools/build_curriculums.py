"""Reproducibly extract ONLY the two user-designated canonical TOCs, never scan TOCs."""

import argparse
import hashlib
import re
from pathlib import Path

import pymupdf

from elapse_forge.curriculum import normalize_title
from elapse_forge.models import Curriculum, CurriculumNode

NUM = "一二三四五六七八九十百零〇两"


def extract(path: Path, course_id: str, title: str) -> Curriculum:
    nodes = []
    stack = {}
    with pymupdf.open(path) as pdf:
        for page_index, page in enumerate(pdf):
            for raw in page.get_text(sort=True).splitlines():
                line = re.sub(r"[.．·…\s]+", " ", raw).strip()
                hit = re.match(
                    rf"^(第[{NUM}]+([篇章节])|[{NUM}]+、|附录[{NUM}]*)\s*(.*?)\s+(\d+)$",
                    line,
                )
                if not hit:
                    continue
                prefix, level, name, printed_page = hit.groups()
                name = name.strip() or prefix
                rank = {"篇": 0, "章": 1, "节": 2}.get(level, 3)
                if prefix == "附录":
                    rank = 1
                elif prefix.startswith("附录"):
                    rank = 2
                parent = next(
                    (stack[r] for r in sorted(stack, reverse=True) if r < rank), None
                )
                node_id = hashlib.sha256(
                    f"{course_id}/{parent}/{prefix}/{name}".encode()
                ).hexdigest()[:24]
                # Search full title where possible. Never invent a bbox if PDF spans do not match.
                boxes = page.search_for(name)
                box = boxes[0] if len(boxes) == 1 else None
                node = CurriculumNode(
                    id=node_id,
                    course_id=course_id,
                    parent_id=parent,
                    node_type={0: "part", 1: "chapter", 2: "section", 3: "subsection"}[
                        rank
                    ],
                    title=name,
                    normalized_title=normalize_title(name),
                    order=len(nodes),
                    metadata={
                        "source_file": path.name,
                        "source_page": page_index + 1,
                        "printed_page": int(printed_page),
                        "source_label": prefix,
                        "raw_text": raw.strip(),
                        "bbox": [
                            box.x0 / page.rect.width,
                            box.y0 / page.rect.height,
                            box.x1 / page.rect.width,
                            box.y1 / page.rect.height,
                        ]
                        if box
                        else None,
                    },
                )
                nodes.append(node)
                stack = {r: v for r, v in stack.items() if r < rank}
                stack[rank] = node_id
    return Curriculum(
        id=course_id,
        title=title,
        version="user-provided-2026-09-06",
        source_file=path.name,
        source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        nodes=nodes,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("forge/curriculums"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for filename, course, title in [
        ("27传染病学_目录.pdf", "infectious-diseases", "传染病学"),
        ("31皮肤性病学_目录.pdf", "dermatology", "皮肤性病学"),
    ]:
        tree = extract(args.source / filename, course, title)
        (args.output / f"{course}.json").write_text(
            tree.model_dump_json(indent=2), encoding="utf-8"
        )
        print(course, len(tree.nodes), "nodes")
