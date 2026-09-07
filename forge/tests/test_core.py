"""Synthetic contract tests. These do NOT measure real OCR accuracy."""

import copy
import json
import subprocess
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient
from jsonschema.exceptions import ValidationError

from elapse_forge.api import create_app
from elapse_forge.config import Settings
from elapse_forge.curriculum import match_curriculum, node_path
from elapse_forge.export import export_bank
from elapse_forge.jobs import Conflict, JobStore
from elapse_forge.models import (
    Box,
    Curriculum,
    Document,
    Question,
    validate_json,
)
from elapse_forge.normalizer import MedicalNormalizer
from elapse_forge.ocr import MinerUProvider, PaddleOCRProvider, normalize_mineru
from elapse_forge.parser import parse_document, reconcile
from elapse_forge.pipeline import run_job
from elapse_forge.storage import LocalStorage
from elapse_forge.validation import validate_questions

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def tree():
    return Curriculum.model_validate_json(
        (ROOT / "forge/curriculums/infectious-diseases.json").read_text()
    )


def page(number, text):
    return normalize_mineru(
        [{"type": "text", "page_idx": 0, "bbox": [100, 100, 900, 900], "text": text}],
        number,
        600,
        800,
    )


def document():
    return Document(
        id="synthetic",
        metadata={"source_file": "synthetic.pdf"},
        provider="synthetic-not-ocr",
        raw_output_reference=[],
        pages=[
            page(10, "第一章 总论\nA1型题\n1. 示例题干\nA. 甲"),
            page(11, "B. 乙"),
            page(80, "第一章 总论\n参考答案\nA1型题\n1.B"),
            page(90, "第一章 总论\n解析\nA1型题\n1. 原文件示例解析"),
        ],
    )


def confirmed(tree):
    q = reconcile(parse_document(document())).questions[0]
    q.course = tree.id
    q.curriculum_node = match_curriculum("总论", tree).node_id
    validate_questions([q], tree)
    assert q.review_status == "confirmed", q.flags
    return q


def test_cross_page_document_reconciliation(tree):
    q = confirmed(tree)
    assert len(q.options) == 2 and q.answer == ["B"]
    assert [s.source_page for s in q.source] == [10, 11]
    assert q.answer_source[0].source_page == 80
    assert q.explanation_source[0].source_page == 90
    assert q.explanation == "原文件示例解析"


def test_duplicate_and_scope_do_not_guess():
    result = parse_document(document())
    result.questions.append(result.questions[0].model_copy(deep=True))
    reconcile(result)
    assert all(
        not q.answer and "duplicate_question_number" in q.flags
        for q in result.questions
    )
    result = parse_document(document())
    result.answers[0].scope = "第二章 不同章节"
    reconcile(result)
    assert not result.questions[0].answer


def test_conflicting_answers_and_invalid_registry():
    result = parse_document(document())
    result.answers.append(result.answers[0].model_copy(update={"value": ["A"]}))
    reconcile(result)
    assert "answer_mismatch" in result.questions[0].flags
    assert not result.questions[0].answer
    result = parse_document(document())
    result.answers[0].value = "A"
    reconcile(result)
    assert not result.questions[0].answer
    assert any("schema_invalid" in issue for issue in result.issues)


def test_provider_adapter_preserves_only_real_confidence():
    p = page(3, "HBsAg")
    assert p.blocks[0].confidence is None
    assert p.blocks[0].bbox.x0 == 0.1
    with pytest.raises(ValueError):
        normalize_mineru([{"page_idx": 3}], 3, 10, 10)
    with pytest.raises(ValueError):
        Box(x0=0.9, x1=0.1, y0=0, y1=1)
    with pytest.raises(NotImplementedError):
        PaddleOCRProvider().recognize(None, None, 1, 1, 1)


