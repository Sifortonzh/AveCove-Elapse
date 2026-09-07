#!/usr/bin/env python3
"""Build a conservative Elapse bank from sequential MinerU Markdown chunks."""

import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from elapse_forge.models import Block, Document, Page
from elapse_forge.parser import parse_document, reconcile

STANDALONE_CHAPTERS = {
    "原虫病": "第七章 原虫病",
}

CATEGORY_OCR_FIXES = {
    "恋虫病": "恙虫病",
}


def cleaned_lines(path: Path) -> list[str]:
    raw_lines = path.read_text(encoding="utf-8-sig").replace("\r", "").splitlines()
    result: list[str] = []
    skip = set()
    for index, raw in enumerate(raw_lines):
        if index in skip:
            continue
        line = re.sub(r"^#{1,6}\s*", "", raw).strip()
        if not line or line.startswith(("![", "<img")):
            continue
        if re.fullmatch(r"第[一二三四五六七八九十百\d]+章", line):
            for next_index in range(index + 1, min(index + 5, len(raw_lines))):
                candidate_raw = raw_lines[next_index]
                candidate = re.sub(r"^#{1,6}\s*", "", candidate_raw).strip()
                if not candidate:
                    continue
                if candidate_raw.lstrip().startswith("#") and not candidate.startswith(
                    ("第", "【")
                ):
                    line = f"{line} {candidate}"
                    skip.add(next_index)
                break
        line = STANDALONE_CHAPTERS.get(line, line)
        result.append(line)
    return result


def build_document(paths: list[Path]) -> Document:
    pages = [
        Page(
            page_number=index,
            width=1,
            height=1,
            blocks=[
                Block(
                    id=f"markdown-chunk-{index}",
                    type="text",
                    text="\n".join(cleaned_lines(path)),
                    reading_order=0,
                )
            ],
            preprocessing=[
                "Markdown headings normalized; no PDF coordinates available"
            ],
        )
        for index, path in enumerate(paths, 1)
    ]
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.read_bytes())
    return Document(
        id=digest.hexdigest(),
        metadata={
            "source_file": "传染病学学习指导与习题集（第3版，第9版教材配套）",
            "source_chunks": [path.name for path in paths],
        },
        pages=pages,
        provider="mineru-markdown",
        raw_output_reference=[str(path) for path in paths],
    )


def suitable(question) -> bool:
    kind = str(question.type)
    if kind not in {"A1", "A2", "A3", "A4", "B1", "C", "single", "multiple"}:
        return False
    labels = [option.label for option in question.options]
    if labels != list("ABCDE") or not question.answer:
        return False
    if not set(question.answer) <= set(labels):
        return False
    if kind == "multiple" and len(question.answer) < 2:
        return False
    if kind != "multiple" and len(question.answer) != 1:
        return False
    if {"duplicate_question_number", "answer_mismatch"} & set(question.flags):
        return False
    return len(question.stem.strip()) >= 4


def elapse_question(question, index: int) -> dict:
    kind = str(question.type)
    category = question.scope.replace(" / ", " · ").strip() or "未分章"
    for malformed, corrected in CATEGORY_OCR_FIXES.items():
        category = category.replace(malformed, corrected)
    explanation = re.sub(
        r"^\s*(?:试题分析|解析)\s*[:：]\s*", "", question.explanation
    ).strip()
    stable = hashlib.sha256(
        f"{category}\0{kind}\0{question.source_question_number}\0{question.stem}".encode()
    ).hexdigest()[:20]
    question_type = (
        "X" if kind == "multiple" else "B" if kind == "B1" else "C" if kind == "C" else "A"
    )
    medical_type = "X" if kind == "multiple" else kind if kind in {"A1", "A2", "A3", "A4", "B1", "C"} else None
    return {
        "id": f"renwei-infectious-{stable}",
        "sourceNumber": question.source_question_number,
        "category": category,
        "stem": question.stem.strip(),
        "options": [option.model_dump(mode="json") for option in question.options],
        "answer": question.answer,
        "multiple": kind == "multiple",
        "questionType": question_type,
        "medicalQuestionType": medical_type,
        "sharedStem": question.shared_stem.strip(),
        "sharedStemGroup": question.shared_stem_group,
        "sharedOptionGroup": question.shared_option_group,
        "explanation": explanation,
        "answerSource": "《传染病学学习指导与习题集》第3版（《传染病学》第9版配套）参考答案；MinerU Markdown 转换，使用时请结合原书复核。",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if any(not path.is_file() for path in args.inputs):
        raise SystemExit("Every Markdown chunk must exist")
    parsed = reconcile(parse_document(build_document(args.inputs)))
    selected = [question for question in parsed.questions if suitable(question)]
    unique = {}
    for question in selected:
        key = (
            question.scope,
            re.sub(r"\W+", "", question.stem).lower(),
            tuple((option.label, option.text) for option in question.options),
        )
        unique.setdefault(key, question)
    selected = list(unique.values())
    chapters = Counter(
        question.scope.split("/")[0].strip() or "未分章" for question in selected
    )
    types = Counter(str(question.type) for question in selected)
    scope_distribution = []
    for scope in dict.fromkeys(question.scope for question in selected):
        scoped = [question for question in selected if question.scope == scope]
        type_ranges = []
        for kind in dict.fromkeys(str(question.type) for question in scoped):
            numbers = [int(question.source_question_number) for question in scoped if str(question.type) == kind and question.source_question_number.isdigit()]
            if numbers:
                compact = str(min(numbers)) if len(numbers) == 1 else f"{min(numbers)}-{max(numbers)}"
                type_ranges.append(f"{kind} {compact}")
        scope_distribution.append(f"{scope.replace(' / ', ' · ')}：{'、'.join(type_ranges)}（{len(scoped)}题）")
    description = "\n".join(
        [
            "用途：2026-09-21 传染病学考试复习的最低可用题库。",
            "来源：《传染病学学习指导与习题集》第3版，对应人民卫生出版社《传染病学》第9版教材。",
            f"本版收录 {len(selected)} 道结构完整且答案可关联的客观题：A1 {types['A1']}、A2 {types['A2']}、A3 {types['A3']}、A4 {types['A4']}、B1 {types['B1']}、C {types['C']}、X {types['multiple']}。",
            "筛选规则：仅保留选项完整、且答案能从原书答案区可靠关联的客观题；不收入填空、名词解释和问答题。A3/A4 共用病例题干，B1 共用备选答案。",
            "章节分布："
            + "；".join(f"{name} {count} 道" for name, count in chapters.items()),
            "目录备注（原题号按题型分区）：\n" + "\n".join(scope_distribution),
            "说明：由 MinerU Markdown 自动整理，已过滤明显结构异常；原文 OCR、答案和解析仍可能存在错误，请结合教材原文复核。",
        ]
    )
    package = {
        "format": "hongdou-question-bank",
        "version": 1,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "bank": {
            "name": "传染病学人卫第9版配套 · 考前可刷版",
            "description": description,
            "groupName": "传染病学 · 人卫第9版",
            "questions": [
                elapse_question(question, index)
                for index, question in enumerate(selected, 1)
            ],
        },
        "forgeReport": {
            "candidateQuestions": len(parsed.questions),
            "answerEntries": len(parsed.answers),
            "includedQuestions": len(selected),
            "excludedQuestions": len(parsed.questions) - len(selected),
            "documentIssues": len(parsed.issues),
            "sourceChunks": [path.name for path in args.inputs],
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(package, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(package["forgeReport"], ensure_ascii=False))


if __name__ == "__main__":
    main()
