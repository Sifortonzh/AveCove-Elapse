#!/usr/bin/env python3
"""Build reliable Elapse banks from known MinerU medical-book layouts.

Supported layouts:
- ``ent-junyi``: answers are printed before each question number.
- ``dermatology-renwei``: objective questions are followed by per-chapter keys.

Only objective questions with at least two readable options are exported.  A
missing answer never removes an otherwise complete question; it is retained as
``answerPending`` for later correction in Elapse.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


CHINESE_NUMBER = "一二三四五六七八九十百〇零"
CHAPTER_RE = re.compile(rf"(第\s*[{CHINESE_NUMBER}\d]+\s*章)[ \t]*(?:\n[ \t]*|[ \t]+)([^\n]{{2,40}})")
QUESTION_RE = re.compile(r"(?m)^\s*(\d{1,4})\s*[.．、]\s*")
INLINE_ANSWER_RE = re.compile(
    r"(?m)^\s*((?:\(\s*[A-E√×对错]\s*\)\s*)+)(\d{1,4})\s*[.．、]\s*",
    re.I,
)
OPTION_RE = re.compile(r"(?<![A-Za-z])([A-EＡ-Ｅ])\s*[.．、]\s*", re.I)
STATEMENT_RE = re.compile(r"[（(]\s*([1-4])\s*[）)]\s*")
PAGE_REFERENCE_RE = re.compile(r"(?:^|\s)P\s*\d+(?:\s*[～~—-]\s*\d+)?(?=\s|$)", re.I)


def normalize_label(value: str) -> str:
    return "ABCDE"["ＡＢＣＤＥ".index(value)] if value in "ＡＢＣＤＥ" else value.upper()


def line_text(line: dict) -> str:
    spans = sorted(line.get("spans", []), key=lambda span: span.get("bbox", [0])[0])
    return "".join(str(span.get("content", "")) for span in spans).strip()


def block_text(block: dict) -> str:
    lines = sorted(block.get("lines", []), key=lambda line: line.get("bbox", [0, 0])[1])
    return "\n".join(filter(None, (line_text(line) for line in lines))).strip()


def mineru_pages(payload: dict) -> list[str]:
    if not isinstance(payload.get("pdf_info"), list):
        raise SystemExit("Expected official MinerU Hybrid JSON with a pdf_info array")
    result = []
    for page in payload["pdf_info"]:
        blocks = [block_text(block) for block in page.get("para_blocks", [])]
        result.append("\n".join(block for block in blocks if block))
    return result


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", PAGE_REFERENCE_RE.sub(" ", value)).strip(" ：:；;。\n")


def split_options(value: str, minimum: int = 2) -> tuple[str, list[dict]]:
    markers = list(OPTION_RE.finditer(value))
    if len(markers) < minimum:
        return clean(value), []
    # An option run must begin with A and proceed without duplicated labels.
    start_index = next((i for i, marker in enumerate(markers) if normalize_label(marker.group(1)) == "A"), None)
    if start_index is None:
        return clean(value), []
    markers = markers[start_index:]
    accepted = []
    expected = "A"
    for marker in markers:
        label = normalize_label(marker.group(1))
        if label != expected:
            break
        accepted.append(marker)
        expected = chr(ord(expected) + 1)
    if len(accepted) < minimum:
        return clean(value), []
    stem = clean(value[: accepted[0].start()])
    options = []
    for index, marker in enumerate(accepted):
        end = accepted[index + 1].start() if index + 1 < len(accepted) else len(value)
        options.append({"label": normalize_label(marker.group(1)), "text": clean(value[marker.end() : end])})
    return stem, [option for option in options if option["text"]]


def split_statements(value: str) -> tuple[str, list[dict]]:
    markers = list(STATEMENT_RE.finditer(value))
    if len(markers) < 2:
        return clean(value), []
    accepted = []
    expected = 1
    for marker in markers:
        number = int(marker.group(1))
        if number != expected:
            if accepted:
                break
            continue
        accepted.append(marker)
        expected += 1
        if expected > 4:
            break
    if len(accepted) < 2:
        return clean(value), []
    stem = clean(value[: accepted[0].start()])
    options = []
    for index, marker in enumerate(accepted):
        end = accepted[index + 1].start() if index + 1 < len(accepted) else len(value)
        options.append({"label": "ABCD"[int(marker.group(1)) - 1], "text": clean(value[marker.end() : end])})
    return stem, options


def ensure_options(options: list[dict], labels: str) -> list[dict]:
    """Keep OCR-incomplete objective questions editable instead of dropping answers."""
    existing = {option["label"]: option for option in options if option.get("text")}
    return [
        existing.get(label, {
            "label": label,
            "text": "【原文此选项 OCR 缺失，可在纠错中补录】",
        })
        for label in labels
    ]


def ensure_answer_options(options: list[dict], answer: list[str]) -> list[dict]:
    existing_labels = "".join(option["label"] for option in options)
    missing = "".join(label for label in answer if label not in existing_labels)
    return ensure_options(options, existing_labels + missing)


def stable_id(prefix: str, chapter: str, kind: str, number: str, stem: str) -> str:
    digest = hashlib.sha256(f"{chapter}\0{kind}\0{number}\0{stem}".encode()).hexdigest()[:20]
    return f"{prefix}-{digest}"


def chapter_slices(text: str, first_chapter: str | None = None):
    matches = list(CHAPTER_RE.finditer(text))
    if first_chapter:
        matches = [match for match in matches if match.start() >= text.find(first_chapter)]
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        chapter = clean(f"{match.group(1)} {match.group(2)}").replace("药 疹", "药疹")
        yield chapter, text[match.end() : end]


def parse_regular_questions(value: str, answers: dict[str, list[str]], *, chapter: str, kind: str, prefix: str):
    matches = list(QUESTION_RE.finditer(value))
    result = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(value)
        number = match.group(1)
        stem, options = split_options(value[match.end() : end])
        if len(stem) < 2 or len(options) < 2:
            continue
        options = ensure_answer_options(options, answers.get(number, []))
        labels = {option["label"] for option in options}
        answer = [label for label in answers.get(number, []) if label in labels]
        multiple = kind == "multiple"
        result.append({
            "id": stable_id(prefix, chapter, kind, number, stem),
            "sourceNumber": number,
            "category": chapter,
            "stem": stem,
            "options": options,
            "answer": answer,
            "answerPending": not answer,
            "multiple": multiple,
            "questionType": "X" if multiple else "A",
            "medicalQuestionType": "X" if multiple else "A1",
            "explanation": "",
            "answerSource": f"{chapter} · {'多项' if multiple else '单项'}选择题参考答案" if answer else "",
        })
    return result


def answer_map(value: str) -> dict[str, list[str]]:
    return {
        match.group(1): list(dict.fromkeys(normalize_label(label) for label in match.group(2)))
        for match in re.finditer(r"(?<!\d)(\d{1,4})\s*[.．、]\s*([A-EＡ-Ｅ]{1,5})(?=\s|$)", value, re.I)
    }


def parse_dermatology(pages: list[str]) -> list[dict]:
    text = "\n".join(pages)
    questions = []
    for chapter, body in chapter_slices(text):
        exercise_start = body.find("习题")
        answer_start = body.find("参考答案", max(0, exercise_start))
        if exercise_start < 0 or answer_start < 0:
            continue
        exercise = body[exercise_start:answer_start]
        keys = body[answer_start:]
        single_heading = re.search(r"[（(]\s*一\s*[）)]\s*单项选择题[^\n]*", exercise)
        multi_heading = re.search(r"[（(]\s*二\s*[）)]\s*多项选择题[^\n]*", exercise)
        stop_heading = re.search(r"(?m)^\s*二[、.．]\s*(?:名词解释|问答题)", exercise)
        key_single = re.search(r"[（(]\s*一\s*[）)]\s*单项选择题", keys)
        key_multi = re.search(r"[（(]\s*二\s*[）)]\s*多项选择题", keys)
        if single_heading:
            end = multi_heading.start() if multi_heading else (stop_heading.start() if stop_heading else len(exercise))
            single_keys = keys[key_single.end() : key_multi.start() if key_multi else len(keys)] if key_single else ""
            questions.extend(parse_regular_questions(exercise[single_heading.end() : end], answer_map(single_keys), chapter=chapter, kind="single", prefix="dermatology-renwei-2e"))
        if multi_heading:
            end = stop_heading.start() if stop_heading else len(exercise)
            multi_keys = keys[key_multi.end() :] if key_multi else ""
            questions.extend(parse_regular_questions(exercise[multi_heading.end() : end], answer_map(multi_keys), chapter=chapter, kind="multiple", prefix="dermatology-renwei-2e"))
    return questions


def inline_answer_labels(value: str) -> list[str]:
    return [normalize_label(label) for label in re.findall(r"[A-EＡ-Ｅ]", value, re.I)]


def inline_sections(body: str):
    pattern = re.compile(r"(?m)^\s*([ABCKM])型选择题\s*[:：]?\s*$|^\s*是非题\s*[:：]?\s*$")
    matches = list(pattern.finditer(body))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        kind = match.group(1).upper() if match.group(1) else "J"
        yield kind, body[match.end() : end]


def parse_inline_standard(section: str, *, chapter: str, kind: str):
    matches = list(INLINE_ANSWER_RE.finditer(section))
    result = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(section)
        number = match.group(2)
        answer = inline_answer_labels(match.group(1))
        chunk = section[match.end() : end]
        if kind == "K":
            stem, options = split_statements(chunk)
            answer = {"A": list("ABC"), "B": list("AC"), "C": list("BD"), "D": ["D"], "E": list("ABCD")}.get(answer[0] if answer else "", [])
            options = ensure_options(options, "ABCD")
        else:
            stem, options = split_options(chunk)
            options = ensure_answer_options(options, answer)
        if len(stem) < 2 or len(options) < 2:
            continue
        labels = {option["label"] for option in options}
        answer = [label for label in answer if label in labels]
        multiple = kind in {"K", "M"}
        result.append({
            "id": stable_id("ent-junyi", chapter, kind, number, stem),
            "sourceNumber": number,
            "category": chapter,
            "stem": stem,
            "options": options,
            "answer": answer,
            "answerPending": not answer,
            "multiple": multiple,
            "questionType": "X" if multiple else "A",
            "medicalQuestionType": "X" if multiple else "A1",
            "explanation": "",
            "answerSource": "原书题号前括号标注" if answer else "",
        })
    return result


def option_pool(value: str) -> list[dict]:
    _, options = split_options(value)
    return options


def parse_inline_shared(section: str, *, chapter: str, kind: str):
    matches = list(INLINE_ANSWER_RE.finditer(section))
    if not matches:
        return []
    current_pool = option_pool(section[: matches[0].start()])
    pool_index = 1
    result = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(section)
        chunk = section[match.end() : end]
        markers = list(OPTION_RE.finditer(chunk))
        next_pool = []
        if any(normalize_label(marker.group(1)) == "A" for marker in markers):
            first_a = next(marker for marker in markers if normalize_label(marker.group(1)) == "A")
            stem = clean(chunk[: first_a.start()])
            next_pool = option_pool(chunk[first_a.start() :])
        else:
            stem = clean(chunk)
        number = match.group(2)
        answer = inline_answer_labels(match.group(1))
        question_options = ensure_answer_options(current_pool, answer)
        labels = {option["label"] for option in question_options}
        answer = [label for label in answer if label in labels]
        if len(stem) >= 2 and len(current_pool) >= 2:
            result.append({
                "id": stable_id("ent-junyi", chapter, kind, number, stem),
                "sourceNumber": number,
                "category": chapter,
                "stem": stem,
                "options": question_options,
                "answer": answer,
                "answerPending": not answer,
                "multiple": False,
                "questionType": "B" if kind == "B" else "C",
                "medicalQuestionType": "B1" if kind == "B" else "C",
                "sharedOptionGroup": f"{chapter}-{kind}-{pool_index}",
                "explanation": "",
                "answerSource": "原书题号前括号标注" if answer else "",
            })
        if next_pool:
            current_pool = next_pool
            pool_index += 1
    return result


def parse_judgement(section: str, chapter: str):
    matches = list(INLINE_ANSWER_RE.finditer(section))
    result = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(section)
        stem = clean(section[match.end() : end])
        marks = re.findall(r"[√×对错]", match.group(1))
        answer = ["A"] if marks and marks[0] in {"√", "对"} else ["B"] if marks else []
        if len(stem) < 2:
            continue
        result.append({
            "id": stable_id("ent-junyi", chapter, "J", match.group(2), stem),
            "sourceNumber": match.group(2),
            "category": chapter,
            "stem": stem,
            "options": [{"label": "A", "text": "正确"}, {"label": "B", "text": "错误"}],
            "answer": answer,
            "answerPending": not answer,
            "multiple": False,
            "explanation": "",
            "answerSource": "原书题号前括号标注" if answer else "",
        })
    return result


def parse_ent(pages: list[str]) -> list[dict]:
    # Skip the table of contents; the first exercise chapter begins on source page 12.
    text = "\n".join(pages[11:])
    questions = []
    for chapter, body in chapter_slices(text):
        for kind, section in inline_sections(body):
            if kind == "A":
                questions.extend(parse_inline_standard(section, chapter=chapter, kind=kind))
            elif kind in {"B", "C"}:
                questions.extend(parse_inline_shared(section, chapter=chapter, kind=kind))
            elif kind in {"K", "M"}:
                questions.extend(parse_inline_standard(section, chapter=chapter, kind=kind))
            else:
                questions.extend(parse_judgement(section, chapter))
    return questions


def package(profile: str, source: Path, questions: list[dict]) -> dict:
    chapters = Counter(question["category"] for question in questions)
    types = Counter(question.get("medicalQuestionType") or "判断" for question in questions)
    pending = sum(question["answerPending"] for question in questions)
    if profile == "ent-junyi":
        name = "耳鼻咽喉科学习题集（军医）· 客观题全量版"
        group = "耳鼻咽喉科学 · 军医"
        source_title = "《耳鼻咽喉科学习题集》"
        edition = "2003年1月第1版 · 配套《耳鼻咽喉科学》第五版"
        author = "叶青、赵舒薇、廖建春 主编"
        copyright_notice = "人民军医出版社出版；本整理仅供资料权利人个人学习，请勿未经授权传播。"
        rule = "答案取自原书每题题号前括号；K型组合已转换为对应陈述多选。"
    else:
        name = "皮肤性病学学习指导与习题集（第2版）· 客观题整理版"
        group = "皮肤性病学 · 人卫第2版"
        source_title = "《皮肤性病学学习指导与习题集》"
        edition = "第2版 · 当前文件第10—29章"
        author = ""
        copyright_notice = "人民卫生出版社资料；本整理仅供资料权利人个人学习，请勿未经授权传播。"
        rule = "答案只取各章参考答案，按章、题型和原题号一一关联。"
    description = "\n".join([
        f"来源：{source_title}（{edition}）。",
        f"共收录 {len(questions)} 道客观题；已关联答案 {len(questions) - pending} 道，待核对 {pending} 道。",
        f"整理规则：{rule} 无答案但题干和选项完整的题目仍保留，可在 Elapse 内后续纠错。",
        "章节与题量：" + "；".join(f"{chapter} {count} 道" for chapter, count in chapters.items()),
        "题型分布：" + "、".join(f"{kind} {count} 道" for kind, count in types.items()),
        "说明：题干、选项和答案来自提供的 MinerU Hybrid JSON；OCR 文字仍需对照原书抽查。",
    ])
    return {
        "format": "hongdou-question-bank",
        "version": 1,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "bank": {
            "name": name,
            "description": description,
            "sourceTitle": source_title,
            "edition": edition,
            "author": author,
            "copyrightNotice": copyright_notice,
            "groupName": group,
            "questions": questions,
        },
        "forgeReport": {
            "sourceFile": source.name,
            "includedQuestions": len(questions),
            "answeredQuestions": len(questions) - pending,
            "pendingAnswers": pending,
            "chapters": dict(chapters),
            "types": dict(types),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--profile", choices=("ent-junyi", "dermatology-renwei"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    payload = json.loads(args.input.read_text(encoding="utf-8-sig"))
    pages = mineru_pages(payload)
    questions = parse_ent(pages) if args.profile == "ent-junyi" else parse_dermatology(pages)
    result = package(args.profile, args.input, questions)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result["forgeReport"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