def test_schema_and_normalization(tree):
    q = confirmed(tree).model_dump(mode="json")
    q["unknown_ai_field"] = True
    with pytest.raises(ValidationError):
        validate_json(Question, q)
    text = "HBsAg HBeAg IgG IgM FSH LH hCG WBC RBC PLT PaO2 PaCO2 mmol/L μmol/L 10^9/L"
    changes = MedicalNormalizer().normalize(text)
    assert all(c.normalized_text == c.original_text for c in changes)
    changes = MedicalNormalizer().normalize("ＨＢｓＡｇ １Ｏ")
    assert changes and all(c.confidence is None for c in changes)


def test_curriculum_tree_and_mapping(tree):
    assert len(tree.nodes) == 141
    assert match_curriculum("第三章 病毒性疾病", tree).method == "normalized"
    node = next(n for n in tree.nodes if n.title == "日本血吸虫病")
    assert node.metadata["source_page"] == 4
    assert "蠕虫病" in node_path(tree, node.id)
    fuzzy = match_curriculum("病堵性肝炎", tree)
    assert fuzzy.node_id is None
    derm = Curriculum.model_validate_json(
        (ROOT / "forge/curriculums/dermatology.json").read_text()
    )
    assert len(derm.nodes) == 160
    assert sum(n.node_type == "part" for n in derm.nodes) == 2
    bad = tree.model_copy(deep=True)
    bad.nodes[0].parent_id = bad.nodes[0].id
    with pytest.raises(ValueError):
        Curriculum.model_validate(bad.model_dump())


def test_export_with_actual_elapse_importer(tree):
    q = confirmed(tree)
    package, sidecar = export_bank([q], tree, "Forge synthetic contract")
    assert "原题号 1" in package["bank"]["description"]
    assert sidecar["questions"][q.id]["source"][0]["source_page"] == 10
    result = subprocess.run(
        ["node", "forge/tests/elapse-import.mjs"],
        cwd=ROOT,
        input=json.dumps(package),
        text=True,
        capture_output=True,
        check=True,
    )
    assert "contract passed" in result.stdout
    q.answer = []
    with pytest.raises(ValueError):
        export_bank([q], tree, "incomplete")


def test_store_rejects_stale_leases_and_revisions(tmp_path):
    store = JobStore(f"sqlite:///{tmp_path}/queue.sqlite")
    store.initialize()
    row = store.create({"source_name": "test"})
    claimed = store.claim()
    assert store.claim() is None
    with pytest.raises(Conflict):
        store.checkpoint(row["id"], "wrong-lease", "failed", {})
    store.checkpoint(row["id"], claimed["lease"], "review_required", claimed["payload"])
    current = store.get(row["id"])
    store.review(row["id"], current["revision"], current["payload"], {"action": "test"})
    with pytest.raises(Conflict):
        store.review(row["id"], current["revision"], current["payload"], {})
    assert len(store.events(row["id"])) == 1


def test_failed_page_resume_does_not_reocr_completed_pages(tmp_path):
    settings = Settings(data=tmp_path)
    store = JobStore(settings.database_url)
    store.initialize()
    with pymupdf.open() as pdf:
        pdf.new_page()
        pdf.new_page()
        pdf.save(tmp_path / "input.pdf")
    row = store.create(
        {
            "source_name": "synthetic.pdf",
            "source_key": "input.pdf",
            "sha256": "synthetic",
        }
    )

    class SyntheticProvider:
        name = "synthetic-test-provider"

        def __init__(self):
            self.calls = []
            self.fail = True

        def recognize(self, pdf, output, number, width, height):
            self.calls.append(number)
            if number == 2 and self.fail:
                raise RuntimeError("Synthetic failure")
            return page(number, "unparsed example"), []

    provider = SyntheticProvider()
    run_job(store, settings, store.claim(), provider)
    failed = store.get(row["id"])
    assert failed["state"] == "failed"
    assert list(failed["payload"]["checkpoints"]) == ["1"]
    child = store.create(copy.deepcopy(failed["payload"]))
    provider.fail = False
    run_job(store, settings, store.claim(), provider)
    assert provider.calls == [1, 2, 2]
    assert store.get(child["id"])["state"] == "review_required"
    with pytest.raises(ValueError):
        LocalStorage(tmp_path).get("../outside")


