#!/usr/bin/env python3
"""Build a chapter-aware Elapse bank from the two-column Zhang Xuejun JSON.

The source has usable text spans but an unreliable global reading order.  This
converter reconstructs the page as horizontal bands, reads the left column
before the right column inside each band, and only associates answers printed
in the book's own per-chapter answer sections.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

CHINESE_NUMBER = "一二三四五六七八九十百"
CHAPTER_RE = re.compile(rf"第\s*[{CHINESE_NUMBER}]+\s*章[^\n]*|第三篇\s*性传播疾病")
SINGLE_RE = re.compile(r"(?:[（(]?\s*一\s*[）)]?\s*)?单\s*项\s*选\s*择\s*题")
MULTIPLE_RE = re.compile(r"(?:[（(]?\s*二\s*[）)]?\s*)?多\s*项\s*选\s*择\s*题")
CHOICE_RE = re.compile(r"一\s*[、,，]?\s*选\s*择\s*题")
END_CHOICE_RE = re.compile(r"(?:二\s*[、,，]?\s*(?:名\s*词\s*解\s*释|问\s*答\s*题)|三\s*[、,，]?\s*问\s*答\s*题)")
REFERENCE_RE = re.compile(r"参\s*考\s*答\s*案")
ANSWER_ITEM_RE = re.compile(r"(?<!\d)(\d{1,3})\s*[.．、]\s*([ABCD]{1,4})(?![A-Z])", re.I)
LABEL_RE = re.compile(r"^([ABCD])\s*[.．、:：]\s*(.*)$", re.I)


@dataclass
class Line:
    text: str
    page: int
    column: int
    x: float
    y: float
    block: int

    @property
    def indent(self) -> float:
        return self.x - (90 if self.column == 0 else 320)


@dataclass
class Event:
    kind: str
    text: str
    lines: list[Line] = field(default_factory=list)


@dataclass
class DraftQuestion:
    chapter: str
    kind: str
    stem: str
    options: list[str]
    page: int


def compact(text: str) -> str:
    return re.sub(r"\s+", "", text)


def clean_chapter(text: str) -> str:
    text = re.sub(r"\s+", "", text)
    text = text.replace("第二十七章皮肤肿瘤", "第二十七章 皮肤肿瘤")
    text = text.replace("第十六章药疹", "第十六章 药疹")
    text = text.replace("第二十二章血管性皮肤病", "第二十二章 血管性皮肤病")
    text = text.replace("第三篇性传播疾病", "第三篇 性传播疾病")
    match = re.search(rf"(第[{CHINESE_NUMBER}]+章)(.*)", text)
    return re.sub(r"\s+", " ", f"{match[1]} {match[2]}".strip() if match else text)


def block_spans(block: dict) -> list[dict]:
    return [
        span
        for line in block.get("lines", [])
        for span in line.get("spans", [])
        if str(span.get("content", "")).strip() and span.get("bbox") and not span.get("cross_page")
    ]


def relocate_cross_page_spans(data: dict) -> list[dict]:
    """Move MinerU's cross-page look-ahead spans onto the following page."""

    source_pages = data.get("pdf_info", [])
    carried: dict[int, list[dict]] = {}
    result = []
    for page_index, source_page in enumerate(source_pages):
        blocks = []
        for block in source_page.get("para_blocks", []):
            normal_lines = []
            cross_lines = []
            for line in block.get("lines", []):
                normal = [span for span in line.get("spans", []) if not span.get("cross_page")]
                cross = [dict(span, cross_page=False) for span in line.get("spans", []) if span.get("cross_page")]
                if normal:
                    normal_lines.append(dict(line, spans=normal))
                if cross:
                    cross_lines.append(dict(line, spans=cross))
            if normal_lines:
                clone = copy.copy(block)
                clone["lines"] = normal_lines
                clone["bbox"] = [
                    min(span["bbox"][0] for line in normal_lines for span in line["spans"]),
                    min(span["bbox"][1] for line in normal_lines for span in line["spans"]),
                    max(span["bbox"][2] for line in normal_lines for span in line["spans"]),
                    max(span["bbox"][3] for line in normal_lines for span in line["spans"]),
                ]
                blocks.append(clone)
            if cross_lines and page_index + 1 < len(source_pages):
                clone = copy.copy(block)
                clone["lines"] = cross_lines
                clone["bbox"] = [
                    min(span["bbox"][0] for line in cross_lines for span in line["spans"]),
                    min(span["bbox"][1] for line in cross_lines for span in line["spans"]),
                    max(span["bbox"][2] for line in cross_lines for span in line["spans"]),
                    max(span["bbox"][3] for line in cross_lines for span in line["spans"]),
                ]
                carried.setdefault(page_index + 1, []).append(clone)
        blocks.extend(carried.get(page_index, []))
        blocks.sort(key=lambda block: (block.get("bbox", [0, 0])[1], block.get("bbox", [0, 0])[0]))
        result.append(dict(source_page, para_blocks=blocks))
    return result


