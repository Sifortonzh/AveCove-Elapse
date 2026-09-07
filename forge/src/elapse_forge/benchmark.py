"""Ground-truth contract and observable statistics; not an invented accuracy report."""

from typing import Literal

from pydantic import Field

from .models import Document, Model, Option, Question, QuestionType, Source


class GoldQuestion(Model):
    annotation_id: (
        str  # Independent human identity, never derived from predicted question number.
    )
    scope: str
    source_question_number: str
    type: QuestionType
    stem: str
    options: list[Option]
    answer: list[str]
    explanation: str | None = None  # null = not annotated, NOT a negative label.
    curriculum_node: str | None = None
    question_source: list[Source] = Field(min_length=1)
    answer_source: list[Source] = Field(default_factory=list)
    explanation_source: list[Source] = Field(default_factory=list)


class GroundTruth(Model):
    schema_version: Literal[1] = 1
    source_sha256: str
    canonical_version: str
    reviewed_by: str
    coverage_pages: list[int]  # Only this human-reviewed range can be evaluated.
    complete_question_inventory: bool = False
    questions: list[GoldQuestion]


def observed(document: Document, questions: list[Question]) -> dict:
    return {
        "kind": "observations-not-accuracy",
        "pages": len(document.pages),
        "blocks": sum(len(p.blocks) for p in document.pages),
        "questions": len(questions),
        "with_answer": sum(bool(q.answer) for q in questions),
        "with_explanation": sum(bool(q.explanation) for q in questions),
        "confirmed": sum(q.review_status == "confirmed" for q in questions),
        "metrics": {
            name: None
            for name in [
                "question_detection",
                "question_number",
                "options",
                "answer_matching",
                "explanation_matching",
                "curriculum_mapping",
                "schema_accuracy",
            ]
        },
        "reason": "No independently annotated ground truth and alignment supplied",
    }
