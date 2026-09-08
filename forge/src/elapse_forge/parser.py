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
    "C": "C",
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


def _question_type_heading(line: str) -> tuple[QuestionType, str] | None:
    match = re.match(
        r"^[【\[]?\s*(A[1-4]?型题|B1?型题|C型题|X型题|单选题|多选题|判断题|填空题|名词解释|简答题|问答题)\s*[】\]]?\s*(.*)$",
        line,
        re.IGNORECASE,
    )
    if not match:
        return None
    heading, remainder = match.groups()
    key = next((key for key in TYPE_HEADINGS if key in heading), None)
    return (QuestionType(TYPE_HEADINGS[key]), remainder) if key else None


def _table_answers(block, source, document, scope, default_kind, result):
    rows = block.metadata.get("table_rows")
    if not isinstance(rows, list):
        return None
    column_kinds: dict[int, QuestionType] = {}
    occupied: dict[int, int] = {}
    found = False
    first_kind: QuestionType | None = None
    for row in rows:
        if not isinstance(row, list):
            continue
        column = 0
        for cell in row:
            while occupied.get(column, 0) > 0:
                column += 1
            if not isinstance(cell, dict):
                continue
            text = str(cell.get("text", "")).strip()
            colspan = max(1, int(cell.get("colspan", 1)))
            rowspan = max(1, int(cell.get("rowspan", 1)))
            heading = next(
                (
                    QuestionType(value)
                    for key, value in TYPE_HEADINGS.items()
                    if key in text and re.search(r"题|型", text)
                ),
                None,
            )
            if heading:
                first_kind = first_kind or heading
                for offset in range(colspan):
                    column_kinds[column + offset] = heading
            else:
                kind = column_kinds.get(column, default_kind)
                for pair in re.finditer(
                    r"(?:^|\s)(\d+)\s*[.．、]\s*([A-G]+|[√×])(?=\s|$|[。；;])",
                    text,
                ):
                    value = pair[2]
                    result.answers.append(
                        RegistryEntry(
                            document_id=document.id,
                            scope=scope,
                            question_type=kind,
                            source_question_number=pair[1],
                            value=(
                                ["A" if value == "√" else "B"]
                                if value in ("√", "×")
                                else list(value)
                            ),
                            source=[source],
                        )
                    )
                    found = True
            if rowspan > 1:
                for offset in range(colspan):
                    occupied[column + offset] = rowspan
            column += colspan
        occupied = {key: value - 1 for key, value in occupied.items() if value > 1}
    return first_kind if found else None