def test_api_auth_upload_review_export(tmp_path, tree):
    settings = Settings(
        data=tmp_path,
        token="synthetic-test-token",
        curriculum_dir=ROOT / "forge/curriculums",
    )
    app = create_app(settings)
    with TestClient(app) as client:
        assert client.get("/jobs").status_code == 401
        client.headers["Authorization"] = "Bearer synthetic-test-token"
        assert (
            client.post("/jobs", files={"file": ("bad.pdf", b"not pdf")}).status_code
            == 422
        )
        with pymupdf.open() as pdf:
            pdf.new_page()
            data = pdf.tobytes()
        response = client.post(
            "/jobs", files={"file": ("safe.pdf", data)}, data={"course_id": tree.id}
        )
        assert response.status_code == 202
        row = response.json()
        claimed = app.state.store.claim()
        q = confirmed(tree)
        payload = {**claimed["payload"], "questions": [q.model_dump(mode="json")]}
        app.state.store.checkpoint(
            row["id"], claimed["lease"], "review_required", payload
        )
        current = client.get("/jobs/" + row["id"]).json()
        edited = q.model_dump(mode="json")
        edited["stem"] = "Human correction"
        body = {
            "action": "edit",
            "expected_revision": current["revision"],
            "question_id": q.id,
            "question": edited,
        }
        updated = client.post(f"/jobs/{row['id']}/review", json=body)
        assert updated.status_code == 200
        assert client.post(f"/jobs/{row['id']}/review", json=body).status_code == 409
        accepted = client.post(
            f"/jobs/{row['id']}/review",
            json={
                "action": "accept",
                "question_id": q.id,
                "expected_revision": updated.json()["revision"],
            },
        )
        assert accepted.status_code == 200
        assert client.get(f"/jobs/{row['id']}/export").status_code == 200
        assert (
            client.get(f"/jobs/{row['id']}/pages/1").headers["content-type"]
            == "image/png"
        )
        assert len(client.get(f"/jobs/{row['id']}/history").json()) == 2
        current = client.get(f"/jobs/{row['id']}").json()
        retry_body = {
            "action": "retry_ocr",
            "page_number": 1,
            "expected_revision": current["revision"],
        }
        child = client.post(f"/jobs/{row['id']}/review", json=retry_body)
        assert child.status_code == 200
        assert child.json()["payload"]["parent_job_id"] == row["id"]
        assert (
            client.post(f"/jobs/{row['id']}/review", json=retry_body).status_code == 409
        )
        assert len(client.get(f"/jobs/{row['id']}/history").json()) == 3


@pytest.mark.parametrize(
    "confidence,expected",
    [(None, "ocr_confidence_unverified"), (0.3, "ocr_issue"), (0.99, None)],
)
def test_pipeline_never_calls_unknown_confidence_high(
    tmp_path, tree, confidence, expected
):
    settings = Settings(data=tmp_path, curriculum_dir=ROOT / "forge/curriculums")
    store = JobStore(settings.database_url)
    store.initialize()
    with pymupdf.open() as pdf:
        pdf.new_page()
        pdf.save(tmp_path / "input.pdf")
    row = store.create(
        {
            "source_name": "synthetic.pdf",
            "source_key": "input.pdf",
            "sha256": "synthetic",
            "course_id": tree.id,
        }
    )

    class SyntheticProvider:
        name = "synthetic-not-real-ocr"

        def recognize(self, pdf, output, number, width, height):
            normalized = page(
                1, "第一章 总论\nA1型题\n1. Example\nA. First\nB. Second\n参考答案\n1.B"
            )
            normalized.blocks[0].confidence = confidence
            return normalized, []

    run_job(store, settings, store.claim(), SyntheticProvider())
    current = store.get(row["id"])
    q = current["payload"]["questions"][0]
    if expected:
        assert expected in q["flags"] and q["review_status"] == "needs_review"
    else:
        assert q["review_status"] == "confirmed"


def test_missing_mineru_is_explicit(tmp_path):
    result = MinerUProvider(
        Settings(data=tmp_path, mineru_command="nonexistent-synthetic-mineru")
    ).preflight()
    assert result["ready"] is False
