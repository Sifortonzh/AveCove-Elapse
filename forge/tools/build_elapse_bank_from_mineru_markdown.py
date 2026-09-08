#!/usr/bin/env python3
"""Build conservative or full-structure Elapse banks from sequential MinerU results."""

import argparse
import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from elapse_forge.models import Block, Document, Page
from elapse_forge.ocr import normalize_mineru_hybrid, parse_mineru_table_html
from elapse_forge.parser import parse_document, reconcile

STANDALONE_CHAPTERS = {
    "原虫病": "第七章 原虫病",
}

CATEGORY_OCR_FIXES = {
    "恋虫病": "恙虫病",
}

CIRCLED_NUMBERS = {
    character: str(index) for index, character in enumerate("①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳", 1)
}


@dataclass(frozen=True)
class BuildProfile:
    source_file: str
    id_prefix: str
    bank_name: str
    group_name: str
    answer_source: str
    purpose: str
    source_description: str
    include_judgement: bool = False
    require_five_options: bool = True
    require_multiple_answers: bool = True


PROFILES = {
    "infectious-renwei": BuildProfile(
        source_file="传染病学学习指导与习题集（第3版，第9版教材配套）",
        id_prefix="renwei-infectious",
        bank_name="传染病学人卫第9版配套 · 考前可刷版",
        group_name="传染病学 · 人卫第9版",
        answer_source="《传染病学学习指导与习题集》第3版（《传染病学》第9版配套）参考答案；MinerU Hybrid JSON/Markdown 转换，使用时请结合原书复核。",
        purpose="2026-09-21 传染病学考试复习的最低可用题库。",
        source_description="《传染病学学习指导与习题集》第3版，对应人民卫生出版社《传染病学》第9版教材。",
    ),
    "junyi-obgyn": BuildProfile(
        source_file="妇产科学复习考试指导（军医）",
        id_prefix="junyi-obgyn",
        bank_name="妇产科学复习考试指导（军医）· 客观题版",
        group_name="妇产科学 · 军医",
        answer_source="《妇产科学复习考试指导（军医）》各章参考答案；MinerU Markdown 转换，使用时请结合原书复核。",
        purpose="妇产科学军医题库的选择题与判断题练习。",
        source_description="《妇产科学复习考试指导（军医）》；答案按各章参考答案区与题型、原题号关联。",
        include_judgement=True,
        require_five_options=False,
        require_multiple_answers=False,
    ),
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
        circled = re.match(r"^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])(?=\s*[.．、])", line)
        if circled:
            line = CIRCLED_NUMBERS[circled[1]] + line[circled.end() :]
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


def markdown_blocks(path: Path, chunk_index: int) -> list[Block]:
    """Preserve MinerU HTML tables as table blocks instead of flattening them."""

    lines = cleaned_lines(path)
    blocks: list[Block] = []
    text_buffer: list[str] = []
    table_buffer: list[str] = []
    in_table = False

    def flush_text():
        if not text_buffer:
            return
        order = len(blocks)
        blocks.append(
            Block(
                id=f"markdown-chunk-{chunk_index}-text-{order}",
                type="text",
                text="\n".join(text_buffer),
                reading_order=order,
            )
        )
        text_buffer.clear()

    def flush_table():
        html = "\n".join(table_buffer)
        rows = parse_mineru_table_html(html)
        order = len(blocks)
        blocks.append(
            Block(
                id=f"markdown-chunk-{chunk_index}-table-{order}",
                type="table",
                text="\n".join("\t".join(cell["text"] for cell in row) for row in rows),
                reading_order=order,
                metadata={"table_html": html, "table_rows": rows},
            )
        )
        table_buffer.clear()

    for line in lines:
        if in_table:
            table_buffer.append(line)
            if "</table>" in line.lower():
                flush_table()
                in_table = False
            continue
        if line.lower().startswith("<table"):
            flush_text()
            table_buffer.append(line)
            if "</table>" in line.lower():
                flush_table()
            else:
                in_table = True
            continue
        text_buffer.append(line)
    if table_buffer:
        flush_table()
    flush_text()
    return blocks


def build_document(paths: list[Path], profile: BuildProfile) -> Document:
    pages = [
        Page(
            page_number=index,
            width=1,
            height=1,
            blocks=markdown_blocks(path, index),
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
            "source_file": profile.source_file,
            "source_chunks": [path.name for path in paths],
        },
        pages=pages,
        provider="mineru-markdown",
        raw_output_reference=[str(path) for path in paths],
    )


def build_hybrid_document(paths: list[Path], profile: BuildProfile) -> Document:
    """Join sequential MinerU Hybrid JSON volumes into one logical document."""

    pages = []
    metadata = []
    digest = hashlib.sha256()
    for path in paths:
        body = path.read_bytes()
        digest.update(body)
        chunk, chunk_metadata = normalize_mineru_hybrid(
            json.loads(body.decode("utf-8-sig"))
        )
        metadata.append(chunk_metadata)
        for page in chunk:
            page.page_number = len(pages) + 1
            for block in page.blocks:
                suffix = block.id.split("-", 1)[-1]
                block.id = f"p{page.page_number}-{suffix}"
            pages.append(page)
    return Document(
        id=digest.hexdigest(),
        metadata={
            "source_file": profile.source_file,
            "source_chunks": [path.name for path in paths],
            "mineru": metadata,
        },
        pages=pages,
        provider="mineru-cloud-hybrid",
        raw_output_reference=[str(path) for path in paths],
    )


def suitable(question, profile: BuildProfile) -> bool:
    kind = str(question.type)
    accepted = {"A1", "A2", "A3", "A4", "B1", "C", "single", "multiple"}
    if profile.include_judgement:
        accepted.add("judgement")
    if kind not in accepted:
        return False
    labels = [option.label for option in question.options]
    if not question.answer:
        return False
    if kind == "judgement":
        if question.answer not in (["A"], ["B"]):
            return False
    elif profile.require_five_options:
        if labels != list("ABCDE"):
            return False
    elif len(labels) < 2 or labels != list("ABCDEFG"[: len(labels)]):
        return False
    if not set(question.answer) <= set(labels):
        if kind != "judgement":
            return False
    if (
        kind == "multiple"
        and profile.require_multiple_answers
        and len(question.answer) < 2
    ):
        return False
    if kind not in {"multiple", "judgement"} and len(question.answer) != 1:
        return False
    if {"duplicate_question_number", "answer_mismatch"} & set(question.flags):
        return False
    return len(question.stem.strip()) >= 4


def suitable_complete(question, profile: BuildProfile) -> bool:
    """Keep every structurally complete objective item without inventing answers."""

    kind = str(question.type)
    accepted = {"A1", "A2", "A3", "A4", "B1", "C", "single", "multiple"}
    if profile.include_judgement:
        accepted.add("judgement")
    if kind not in accepted or len(question.stem.strip()) < 4:
        return False
    labels = [option.label for option in question.options]
    if kind == "judgement":
        return labels in ([], ["A", "B"])
    if profile.require_five_options:
        return labels == list("ABCDE")
    return len(labels) >= 2 and labels == list("ABCDEFG"[: len(labels)])


def elapse_question(question, index: int, profile: BuildProfile) -> dict:
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
        "X"
        if kind == "multiple"
        else "B"
        if kind == "B1"
        else "C"
        if kind == "C"
        else "A"
    )
    medical_type = (
        "X"
        if kind == "multiple"
        else kind
        if kind in {"A1", "A2", "A3", "A4", "B1", "C"}
        else None
    )
    options = [option.model_dump(mode="json") for option in question.options]
    if kind == "judgement":
        options = [{"label": "A", "text": "正确"}, {"label": "B", "text": "错误"}]
    payload = {
        "id": f"{profile.id_prefix}-{stable}",
        "sourceNumber": question.source_question_number,
        "category": category,
        "stem": question.stem.strip(),
        "options": options,
        "answer": question.answer,
        "answerPending": not question.answer,
        "multiple": kind == "multiple",
        "medicalQuestionType": medical_type,
        "sharedStem": question.shared_stem.strip(),
        "sharedStemGroup": question.shared_stem_group,
        "sharedOptionGroup": question.shared_option_group,
        "explanation": explanation,
        "answerSource": profile.answer_source,
    }
    if kind != "judgement":
        payload["questionType"] = question_type
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--profile", choices=sorted(PROFILES), default="infectious-renwei"
    )
    parser.add_argument(
        "--complete",
        action="store_true",
        help="keep every structurally complete objective question; unmatched answers remain pending",
    )
    args = parser.parse_args()
    if any(not path.is_file() for path in args.inputs):
        raise SystemExit("Every MinerU chunk must exist")
    suffixes = {path.suffix.lower() for path in args.inputs}
    if not suffixes <= {".md"} and not suffixes <= {".json"}:
        raise SystemExit("Use either sequential MinerU Markdown or Hybrid JSON chunks")
    profile = PROFILES[args.profile]
    document = (
        build_hybrid_document(args.inputs, profile)
        if suffixes == {".json"}
        else build_document(args.inputs, profile)
    )
    parsed = reconcile(parse_document(document))
    selector = suitable_complete if args.complete else suitable
    selected = [
        question for question in parsed.questions if selector(question, profile)
    ]
    unique = {}
    for question in selected:
        key = (
            question.scope,
            re.sub(r"\W+", "", question.stem).lower(),
            tuple((option.label, option.text) for option in question.options),
        )
        unique.setdefault(key, question)
    selected = list(unique.values())
    pending = sum(not question.answer for question in selected)
    chapters = Counter(
        question.scope.split("/")[0].strip() or "未分章" for question in selected
    )
    types = Counter(str(question.type) for question in selected)
    scope_distribution = []
    for scope in dict.fromkeys(question.scope for question in selected):
        scoped = [question for question in selected if question.scope == scope]
        type_ranges = []
        for kind in dict.fromkeys(str(question.type) for question in scoped):
            numbers = [
                int(question.source_question_number)
                for question in scoped
                if str(question.type) == kind
                and question.source_question_number.isdigit()
            ]
            if numbers:
                compact = (
                    str(min(numbers))
                    if len(numbers) == 1
                    else f"{min(numbers)}-{max(numbers)}"
                )
                type_ranges.append(f"{kind} {compact}")
        scope_distribution.append(
            f"{scope.replace(' / ', ' · ')}：{'、'.join(type_ranges)}（{len(scoped)}题）"
        )
    description = "\n".join(
        [
            f"用途：{'保留全部结构完整的客观题，并明确区分原书答案已关联与待核对题。' if args.complete else profile.purpose}",
            f"来源：{profile.source_description}",
            f"本版收录 {len(selected)} 道结构完整且答案可关联的客观题：A1 {types['A1']}、A2 {types['A2']}、A3 {types['A3']}、A4 {types['A4']}、B1 {types['B1']}、C {types['C']}、单选 {types['single']}、X/多选 {types['multiple']}、判断 {types['judgement']}。",
            "筛选规则：仅保留结构完整、且答案能从原书答案区可靠关联的选择题与判断题；不收入填空、名词解释、简答和问答题。A3/A4 共用病例题干，B1 共用备选答案。",
            "章节分布："
            + "；".join(f"{name} {count} 道" for name, count in chapters.items()),
            "目录备注（原题号按题型分区）：\n" + "\n".join(scope_distribution),
            f"答案状态：已关联原书答案 {len(selected) - pending} 道，待答案 {pending} 道。待答案题以测试模式保留，不会由系统猜测答案。",
            "说明：由 MinerU Hybrid JSON/Markdown 自动整理，已过滤明显结构异常；原文 OCR、答案和解析仍可能存在错误，请结合教材原文复核。",
        ]
    )
    package = {
        "format": "hongdou-question-bank",
        "version": 1,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "bank": {
            "name": (
                "传染病学人卫第9版配套 · 全量结构版"
                if args.complete and args.profile == "infectious-renwei"
                else profile.bank_name
            ),
            "description": description,
            "groupName": profile.group_name,
            "questions": [
                elapse_question(question, index, profile)
                for index, question in enumerate(selected, 1)
            ],
        },
        "forgeReport": {
            "candidateQuestions": len(parsed.questions),
            "answerEntries": len(parsed.answers),
            "includedQuestions": len(selected),
            "pendingAnswers": pending,
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
