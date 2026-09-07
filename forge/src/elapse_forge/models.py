from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Box(Model):
    """Coordinates in [0,1], relative to the displayed (rotated) original page."""

    x0: float = Field(ge=0, le=1)
    y0: float = Field(ge=0, le=1)
    x1: float = Field(ge=0, le=1)
    y1: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def ordered(self):
        if self.x1 < self.x0 or self.y1 < self.y0:
            raise ValueError("Reversed bbox")
        return self


class Source(Model):
    source_file: str
    source_page: int = Field(ge=1)
    block_id: str
    bbox: Box | None = None
    ocr_text: str
    ocr_provider: str


class Block(Model):
    id: str
    type: str
    text: str
    bbox: Box | None = None
    reading_order: int = Field(ge=0)
    confidence: float | None = Field(default=None, ge=0, le=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Page(Model):
    page_number: int = Field(ge=1)
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    blocks: list[Block]
    rotation: int = 0
    preprocessing: list[str] = Field(default_factory=list)


class Document(Model):
    schema_version: Literal[1] = 1
    id: str
    metadata: dict[str, Any]
    pages: list[Page]
    provider: str
    raw_output_reference: list[str]

    @model_validator(mode="after")
    def unique_pages(self):
        numbers = [p.page_number for p in self.pages]
        ids = [b.id for p in self.pages for b in p.blocks]
        if len(set(numbers)) != len(numbers) or len(set(ids)) != len(ids):
            raise ValueError("Duplicate page or block identity")
        return self


class QuestionType(StrEnum):
    A1 = "A1"
    A2 = "A2"
    A3 = "A3"
    A4 = "A4"
    B1 = "B1"
    C = "C"
    SINGLE = "single"
    MULTIPLE = "multiple"
    JUDGEMENT = "judgement"
    FILL = "fill"
    TERM = "term"
    SHORT = "short"
    ESSAY = "essay"
    UNKNOWN = "unknown"


class Option(Model):
    label: str = Field(pattern=r"^[A-Z]$")
    text: str = Field(min_length=1)


class Question(Model):
    id: str
    document_id: str
    source_question_number: str = Field(min_length=1)
    scope: str = ""  # Source chapter identity, NOT canonical curriculum.
    type: QuestionType = QuestionType.UNKNOWN
    stem: str
    options: list[Option] = Field(default_factory=list)
    answer: list[str] = Field(default_factory=list)
    explanation: str = ""
    shared_stem: str = ""
    shared_stem_group: str | None = None
    shared_option_group: str | None = None
    course: str | None = None
    curriculum_node: str | None = None
    source: list[Source] = Field(min_length=1)
    answer_source: list[Source] = Field(default_factory=list)
    explanation_source: list[Source] = Field(default_factory=list)
    confidence: float | None = Field(default=None, ge=0, le=1)
    review_status: Literal["needs_review", "confirmed", "rejected", "uncertain"] = (
        "needs_review"
    )
    flags: list[str] = Field(default_factory=list)
    parser_version: str = "rules-0.1"
    model_version: str | None = None


class RegistryEntry(Model):
    document_id: str
    scope: str = ""
    question_type: QuestionType = QuestionType.UNKNOWN
    source_question_number: str
    value: list[str] | str
    source: list[Source] = Field(min_length=1)


class ParseResult(Model):
    questions: list[Question] = Field(default_factory=list)
    answers: list[RegistryEntry] = Field(default_factory=list)
    explanations: list[RegistryEntry] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)
    unparsed_blocks: list[str] = Field(default_factory=list)


class CurriculumNode(Model):
    id: str
    course_id: str
    parent_id: str | None
    node_type: str  # Open vocabulary; depth is never constrained.
    title: str
    normalized_title: str
    order: int = Field(ge=0)
    aliases: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Curriculum(Model):
    id: str
    title: str
    version: str
    source_file: str
    source_sha256: str
    nodes: list[CurriculumNode]

    @model_validator(mode="after")
    def tree(self):
        nodes = {n.id: n for n in self.nodes}
        if len(nodes) != len(self.nodes):
            raise ValueError("Duplicate curriculum id")
        for node in self.nodes:
            seen: set[str] = set()
            cursor: CurriculumNode | None = node
            while cursor:
                if cursor.id in seen or cursor.course_id != self.id:
                    raise ValueError("Cycle or cross-course parent")
                seen.add(cursor.id)
                if cursor.parent_id and cursor.parent_id not in nodes:
                    raise ValueError("Missing curriculum parent")
                cursor = nodes.get(cursor.parent_id or "")
        return self


class JobState(StrEnum):
    UPLOADED = "uploaded"
    QUEUED = "queued"
    PREPROCESSING = "preprocessing"
    OCR = "ocr"
    PARSING = "parsing"
    RECONCILING = "reconciling"
    MAPPING = "curriculum_mapping"
    VALIDATING = "validating"
    REVIEW = "review_required"
    COMPLETED = "completed"
    FAILED = "failed"


class ReviewAction(Model):
    action: Literal[
        "accept", "edit", "reject", "mark_uncertain", "retry_parser", "retry_ocr"
    ]
    expected_revision: int = Field(ge=0)
    question_id: str | None = None
    question: Question | None = None
    page_number: int | None = Field(default=None, ge=1)
    reason: str = ""


def validate_json(model: type[Model], value: Any) -> Model:
    """Both checks deliberately precede persistence of parser output."""
    from jsonschema import Draft202012Validator

    Draft202012Validator(model.model_json_schema()).validate(value)
    return model.model_validate(value)
