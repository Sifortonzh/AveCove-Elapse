"""The sole mapping to the existing Elapse shared bank contract."""

from collections import defaultdict
from typing import Literal

from pydantic import Field

from .curriculum import node_path
from .models import Curriculum, Model, Option, Question, now, validate_json
from .validation import question_issues


class ElapseQuestion(Model):
    id: str
    sourceNumber: str
    category: str
    stem: str
    options: list[Option] = Field(min_length=2)
    answer: list[str]
    answerPending: bool
    multiple: bool
    explanation: str
    answerSource: str
    sharedOptionGroup: str | None = None


class ElapseBank(Model):
    name: str
    description: str = Field(max_length=4000)
    groupName: str
    questions: list[ElapseQuestion] = Field(min_length=1)


class ElapsePackage(Model):
    format: Literal["hongdou-question-bank"] = "hongdou-question-bank"
    version: Literal[1] = 1
    exportedAt: str
    bank: ElapseBank


def export_bank(
    questions: list[Question], tree: Curriculum, name: str
) -> tuple[dict, dict]:
    exported = []
    omitted = []
    chapters: dict[str, list[str]] = defaultdict(list)
    provenance = {}
    for q in questions:
        reasons = question_issues(q, tree)
        if q.review_status != "confirmed" or reasons or q.flags:
            omitted.append(
                {
                    "id": q.id,
                    "reasons": sorted(set(reasons + q.flags + [q.review_status])),
                }
            )
            continue
        category = node_path(tree, q.curriculum_node or "")
        chapters[category].append(q.source_question_number)
        exported.append(
            ElapseQuestion(
                id=q.id,
                sourceNumber=q.source_question_number,
                category=category,
                stem="\n\n".join(filter(None, [q.shared_stem, q.stem])),
                options=q.options,
                answer=q.answer,
                answerPending=not q.answer,
                multiple=q.type == "multiple",
                explanation=q.explanation,
                sharedOptionGroup=q.shared_option_group,
                answerSource="；".join(
                    f"{s.source_file} PDF第{s.source_page}页" for s in q.answer_source
                ),
            )
        )
        provenance[q.id] = q.model_dump(mode="json")
    notes = "\n".join(
        f"原题号 {'、'.join(numbers)} → {chapter}"
        for chapter, numbers in chapters.items()
    )
    if not exported:
        raise ValueError(
            "No confirmed compatible questions; complete Review before export"
        )
    if len(notes) > 4000:
        raise ValueError(
            "Chapter-to-question notes exceed Elapse 4000 characters; export smaller batches"
        )
    package = ElapsePackage(
        exportedAt=now(),
        bank=ElapseBank(
            name=name, description=notes, groupName=tree.title, questions=exported
        ),
    )
    value = package.model_dump(mode="json", exclude_none=True)
    validate_json(ElapsePackage, value)
    return value, {
        "format": "elapse-forge-provenance",
        "version": 1,
        "questions": provenance,
        "omitted": omitted,
        "chapter_notes": notes,
    }