def lines_from_spans(spans: list[dict], page: int, column: int, block: int) -> list[Line]:
    rows: list[tuple[float, list[tuple[float, str]]]] = []
    for span in spans:
        x0, y0, *_ = span["bbox"]
        text = str(span["content"]).strip()
        row = next((entry for entry in rows if abs(entry[0] - y0) <= 2.5), None)
        if row is None:
            row = (y0, [])
            rows.append(row)
        row[1].append((x0, text))
    result = []
    for y, cells in sorted(rows):
        result.append(Line("".join(text for _, text in sorted(cells)), page, column, min(x for x, _ in cells), y, block))
    return result


def marker_kind(text: str) -> str | None:
    if REFERENCE_RE.search(text):
        return "reference"
    if CHAPTER_RE.search(text) or CHAPTER_RE.search(compact(text)):
        return "chapter"
    if MULTIPLE_RE.search(text):
        return "multiple"
    if SINGLE_RE.search(text):
        return "single"
    if END_CHOICE_RE.search(text):
        return "end-choice"
    if CHOICE_RE.search(text):
        return "choice"
    return None


def page_events(page: dict, page_number: int) -> list[Event]:
    blocks = []
    markers = []
    for block_index, block in enumerate(page.get("para_blocks", [])):
        spans = block_spans(block)
        if not spans:
            continue
        text = "".join(str(span["content"]) for span in spans).strip()
        y = min(span["bbox"][1] for span in spans)
        kind = marker_kind(text)
        # Long body blocks can contain a subtype heading followed by questions.
        # Treat only the heading prefix as the boundary; the body is retained.
        if kind and (block.get("type") == "title" or len(compact(text)) < 90):
            markers.append((y, block_index, kind, text))
        blocks.append((block_index, block, spans))

    boundaries = sorted({0.0, 829.0, *(item[0] for item in markers)})
    events: list[Event] = []
    for low, high in zip(boundaries, boundaries[1:]):
        for _, _, kind, text in sorted((item for item in markers if abs(item[0] - low) < 1), key=lambda item: item[1]):
            if kind in {"single", "multiple"}:
                pattern = SINGLE_RE if kind == "single" else MULTIPLE_RE
                match = pattern.search(text)
                events.append(Event(kind, match.group(0) if match else text))
                suffix = text[match.end():].strip(" ：:（）()\n") if match else ""
                if suffix:
                    events.append(Event("body", suffix, [Line(suffix, page_number, 0, 100, low, -1)]))
            else:
                events.append(Event(kind, text))
        pieces: dict[int, list[tuple[float, int, list[Line]]]] = {0: [], 1: []}
        for block_index, _, spans in blocks:
            if any(index == block_index and abs(y - low) < 1 for y, index, _, _ in markers):
                continue
            for column in (0, 1):
                selected = [
                    span for span in spans
                    if (span["bbox"][0] < 289) == (column == 0) and low <= span["bbox"][1] < high
                ]
                if selected:
                    lines = lines_from_spans(selected, page_number, column, block_index)
                    pieces[column].append((min(line.y for line in lines), block_index, lines))
        for column in (0, 1):
            for _, _, lines in sorted(pieces[column]):
                text = "\n".join(line.text for line in lines)
                inline = marker_kind(text)
                if inline in {"single", "multiple"}:
                    pattern = SINGLE_RE if inline == "single" else MULTIPLE_RE
                    match = pattern.search(text)
                    if match:
                        events.append(Event(inline, match.group(0)))
                        suffix = text[match.end():].strip(" ：:（）()\n")
                        if suffix:
                            first = lines[0]
                            events.append(Event("body", suffix, [Line(suffix, first.page, first.column, first.x, first.y, first.block)]))
                        continue
                events.append(Event("body", text, lines))
    return events


