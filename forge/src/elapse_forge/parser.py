"""Conservative document-wide rule baseline. AI extraction is a separate parser."""

import re
import uuid
from collections import defaultdict

from .models import Document, ParseResult, Question, QuestionType, RegistryEntry, Source

PARSER_VERSION = "rules-0.1"
TYPE_HEADINGS = {
    "A1": "A1",
    "A2": "A2",
    "A3": "A3",
    "A4": "A4",
    "B1": "B1",
    "A型": "single",
    "X型": "multiple",
    "单选": "single",
    "多选": "multiple",
    "判断": "judgement",
    "填空": "fill",
    "名词解释": "term",
    "简答": "short",
    "问答": "essay",
}


def parse_document(document: Document) -> ParseResult:
    result = ParseResult()
    scope = ""
    kind = QuestionType.UNKNOWN
    mode = "questions"
    current: Question | None = None
    entry: RegistryEntry | None = None
    option = None
    for page in sorted(document.pages, key=lambda p: p.page_number):
        for block in sorted(page.blocks, key=lambda b: b.reading_order):
            if block.type in ("header", "footer", "page_number", "image"):
                continue
            source = Source(
                source_file=str(document.metadata["source_file"]),
                source_page=page.page_number,
                block_id=block.id,
                bbox=block.bbox,
                ocr_text=block.text,
                ocr_provider=document.provider,
            )
            if block.type == "table":
                result.unparsed_blocks.append(block.id)
                result.issues.append(f"table_requires_parser:{block.id}")
                continue
            for raw in block.text.splitlines():
                line = raw.strip()
                if not line:
                    continue
                if re.match(r"^第[一二三四五六七八九十百\d]+章", line):
                    scope = line
                    kind = QuestionType.UNKNOWN
                    mode, current, entry, option = "questions", None, None, None
                    continue
                if re.fullmatch(
                    r"[【\[（(]?\s*(参考答案|答案与解析|参考答案与解析|答案|解析)\s*[】\]）)]?",
                    line,
                ):
                    mode = (
                        "explanations"
                        if line.strip("【】[]（）()") == "解析"
                        else "answers"
                    )
                    current, entry, option = None, None, None
                    continue
                heading = next(
                    (
                        v
                        for k, v in TYPE_HEADINGS.items()
                        if k in line and len(line) < 20 and re.search(r"题|型", line)
                    ),
                    None,
                )
                if heading:
                    kind = QuestionType(heading)
                    current, entry, option = None, None, None
                    continue
                if mode == "answers":
                    pairs = list(
                        re.finditer(
                            r"(?:^|\s)(\d+)\s*[.．、]\s*([A-G]+|[√×])(?=\s|$|[。；;])",
                            line,
                        )
                    )
                    if pairs:
                        for pair in pairs:
                            value = pair[2]
                            labels = (
                                ["A" if value == "√" else "B"]
                                if value in ("√", "×")
                                else list(value)
                            )
                            result.answers.append(
                                RegistryEntry(
                                    document_id=document.id,
                                    scope=scope,
                                    question_type=kind,
                                    source_question_number=pair[1],
                                    value=labels,
                                    source=[source],
                                )
                            )
                        entry = RegistryEntry(
                            document_id=document.id,
                            scope=scope,
                            question_type=kind,
                            source_question_number=pairs[-1][1],
                            value="",
                            source=[source],
                        )
                        result.explanations.append(entry)
                        tail = line[pairs[-1].end() :].strip()
                        if tail:
                            entry.value = tail
                        continue
                    if entry:
                        entry.value = str(entry.value) + "\n" + line
                        if source not in entry.source:
                            entry.source.append(source)
                    else:
                        result.unparsed_blocks.append(block.id)
                    continue
                number = re.match(r"^(\d+)\s*[.．、]\s*(.+)$", line)
                if mode == "explanations":
                    if number:
                        entry = RegistryEntry(
                            document_id=document.id,
                            scope=scope,
                            question_type=kind,
                            source_question_number=number[1],
                            value=number[2],
                            source=[source],
                        )
                        result.explanations.append(entry)
                    elif entry:
                        entry.value = str(entry.value) + "\n" + line
                        if source not in entry.source:
                            entry.source.append(source)
                    continue
                if number:
                    identity = f"{document.id}:{scope}:{kind}:{number[1]}:{block.id}:{len(result.questions)}"
                    current = Question(
                        id=uuid.uuid5(uuid.NAMESPACE_URL, identity).hex,
                        document_id=document.id,
                        source_question_number=number[1],
                        scope=scope,
                        type=kind,
                        stem=number[2],
                        source=[source],
                    )
                    result.questions.append(current)
                    option = None
                elif current:
                    choices = list(re.finditer(r"(?:^|\s)([A-G])[.．、]\s*", line))
                    if choices:
                        from .models import Option

                        for i, choice in enumerate(choices):
                            text = line[
                                choice.end() : choices[i + 1].start()
                                if i + 1 < len(choices)
                                else len(line)
                            ].strip()
                            if text:
                                option = Option(label=choice[1], text=text)
                                current.options.append(option)
                    elif option:
                        option.text += "\n" + line
                    else:
                        current.stem += "\n" + line
                    if source not in current.source:
                        current.source.append(source)
                else:
                    result.unparsed_blocks.append(block.id)
    result.explanations = [e for e in result.explanations if str(e.value).strip()]
    result.unparsed_blocks = sorted(set(result.unparsed_blocks))
    return result


def reconcile(result: ParseResult) -> ParseResult:
    """Never join by page adjacency or naked question number."""

    def key(item):
        return (
            item.document_id,
            item.scope,
            item.type if isinstance(item, Question) else item.question_type,
            item.source_question_number,
        )

    questions: dict[tuple, list[Question]] = defaultdict(list)
    for question in result.questions:
        questions[key(question)].append(question)
    for entries, field, source_field in [
        (result.answers, "answer", "answer_source"),
        (result.explanations, "explanation", "explanation_source"),
    ]:
        registry: dict[tuple, list[RegistryEntry]] = defaultdict(list)
        for item in entries:
            if (field == "answer" and not isinstance(item.value, list)) or (
                field == "explanation" and not isinstance(item.value, str)
            ):
                result.issues.append(f"{field}_schema_invalid:{key(item)}")
                continue
            registry[key(item)].append(item)
        for identity, candidates in registry.items():
            targets = questions.get(identity, [])
            unique = {
                str(sorted(e.value)) if isinstance(e.value, list) else e.value.strip()
                for e in candidates
            }
            if len(targets) != 1 or len(unique) != 1:
                result.issues.append(f"{field}_ambiguous:{identity}")
                for target in targets:
                    target.flags.append(
                        "answer_mismatch"
                        if field == "answer"
                        else "explanation_mismatch"
                    )
                continue
            target = targets[0]
            existing = getattr(target, field)
            incoming = candidates[0].value
            if existing and existing != incoming:
                target.flags.append(f"{field}_mismatch")
                continue
            setattr(target, field, incoming)
            setattr(target, source_field, [s for e in candidates for s in e.source])
    for group in questions.values():
        if len(group) > 1:
            for question in group:
                question.flags.append("duplicate_question_number")
    return result
