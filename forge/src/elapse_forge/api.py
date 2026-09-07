import copy
import hashlib
import io
import secrets
import uuid
import zipfile
from contextlib import asynccontextmanager

import pymupdf
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response

from .config import Settings
from .export import export_bank
from .jobs import Conflict, JobStore
from .models import Question, ReviewAction
from .ocr import MinerUProvider
from .pipeline import load_curriculum
from .storage import LocalStorage
from .validation import question_issues


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    store = JobStore(settings.database_url)
    artifacts = LocalStorage(settings.data)

    @asynccontextmanager
    async def lifespan(app):
        store.initialize()
        yield

    app = FastAPI(title="Elapse Forge", version="0.1.0", lifespan=lifespan)
    app.state.store = store

    def authorize(authorization: str = Header(default="")):
        if not settings.token:
            raise HTTPException(503, "Set FORGE_API_TOKEN before using Forge")
        if not secrets.compare_digest(authorization, f"Bearer {settings.token}"):
            raise HTTPException(401, "Invalid Forge access token")

    def get_job(job_id):
        try:
            return store.get(job_id)
        except KeyError:
            raise HTTPException(404, "Job not found")

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "elapse-forge", "version": "0.1.0"}

    @app.get("/capabilities", dependencies=[Depends(authorize)])
    def capabilities():
        return {
            "ocr": MinerUProvider(settings).preflight(),
            "parser": settings.parser,
            "ai_configured": bool(
                settings.ai_key and settings.ai_url and settings.ai_model
            ),
            "paddleocr": "not_implemented",
            "worker_required": True,
        }

    @app.get("/curriculums", dependencies=[Depends(authorize)])
    def curriculums():
        import json

        return [
            json.loads(p.read_text()) for p in settings.curriculum_dir.glob("*.json")
        ]

    @app.post("/jobs", status_code=202, dependencies=[Depends(authorize)])
    async def upload(file: UploadFile = File(...), course_id: str = Form(default="")):
        try:
            load_curriculum(settings, course_id or None)
        except ValueError as error:
            raise HTTPException(422, str(error))
        body = bytearray()
        while chunk := await file.read(1024 * 1024):
            body.extend(chunk)
            if len(body) > settings.max_upload_bytes:
                raise HTTPException(413, "File exceeds upload limit")
        source_name = (file.filename or "upload.pdf").replace("\\", "/").split("/")[-1]
        extension = source_name.rsplit(".", 1)[-1].lower()
        if extension not in ("pdf", "png", "jpg", "jpeg"):
            raise HTTPException(415, "Phase 1 accepts PDF, PNG and JPEG")
        try:
            with pymupdf.open(stream=bytes(body), filetype=extension) as doc:
                if doc.needs_pass or not 0 < len(doc) <= settings.max_pages:
                    raise ValueError("Encrypted, empty or oversized document")
                page_count = len(doc)
                pdf_bytes = bytes(body) if extension == "pdf" else doc.convert_to_pdf()
        except Exception:
            raise HTTPException(422, "Cannot read document or page limit exceeded")
        upload_id = uuid.uuid4().hex
        # Keep the original image too; PDF conversion does not destroy its provenance.
        original_key = artifacts.put(
            f"uploads/{upload_id}/original.{extension}", bytes(body)
        )
        source_key = artifacts.put(f"uploads/{upload_id}/source.pdf", pdf_bytes)
        return store.create(
            {
                "source_key": source_key,
                "original_key": original_key,
                "source_name": source_name,
                "sha256": hashlib.sha256(bytes(body)).hexdigest(),
                "course_id": course_id or None,
                "page_count": page_count,
            }
        )

    @app.get("/jobs", dependencies=[Depends(authorize)])
    def list_jobs():
        return [
            {
                "id": r["id"],
                "state": r["state"],
                "revision": r["revision"],
                "name": r["payload"]["source_name"],
            }
            for r in store.list()
        ]

    @app.get("/jobs/{job_id}", dependencies=[Depends(authorize)])
    def job(job_id: str):
        return get_job(job_id)

    @app.get("/jobs/{job_id}/history", dependencies=[Depends(authorize)])
    def job_history(job_id: str):
        get_job(job_id)
        return store.events(job_id)

    @app.get("/jobs/{job_id}/pages/{page_number}", dependencies=[Depends(authorize)])
    def page_image(job_id: str, page_number: int):
        row = get_job(job_id)
        with pymupdf.open(artifacts.path(row["payload"]["source_key"])) as doc:
            if not 1 <= page_number <= len(doc):
                raise HTTPException(404, "Page not found")
            page = doc[page_number - 1]
            scale = min(2, 1600 / max(page.rect.width, page.rect.height))
            image = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale)).tobytes("png")
        return Response(
            image,
            media_type="image/png",
            headers={"Cache-Control": "private, no-store"},
        )

    @app.post("/jobs/{job_id}/review", dependencies=[Depends(authorize)])
    def review(job_id: str, action: ReviewAction):
        row = get_job(job_id)
        if row["revision"] != action.expected_revision or row["lease"]:
            raise HTTPException(409, "Job changed or is running; reload first")
        payload = copy.deepcopy(row["payload"])
        if action.action in ("retry_parser", "retry_ocr"):
            if action.action == "retry_ocr":
                if not action.page_number or action.page_number > payload["page_count"]:
                    raise HTTPException(422, "A valid PDF page number is required")
                payload["checkpoints"].pop(str(action.page_number), None)
            # Retry creates an independent child job; prior human corrections remain intact.
            try:
                return store.retry(
                    job_id,
                    action.expected_revision,
                    {
                        k: v
                        for k, v in payload.items()
                        if k
                        not in (
                            "questions",
                            "issues",
                            "error",
                            "document_key",
                            "registries_key",
                        )
                    },
                    {
                        "action": action.action,
                        "page_number": action.page_number,
                        "reason": action.reason,
                        "actor": "forge-operator",
                    },
                )
            except Conflict as error:
                raise HTTPException(409, str(error))
        questions = [Question.model_validate(q) for q in payload.get("questions", [])]
        target = next((q for q in questions if q.id == action.question_id), None)
        if not target:
            raise HTTPException(404, "Question not found")
        before = target.model_dump(mode="json")
        if action.action == "edit":
            if action.question is None:
                raise HTTPException(422, "Edited question required")
            # Evidence and source identities are immutable; edits are separately audited.
            for field in (
                "stem",
                "options",
                "answer",
                "explanation",
                "type",
                "shared_stem",
                "shared_option_group",
                "course",
                "curriculum_node",
            ):
                setattr(target, field, getattr(action.question, field))
            target.review_status = "needs_review"
        elif action.action == "accept":
            target.review_status = "confirmed"
        elif action.action == "reject":
            target.review_status = "rejected"
        else:
            target.review_status = "uncertain"
        tree = load_curriculum(settings, payload.get("course_id"))
        issues = question_issues(target, tree)
        if action.action == "accept" and issues:
            raise HTTPException(
                422,
                {
                    "message": "Resolve structural issues before accepting",
                    "issues": issues,
                },
            )
        target.flags = issues
        payload["questions"] = [q.model_dump(mode="json") for q in questions]
        try:
            store.review(
                job_id,
                action.expected_revision,
                payload,
                {
                    "action": action.action,
                    "before": before,
                    "after": target.model_dump(mode="json"),
                    "reason": action.reason,
                    "actor": "forge-operator",
                    "base_revision": action.expected_revision,
                },
            )
        except Conflict as error:
            raise HTTPException(409, str(error))
        return store.get(job_id)

    @app.get("/jobs/{job_id}/export", dependencies=[Depends(authorize)])
    def export(job_id: str):
        import json

        row = get_job(job_id)
        if row["lease"] or row["state"] not in ("review_required", "completed"):
            raise HTTPException(409, "Wait for processing before export")
        tree = load_curriculum(settings, row["payload"].get("course_id"))
        if not tree:
            raise HTTPException(422, "Canonical curriculum required for export")
        try:
            package, provenance = export_bank(
                [
                    Question.model_validate(q)
                    for q in row["payload"].get("questions", [])
                ],
                tree,
                row["payload"]["source_name"],
            )
        except ValueError as error:
            raise HTTPException(422, str(error))
        provenance["review_history"] = store.events(job_id)
        provenance["document_key"] = row["payload"].get("document_key")
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "elapse-bank.json", json.dumps(package, ensure_ascii=False, indent=2)
            )
            archive.writestr(
                "forge-provenance.json",
                json.dumps(provenance, ensure_ascii=False, indent=2),
            )
        return Response(
            buffer.getvalue(),
            media_type="application/zip",
            headers={
                "Content-Disposition": 'attachment; filename="elapse-forge-export.zip"'
            },
        )

    return app


app = create_app()