def extract_answers_linear(data: dict) -> dict[tuple[str, str], list[str]]:
    registry: dict[tuple[str, str], dict[int, str]] = {}
    chapter = ""
    kind = ""
    in_reference = False
    for page in relocate_cross_page_spans(data):
        for block in page.get("para_blocks", []):
            text = "\n".join(
                "".join(str(span.get("content", "")) for span in line.get("spans", []))
                for line in block.get("lines", [])
            ).strip()
            if not text:
                continue
            chapter_match = CHAPTER_RE.search(text) or CHAPTER_RE.search(compact(text))
            if chapter_match:
                chapter = clean_chapter(chapter_match.group(0))
                kind = ""
                in_reference = False
            reference_match = REFERENCE_RE.search(text)
            if reference_match:
                in_reference = True
                kind = ""
                text = text[reference_match.end():]
            if not in_reference or not chapter:
                continue
            if END_CHOICE_RE.search(text) and not ANSWER_ITEM_RE.search(text):
                kind = ""
                continue
            tokens = []
            for match in SINGLE_RE.finditer(text):
                tokens.append((match.start(), "kind", "single"))
            for match in MULTIPLE_RE.finditer(text):
                tokens.append((match.start(), "kind", "multiple"))
            for match in ANSWER_ITEM_RE.finditer(text):
                tokens.append((match.start(), "answer", match))
            for _, token_type, value in sorted(tokens, key=lambda item: item[0]):
                if token_type == "kind":
                    kind = value
                elif kind:
                    number = int(value.group(1))
                    answer = "".join(dict.fromkeys(value.group(2).upper()))
                    registry.setdefault((chapter, kind), {})[number] = answer
    result = {}
    for key, indexed in registry.items():
        if indexed:
            result[key] = [indexed.get(number, "") for number in range(1, max(indexed) + 1)]
    return result


def extract_sections(data: dict) -> tuple[dict[tuple[str, str], list[Line]], dict[tuple[str, str], list[str]]]:
    bodies: dict[tuple[str, str], list[Line]] = {}
    answers = extract_answers_linear(data)
    chapter = ""
    kind = ""
    in_choice = False
    in_reference = False
    reference_buffer: dict[tuple[str, str], list[str]] = {}
    for page_number, page in enumerate(relocate_cross_page_spans(data), 1):
        for event in page_events(page, page_number):
            if event.kind == "chapter":
                match = CHAPTER_RE.search(event.text) or CHAPTER_RE.search(compact(event.text))
                if match:
                    chapter = clean_chapter(match.group(0))
                kind = ""
                in_choice = False
                in_reference = False
                continue
            if event.kind == "reference":
                in_reference = True
                in_choice = False
                kind = ""
                continue
            if event.kind == "choice":
                in_choice = not in_reference
                if not in_reference and not kind:
                    kind = "single"
                continue
            if event.kind == "single":
                kind = "single"
                if not in_reference:
                    in_choice = True
                continue
            if event.kind == "multiple":
                kind = "multiple"
                if not in_reference:
                    in_choice = True
                continue
            if event.kind == "end-choice":
                if not in_reference:
                    in_choice = False
                kind = ""
                continue
            if not chapter or not kind or event.kind != "body":
                continue
            inline_multiple = MULTIPLE_RE.search(event.text)
            if inline_multiple:
                prefix = event.text[:inline_multiple.start()].strip()
                suffix = event.text[inline_multiple.end():].strip(" ：:（）()\n")
                if in_reference and prefix:
                    reference_buffer.setdefault((chapter, kind), []).append(prefix)
                kind = "multiple"
                if suffix:
                    if in_reference:
                        reference_buffer.setdefault((chapter, kind), []).append(suffix)
                    elif in_choice:
                        first = event.lines[0]
                        bodies.setdefault((chapter, kind), []).append(Line(suffix, first.page, first.column, first.x, first.y, first.block))
                continue
            if in_reference:
                reference_buffer.setdefault((chapter, kind), []).append(event.text)
            elif in_choice:
                bodies.setdefault((chapter, kind), []).extend(event.lines)

    return bodies, answers


