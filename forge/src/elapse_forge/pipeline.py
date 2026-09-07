import hashlib
import json
import threading
import uuid

import pymupdf

from .ai_parser import parse_with_ai
from .config import Settings
from .curriculum import match_curriculum
from .jobs import Conflict, JobStore
from .models import Curriculum, Document, Page
from .normalizer import MedicalNormalizer
from .ocr import OCRProvider, provider_from
from .parser import parse_document, reconcile
from .storage import LocalStorage
from .validation import validate_questions


def load_curriculum(settings: Settings, course_id: str | None) -> Curriculum | None:
    if not course_id:
        return None
    for file in settings.curriculum_dir.glob("*.json"):
        curriculum = Curriculum.model_validate_json(file.read_text())
        if curriculum.id == course_id:
            return curriculum
    raise ValueError("Unknown canonical curriculum")


def run_job(
    store: JobStore, settings: Settings, row: dict, provider: OCRProvider | None = None
):
    artifacts = LocalStorage(settings.data)
    payload, lease, job_id = row["payload"], row["lease"], row["id"]
    attempt = uuid.uuid4().hex
    base = f"jobs/{job_id}/attempts/{attempt}"
    stop = threading.Event()
    lost = threading.Event()

    def beat():
        while not stop.wait(15):
            try:
                store.heartbeat(job_id, lease)
            except Exception:
                lost.set()
                return

    thread = threading.Thread(target=beat, daemon=True)
    thread.start()

    def save(state):
        if lost.is_set():
            raise Conflict("Worker lease lost")
        store.checkpoint(job_id, lease, state, payload)

    try:
        save("preprocessing")
        tree = load_curriculum(settings, payload.get("course_id"))
        source = artifacts.path(payload["source_key"])
        imported_document_key = payload.get("imported_document_key")
        if imported_document_key:
            imported = Document.model_validate_json(
                artifacts.get(imported_document_key)
            )
            if imported.id != payload["sha256"]:
                raise ValueError(
                    "Imported MinerU result does not match source identity"
                )
            if len(imported.pages) != payload.get("page_count"):
                raise ValueError("Imported MinerU result page count changed")
            pages = imported.pages
            raw_refs = imported.raw_output_reference
            payload["pages_done"] = len(pages)
            payload["ocr_signature"] = hashlib.sha256(
                json.dumps(
                    [payload["sha256"], imported_document_key, "mineru-hybrid-v1"]
                ).encode()
            ).hexdigest()
            provider_name = "mineru-cloud-hybrid"
        else:
            provider = provider or provider_from(settings)
            provider_name = provider.name
        # Invalidate checkpoints if provider/mode/backend/parser input changes.
        if not imported_document_key:
            signature = hashlib.sha256(
                json.dumps(
                    [
                        payload["sha256"],
                        provider_name,
                        settings.mineru_mode,
                        settings.mineru_command,
                        settings.mineru_api_url,
                        settings.mineru_image,
                        settings.mineru_backend,
                        "preprocess-identity-v1",
                    ]
                ).encode()
            ).hexdigest()
            if payload.get("ocr_signature") != signature:
                payload["checkpoints"] = {}
            payload["ocr_signature"] = signature
            pages, raw_refs = [], []
            with pymupdf.open(source) as pdf:
                payload["page_count"] = len(pdf)
                if len(pdf) > settings.max_pages:
                    raise ValueError("PDF exceeds configured page limit")
                for index, original in enumerate(pdf):
                    page_number = index + 1
                    checkpoint = payload["checkpoints"].get(str(page_number))
                    if checkpoint:
                        pages.append(
                            Page.model_validate_json(
                                artifacts.get(checkpoint["page_key"])
                            )
                        )
                        raw_refs.extend(checkpoint["raw_keys"])
                        continue
                    save("ocr")
                    page_key = f"{base}/pages/{page_number}"
                    input_path = artifacts.path(f"{page_key}/input/page.pdf")
                    input_path.parent.mkdir(parents=True, exist_ok=True)
                    # Preserve PDF rotation/geometry and all columns, never auto-crop content.
                    with pymupdf.open() as single:
                        single.insert_pdf(pdf, from_page=index, to_page=index)
                        single.save(input_path)
                    output = artifacts.path(f"{page_key}/raw")
                    assert provider is not None
                    page, files = provider.recognize(
                        input_path,
                        output,
                        page_number,
                        original.rect.width,
                        original.rect.height,
                    )
                    page.rotation = original.rotation
                    page.preprocessing = [
                        "identity: original displayed coordinates retained"
                    ]
                    raw_keys = [
                        str(p.resolve().relative_to(settings.data)) for p in files
                    ]
                    normalized = artifacts.json(
                        f"{page_key}/normalized.json", page.model_dump(mode="json")
                    )
                    payload["checkpoints"][str(page_number)] = {
                        "page_key": normalized,
                        "raw_keys": raw_keys,
                    }
                    payload["pages_done"] = len(payload["checkpoints"])
                    pages.append(page)
                    raw_refs.extend(raw_keys)
                    save("ocr")
        document = Document(
            id=payload["sha256"],
            metadata={
                "source_file": payload["source_name"],
                "sha256": payload["sha256"],
                "coordinate_system": "normalized-displayed-original-page",
            },
            pages=pages,
            provider=provider_name,
            raw_output_reference=raw_refs,
        )
        payload["document_key"] = artifacts.json(
            f"{base}/document.json", document.model_dump(mode="json")
        )
        changes = {
            b.id: [
                c.model_dump(mode="json") for c in MedicalNormalizer().normalize(b.text)
            ]
            for p in pages
            for b in p.blocks
        }
        artifacts.json(f"{base}/normalization-proposals.json", changes)
        save("parsing")
        if settings.parser == "ai":
            # Phase 1 bound: do not send an entire book to one model request.
            if len(pages) > 3:
                raise ValueError(
                    "AI parser phase 1 supports up to 3 pages; document-window planning is next-phase work"
                )
            parsed = parse_with_ai(document, settings, artifacts.path(f"{base}/ai"))
        else:
            parsed = parse_document(document)
        artifacts.json(f"{base}/parsed.json", parsed.model_dump(mode="json"))
        save("reconciling")
        parsed = reconcile(parsed)
        payload["registries_key"] = artifacts.json(
            f"{base}/registries.json", parsed.model_dump(mode="json")
        )
        save("curriculum_mapping")
        source_confidence = {b.id: b.confidence for p in pages for b in p.blocks}
        for q in parsed.questions:
            if tree:
                match = match_curriculum(q.scope, tree)
                q.course, q.curriculum_node = tree.id, match.node_id
            if any(changes.get(s.block_id) for s in q.source):
                q.flags.append("normalization_review")
            evidence = [*q.source, *q.answer_source, *q.explanation_source]
            if any(source_confidence.get(s.block_id) is None for s in evidence):
                q.flags.append("ocr_confidence_unverified")
            if any(
                (confidence := source_confidence.get(s.block_id)) is not None
                and confidence < 0.9
                for s in evidence
            ):
                q.flags.append("ocr_issue")
        save("validating")
        validate_questions(parsed.questions, tree)
        payload["questions"] = [q.model_dump(mode="json") for q in parsed.questions]
        payload["issues"] = parsed.issues + (
            ["unparsed_blocks_present"] if parsed.unparsed_blocks else []
        )
        payload["unparsed_blocks"] = parsed.unparsed_blocks
        payload.pop("error", None)
        needs_review = (
            not parsed.questions
            or payload["issues"]
            or any(q.flags for q in parsed.questions)
        )
        save("review_required" if needs_review else "completed")
    except Conflict:
        raise
    except Exception as error:
        # Keep private raw logs on disk; don't echo endpoint tokens/HTTP request URLs to users.
        payload["error"] = {
            "type": type(error).__name__,
            "message": str(error)
            if isinstance(error, (ValueError, RuntimeError, NotImplementedError))
            else "Processing failed; inspect local worker logs",
        }
        payload["failed_attempt"] = base
        save("failed")
    finally:
        stop.set()
        thread.join(timeout=2)
