from .models import Curriculum, Question

OBJECTIVE = {"A1", "A2", "A3", "A4", "B1", "C", "single", "multiple", "judgement"}


def question_issues(q: Question, tree: Curriculum | None) -> list[str]:
    issues = []
    if not q.stem.strip():
        issues.append("missing_stem")
    if q.type not in OBJECTIVE:
        issues.append("unsupported_export_type")
    labels = [o.label for o in q.options]
    if len(labels) < 2 or len(labels) != len(set(labels)):
        issues.append("missing_options")
    if not q.answer:
        issues.append("missing_answer")
    elif not set(q.answer) <= set(labels):
        issues.append("answer_mismatch")
    if q.type != "multiple" and len(q.answer) > 1:
        issues.append("answer_mismatch")
    if q.answer and not q.answer_source and q.review_status != "confirmed":
        issues.append("answer_evidence_missing")
    if (
        not tree
        or q.curriculum_node not in {n.id for n in tree.nodes}
        or q.course != tree.id
    ):
        issues.append("curriculum_uncertain")
    if any(s.bbox is None for s in q.source):
        issues.append("ocr_issue")
    if q.type in ("A3", "A4") and not q.shared_stem:
        issues.append("missing_shared_stem")
    if q.type == "B1" and not q.shared_option_group:
        issues.append("missing_shared_options")
    return sorted(set(issues))


def validate_questions(questions: list[Question], tree: Curriculum | None):
    for q in questions:
        q.flags = sorted(set(q.flags + question_issues(q, tree)))
        q.review_status = "needs_review" if q.flags else "confirmed"
    return questions