QUESTION_WORDS = re.compile(r"以下|下列|哪|何|最|是|有|为|包括|属于|关于|描述|可见于|表现|治疗|诊断|病因|病原|禁用|好发|主要|首选|错误|正确|患者|感染|病程|疗程|潜伏期|特点|途径|方法|因素|部位|时间|比较|发生|分布|需")


def question_starts(lines: list[Line]) -> list[tuple[int, int]]:
    result = []
    previous_end = -1
    for end, line in enumerate(lines):
        if not any(mark in line.text for mark in ("：", ":", "？", "?")):
            continue
        lower = end
        while lower > previous_end + 1:
            prior = lines[lower - 1]
            if (prior.page, prior.column, prior.block) != (line.page, line.column, line.block):
                break
            lower -= 1
        candidates = list(range(lower, end + 1))
        start = min(candidates, key=lambda index: (lines[index].indent, index))
        if LABEL_RE.match(lines[start].text):
            continue
        result.append((start, end))
        previous_end = end
    return result


def dedupe_adjacent(lines: list[Line]) -> list[Line]:
    result = []
    for line in lines:
        text = LABEL_RE.sub(lambda match: match.group(2), line.text).strip()
        if result and compact(text) == compact(result[-1].text) and line.page == result[-1].page and line.column == result[-1].column and abs(line.y - result[-1].y) <= 2.5:
            continue
        result.append(Line(text, line.page, line.column, line.x, line.y, line.block))
    return result


def split_options(lines: list[Line]) -> list[str]:
    lines = dedupe_adjacent([line for line in lines if compact(line.text)])
    explicit = [(index, LABEL_RE.match(line.text)) for index, line in enumerate(lines)]
    explicit = [(index, match) for index, match in explicit if match]
    if len(explicit) == 4 and [match.group(1).upper() for _, match in explicit] == list("ABCD"):
        starts = [index for index, _ in explicit]
    else:
        minimum_indent = min((line.indent for line in lines), default=999)
        starts = [index for index, line in enumerate(lines) if line.indent <= minimum_indent + 6]
        if len(starts) != 4:
            if len(lines) < 4:
                return []
            starts = sorted(sorted(range(len(lines)), key=lambda index: (lines[index].indent, index))[:4])
    options = []
    for pos, start in enumerate(starts):
        end = starts[pos + 1] if pos + 1 < len(starts) else len(lines)
        parts = [lines[item].text for item in range(start, end)]
        parts[0] = LABEL_RE.sub(lambda match: match.group(2), parts[0]).strip()
        options.append("".join(parts).strip())
    return options if len(options) == 4 and all(options) else []