def parse_document(document: Document) -> ParseResult:
    result = ParseResult()
    chapter = ""
    scope = ""
    kind = QuestionType.UNKNOWN
    mode = "ignore"
    current: Question | None = None
    entry: RegistryEntry | None = None
    option = None
    shared_mode: str | None = None
    shared_group = ""
    shared_buffer: list[str] = []
    shared_options = []
    shared_question_count = 0

    def clear_shared():
        nonlocal \
            shared_mode, \
            shared_group, \
            shared_buffer, \
            shared_options, \
            shared_question_count
        shared_mode = None
        shared_group = ""
        shared_buffer = []
        shared_options = []
        shared_question_count = 0

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
                table_kind = _table_answers(
                    block, source, document, scope, kind, result
                )
                if table_kind:
                    kind = table_kind
                    mode, current, entry, option = "answers", None, None, None
                else:
                    result.unparsed_blocks.append(block.id)
                    result.issues.append(f"table_requires_review:{block.id}")
                continue
            for raw in block.text.splitlines():
                line = raw.strip()
                if not line:
                    continue
                if line == "总论":
                    clear_shared()
                    chapter = scope = line
                    kind = QuestionType.UNKNOWN
                    mode, current, entry, option = "ignore", None, None, None
                    continue
                if re.match(r"^第[一二三四五六七八九十百\d]+章", line):
                    clear_shared()
                    chapter = scope = line
                    kind = QuestionType.UNKNOWN
                    mode, current, entry, option = "ignore", None, None, None
                    continue
                if re.match(r"^第[一二三四五六七八九十百\d]+节", line):
                    clear_shared()
                    scope = f"{chapter} / {line}" if chapter else line
                    kind = QuestionType.UNKNOWN
                    mode, current, entry, option = "ignore", None, None, None
                    continue
                if re.fullmatch(r"[【\[]?\s*练习题\s*[】\]]?", line):
                    mode, current, entry, option = "ignore", None, None, None
                    continue
                if re.fullmatch(
                    r"[【\[（(]?\s*(参考答案|答案与解析|参考答案与解析|答案|解析)\s*[】\]）)]?",
                    line,
                ):
                    clear_shared()
                    mode = (
                        "explanations"
                        if line.strip("【】[]（）()") == "解析"
                        else "answers"
                    )
                    current, entry, option = None, None, None
                    continue
                heading = _question_type_heading(line)
                if heading:
                    kind, line = heading
                    if mode not in ("answers", "explanations"):
                        mode = "questions"
                    current, entry, option = None, None, None
                    clear_shared()
                    if kind == QuestionType.A4:
                        shared_mode = "stem"
                        shared_group = (
                            f"{document.id}:{scope}:A4:auto:{len(result.questions)}"
                        )
                    if not line:
                        continue
                shared_heading = re.fullmatch(
                    r"[（(]\s*(\d+)\s*[~～—–至-]\s*(\d+)\s*题共用(题干|备选答案)\s*[）)]",
                    line,
                )
                if shared_heading and mode == "questions":
                    start, end, shared_label = shared_heading.groups()
                    shared_mode = "stem" if shared_label == "题干" else "options"
                    shared_group = f"{document.id}:{scope}:{kind}:{start}-{end}"
                    shared_buffer = []
                    shared_options = []
                    shared_question_count = 0
                    current, option = None, None
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
                if mode == "ignore":
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
                    body = number[2]
                    choices = list(
                        re.finditer(r"(?:^|(?<=[\s:：]))([A-G])[.．、]\s*", body)
                    )
                    stem = body[: choices[0].start()].strip() if choices else body
                    identity = f"{document.id}:{scope}:{kind}:{number[1]}:{block.id}:{len(result.questions)}"
                    current = Question(
                        id=uuid.uuid5(uuid.NAMESPACE_URL, identity).hex,
                        document_id=document.id,
                        source_question_number=number[1],
                        scope=scope,
                        type=kind,
                        stem=stem,
                        shared_stem="\n".join(shared_buffer).strip()
                        if shared_mode == "stem"
                        else "",
                        shared_stem_group=shared_group
                        if shared_mode == "stem"
                        else None,
                        shared_option_group=shared_group
                        if shared_mode == "options"
                        else None,
                        source=[source],
                    )
                    if shared_mode == "options" and shared_options:
                        current.options = [
                            item.model_copy(deep=True) for item in shared_options
                        ]
                    shared_question_count += 1
                    result.questions.append(current)
                    option = None
                    if choices and not current.options:
                        from .models import Option

                        for i, choice in enumerate(choices):
                            text = body[
                                choice.end() : choices[i + 1].start()
                                if i + 1 < len(choices)
                                else len(body)
                            ].strip()
                            if text:
                                option = Option(label=choice[1], text=text)
                                current.options.append(option)
                elif shared_mode == "options" and shared_question_count == 0:
                    choices = list(
                        re.finditer(r"(?:^|(?<=[\s:：]))([A-G])[.．、]\s*", line)
                    )
                    if choices:
                        from .models import Option

                        for i, choice in enumerate(choices):
                            text = line[
                                choice.end() : choices[i + 1].start()
                                if i + 1 < len(choices)
                                else len(line)
                            ].strip()
                            if text:
                                shared_options.append(
                                    Option(label=choice[1], text=text)
                                )
                    elif shared_options:
                        shared_options[-1].text += "\n" + line
                    else:
                        result.unparsed_blocks.append(block.id)
                elif shared_mode == "stem" and shared_question_count == 0:
                    shared_buffer.append(line)
                elif current:
                    choices = list(
                        re.finditer(r"(?:^|(?<=[\s:：]))([A-G])[.．、]\s*", line)
                    )
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
        loose_questions: dict[tuple, list[Question]] = defaultdict(list)
        document_questions: dict[tuple, list[Question]] = defaultdict(list)
        for question in result.questions:
            loose_questions[
                (
                    question.document_id,
                    question.scope,
                    question.source_question_number,
                )
            ].append(question)
            document_questions[
                (
                    question.document_id,
                    question.type,
                    question.source_question_number,
                )
            ].append(question)
        for identity, candidates in registry.items():
            targets = questions.get(identity, [])
            if field == "answer" and not targets:
                loose_identity = (identity[0], identity[1], identity[3])
                loose_targets = loose_questions.get(loose_identity, [])
                incoming_types = {item.question_type for item in candidates}
                if len(loose_targets) == 1 and len(incoming_types) == 1:
                    target = loose_targets[0]
                    target.type = next(iter(incoming_types))
                    target.flags.append("question_type_from_answer_section")
                    targets = [target]
                elif len(incoming_types) == 1 and not identity[1]:
                    document_targets = document_questions.get(
                        (identity[0], next(iter(incoming_types)), identity[3]), []
                    )
                    if len(document_targets) == 1:
                        target = document_targets[0]
                        target.flags.append("answer_matched_from_global_registry")
                        targets = [target]
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
