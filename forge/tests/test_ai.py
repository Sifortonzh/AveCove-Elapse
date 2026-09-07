import json

import httpx
import pytest

from elapse_forge.ai_parser import parse_with_ai
from elapse_forge.benchmark import observed
from elapse_forge.config import Settings
from elapse_forge.models import Document, ParseResult
from elapse_forge.ocr import normalize_mineru
from elapse_forge.parser import parse_document


@pytest.mark.parametrize(
    "bad",
    [
        "<html>gateway failure</html>",
        '{"choices":[]}',
        json.dumps(
            {"choices": [{"message": {"content": '{"questions": [], "extra": true}'}}]}
        ),
    ],
)
def test_invalid_ai_envelopes_get_bounded_repair_and_review(tmp_path, monkeypatch, bad):
    document = Document(
        id="test",
        metadata={"source_file": "test.pdf"},
        pages=[],
        provider="synthetic",
        raw_output_reference=[],
    )
    calls = []

    class Client:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def post(self, url, **kwargs):
            calls.append(kwargs)
            return httpx.Response(200, text=bad, request=httpx.Request("POST", url))

    monkeypatch.setattr("elapse_forge.ai_parser.httpx.Client", Client)
    parsed = parse_with_ai(
        document,
        Settings(
            data=tmp_path,
            ai_url="https://example.test/v1",
            ai_key="synthetic-test-key",
            ai_model="synthetic",
        ),
        tmp_path / "ai",
    )
    assert parsed.issues == ["schema_invalid: AI repair exhausted"]
    assert len(calls) == 2
    assert len(list((tmp_path / "ai").glob("attempt-*.txt"))) == 2
    assert observed(document, [])["metrics"]["answer_matching"] is None


def test_ai_cannot_invent_source_anchors(tmp_path, monkeypatch):
    p = normalize_mineru(
        [
            {
                "type": "text",
                "page_idx": 0,
                "bbox": [1, 1, 900, 900],
                "text": "A1型题\n1. Example\nA. First\nB. Second",
            }
        ],
        1,
        100,
        100,
    )
    doc = Document(
        id="test",
        metadata={"source_file": "test.pdf"},
        pages=[p],
        provider="synthetic",
        raw_output_reference=[],
    )
    result = parse_document(doc)
    assert result.questions
    result.questions[0].source[0].source_page = 99

    class Client:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def post(self, url, **kwargs):
            return httpx.Response(
                200,
                json={"choices": [{"message": {"content": result.model_dump_json()}}]},
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr("elapse_forge.ai_parser.httpx.Client", Client)
    output = parse_with_ai(
        doc,
        Settings(
            data=tmp_path,
            ai_url="https://example.test/v1",
            ai_key="test",
            ai_model="test",
        ),
        tmp_path,
    )
    assert isinstance(output, ParseResult) and not output.questions and output.issues