def parse_questions(chapter: str, kind: str, lines: list[Line]) -> list[DraftQuestion]:
    starts = question_starts(lines)
    result = []
    for position, (start, stem_end) in enumerate(starts):
        next_start = starts[position + 1][0] if position + 1 < len(starts) else len(lines)
        stem = "".join(line.text for line in lines[start:stem_end + 1]).strip()
        options = split_options(lines[stem_end + 1:next_start])
        if not options:
            raw = dedupe_adjacent([line for line in lines[stem_end + 1:next_start] if compact(line.text)])
            options = [line.text for line in raw[:4]]
            options.extend(["【MinerU 原文件未识别此选项】"] * (4 - len(options)))
        if len(compact(stem)) < 4:
            stem = f"【MinerU 原文件未完整识别题干：{stem or '空白'}】"
        result.append(DraftQuestion(chapter, kind, stem, options, lines[start].page))
    return result


def make_question(question: DraftQuestion, number: int, answer: str) -> dict:
    digest = hashlib.sha256(f"{question.chapter}\0{question.kind}\0{number}\0{question.stem}".encode()).hexdigest()[:20]
    return {
        "id": f"dermatology-xuejun-{digest}",
        "sourceNumber": str(number),
        "category": question.chapter,
        "stem": question.stem,
        "options": [{"label": label, "text": text} for label, text in zip("ABCD", question.options)],
        "answer": list(answer),
        "answerPending": not answer,
        "multiple": question.kind == "multiple",
        "questionType": "X" if question.kind == "multiple" else "A",
        "medicalQuestionType": "X" if question.kind == "multiple" else "A1",
        "sharedStem": "",
        "sharedStemGroup": None,
        "sharedOptionGroup": None,
        "explanation": "",
        "answerSource": "《皮肤性病学习题集》（张学军）各章参考答案；题干与选项来自 MinerU Hybrid JSON。",
        "sourcePage": question.page,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8-sig"))
    bodies, answer_sections = extract_sections(data)
    questions = []
    report = {}
    chapter_counts = Counter()
    placeholder_count = 0
    for key, source_lines in bodies.items():
        chapter, kind = key
        parsed = parse_questions(chapter, kind, source_lines)
        answers = answer_sections.get(key, [])
        starts = question_starts(source_lines)
        verified = len(starts) == len(answers) and bool(answers) and all(answers)
        included = len(parsed) if verified and len(parsed) == len(starts) else 0
        report[f"{chapter}|{kind}"] = {
            "parsed": len(parsed),
            "answers": len(answers),
            "included": included,
            "oneToOneVerified": verified,
        }
        # Sequential association is accepted only when the section counts match.
        if included:
            for number, (question, answer) in enumerate(zip(parsed, answers), 1):
                questions.append(make_question(question, number, answer))
                chapter_counts[chapter] += 1
                placeholder_count += sum(option.startswith("【MinerU") for option in question.options)

    description = "\n".join([
        "用途：皮肤性病学章节化客观题练习。",
        "来源：《皮肤性病学习题集》（张学军），由 MinerU Hybrid JSON 重建双栏阅读顺序。",
        f"本版收录 {len(questions)} 道题：单项选择 {sum(not q['multiple'] for q in questions)} 道，多项选择 {sum(q['multiple'] for q in questions)} 道。",
        "筛选规则：只收录题干、四个选项和本章参考答案能够一一对应的选择题；不收入名词解释、填空、简答和病例讨论。",
        "章节分布：" + "；".join(f"{chapter} {count} 道" for chapter, count in chapter_counts.items()),
        "说明：原文件未包含第一至第八章；少数公式、数字或英文缩写在 MinerU 原始识别中缺失，使用时请结合原书复核。",
    ])
    package = {
        "format": "hongdou-question-bank",
        "version": 1,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "bank": {
            "name": "皮肤性病学习题集（张学军）· 客观题整理版",
            "description": description,
            "groupName": "皮肤性病学 · 张学军",
            "questions": questions,
        },
        "forgeReport": {"includedQuestions": len(questions), "sections": report},
    }
    package["forgeReport"]["placeholderOptions"] = placeholder_count
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(package, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(package["forgeReport"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
