"""Only this module knows MinerU's wire format. No exam rules belong here."""

import json
import os
import shutil
import signal
import subprocess
import uuid
from html.parser import HTMLParser
from pathlib import Path
from typing import Protocol

from .config import Settings
from .models import Block, Box, Page


class _MinerUTableParser(HTMLParser):
    """Turn MinerU table HTML into a small lossless-enough review grid."""

    def __init__(self):
        super().__init__()
        self.rows: list[list[dict]] = []
        self._row: list[dict] | None = None
        self._cell: dict | None = None

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "tr":
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = {
                "text": "",
                "colspan": max(1, int(values.get("colspan", "1"))),
                "rowspan": max(1, int(values.get("rowspan", "1"))),
            }
            self._row.append(self._cell)

    def handle_data(self, data):
        if self._cell is not None:
            self._cell["text"] += data

    def handle_endtag(self, tag):
        if tag in ("td", "th"):
            if self._cell is not None:
                self._cell["text"] = " ".join(self._cell["text"].split())
            self._cell = None
        elif tag == "tr" and self._row is not None:
            self.rows.append(self._row)
            self._row = None


def _hybrid_text(raw: dict) -> tuple[str, dict]:
    metadata: dict = {}

    def extract(value, separator="\n") -> str:
        if isinstance(value, list):
            return separator.join(part for item in value if (part := extract(item)))
        if isinstance(value, dict):
            if isinstance(value.get("content"), str):
                content = value["content"]
                return (
                    f"${content}$"
                    if value.get("type") in ("inline_equation", "interline_equation")
                    else content
                )
            if isinstance(value.get("html"), str):
                html = value["html"]
                parser = _MinerUTableParser()
                parser.feed(html)
                metadata["table_html"] = html
                metadata["table_rows"] = parser.rows
                return "\n".join(
                    "\t".join(c["text"] for c in row) for row in parser.rows
                )
            if isinstance(value.get("image_path"), str):
                metadata.setdefault("image_paths", []).append(value["image_path"])
            if "spans" in value:
                return extract(value.get("spans", []), separator="")
            if "lines" in value:
                return extract(value.get("lines", []), separator="\n")
            if "blocks" in value:
                return extract(value.get("blocks", []), separator="\n")
        return ""

    return extract(raw).strip(), metadata


def normalize_mineru_hybrid(content: object) -> tuple[list[Page], dict]:
    """Normalize the official MinerU 3.x hybrid JSON dialect document-wide."""

    if not isinstance(content, dict) or not isinstance(content.get("pdf_info"), list):
        raise ValueError("Expected MinerU hybrid JSON with a pdf_info array")
    pages: list[Page] = []
    for expected, raw_page in enumerate(content["pdf_info"]):
        if not isinstance(raw_page, dict) or raw_page.get("page_idx") != expected:
            raise ValueError("MinerU hybrid page_idx must be zero-based and contiguous")
        size = raw_page.get("page_size")
        if (
            not isinstance(size, list)
            or len(size) != 2
            or not all(isinstance(v, (int, float)) and v > 0 for v in size)
        ):
            raise ValueError("MinerU hybrid page_size is missing or invalid")
        width, height = float(size[0]), float(size[1])
        blocks: list[Block] = []
        raw_blocks = raw_page.get("para_blocks")
        if not isinstance(raw_blocks, list):
            raise ValueError("MinerU hybrid para_blocks must be an array")
        for order, raw in enumerate(raw_blocks):
            if not isinstance(raw, dict):
                raise ValueError("MinerU hybrid block must be an object")
            bbox = raw.get("bbox")
            box = None
            if bbox is not None:
                if (
                    not isinstance(bbox, list)
                    or len(bbox) != 4
                    or not all(isinstance(v, (int, float)) for v in bbox)
                ):
                    raise ValueError("Invalid MinerU hybrid bbox")
                box = Box(
                    x0=bbox[0] / width,
                    y0=bbox[1] / height,
                    x1=bbox[2] / width,
                    y1=bbox[3] / height,
                )
            text, metadata = _hybrid_text(raw)
            raw_type = str(raw.get("type", "unknown"))
            metadata.update(
                {
                    "mineru_type": raw_type,
                    "mineru_index": raw.get("index"),
                    "text_level": raw.get("level"),
                    "angle": raw.get("angle", 0),
                }
            )
            blocks.append(
                Block(
                    id=f"p{expected + 1}-b{order}",
                    type="heading" if raw_type == "title" else raw_type,
                    text=text,
                    bbox=box,
                    reading_order=order,
                    confidence=raw.get("confidence"),
                    metadata=metadata,
                )
            )
        pages.append(
            Page(
                page_number=expected + 1,
                width=width,
                height=height,
                blocks=blocks,
                preprocessing=["MinerU hybrid coordinates normalized from page_size"],
            )
        )
    return pages, {
        "version": content.get("_version_name"),
        "backend": content.get("_backend"),
        "ocr_enabled": content.get("_ocr_enable"),
        "effort": content.get("_effort"),
    }


class OCRProvider(Protocol):
    name: str

    def recognize(
        self, pdf: Path, output: Path, page_number: int, width: float, height: float
    ) -> tuple[Page, list[Path]]: ...


def normalize_mineru(
    content: object, page_number: int, width: float, height: float
) -> Page:
    if not isinstance(content, list):
        raise ValueError(
            "Expected MinerU legacy content_list.json array; unsupported dialect"
        )
    blocks = []
    for i, raw in enumerate(content):
        if not isinstance(raw, dict) or raw.get("page_idx") != 0:
            raise ValueError("Single-page MinerU output must have page_idx=0")
        bbox = raw.get("bbox")
        box = None
        if bbox is not None:
            if not isinstance(bbox, list) or len(bbox) != 4:
                raise ValueError("Invalid MinerU bbox")
            box = Box(**dict(zip(("x0", "y0", "x1", "y1"), [v / 1000 for v in bbox])))
        text = raw.get("text", "")
        if raw.get("type") == "table":
            text = raw.get("table_body", "")
        if raw.get("type") == "list":
            text = "\n".join(raw.get("list_items", []))
        if not isinstance(text, str):
            raise ValueError("Unexpected content type; retain raw output for review")
        blocks.append(
            Block(
                id=f"p{page_number}-b{i}",
                type="heading" if raw.get("text_level") else raw.get("type", "unknown"),
                text=text,
                bbox=box,
                reading_order=i,
                confidence=raw.get("confidence"),
                metadata={
                    "mineru_type": raw.get("type"),
                    "text_level": raw.get("text_level"),
                },
            )
        )
    return Page(page_number=page_number, width=width, height=height, blocks=blocks)


class MinerUProvider:
    name = "mineru"

    def __init__(self, settings: Settings):
        self.settings = settings

    def preflight(self) -> dict:
        s = self.settings
        executable = "docker" if s.mineru_mode == "docker" else s.mineru_command
        issues = []
        if not shutil.which(executable):
            issues.append(f"Executable not found: {executable}")
        if s.mineru_mode == "remote" and not s.mineru_api_url:
            issues.append("FORGE_MINERU_API_URL is required")
        if s.mineru_mode == "docker" and not s.mineru_image:
            issues.append(
                "FORGE_MINERU_IMAGE must identify an installed, version-pinned image"
            )
        if s.mineru_mode not in ("native", "remote", "docker"):
            issues.append("Unsupported FORGE_MINERU_MODE")
        return {
            "provider": self.name,
            "mode": s.mineru_mode,
            "ready": not issues,
            "issues": issues,
            "note": "Readiness checks configuration only; model availability requires a real OCR run.",
        }

    def recognize(self, pdf, output, page_number, width, height):
        s = self.settings
        check = self.preflight()
        if not check["ready"]:
            raise RuntimeError("; ".join(check["issues"]))
        output.mkdir(parents=True, exist_ok=True)
        container = f"forge-ocr-{uuid.uuid4().hex}"
        if s.mineru_mode == "docker":
            command = [
                "docker",
                "run",
                "--rm",
                "--name",
                container,
                "-v",
                f"{pdf.parent.resolve()}:/input:ro",
                "-v",
                f"{output.resolve()}:/output",
                s.mineru_image,
                "mineru",
                "-p",
                f"/input/{pdf.name}",
                "-o",
                "/output",
            ]
        else:
            command = [
                s.mineru_command,
                "-p",
                str(pdf.resolve()),
                "-o",
                str(output.resolve()),
            ]
            if s.mineru_mode == "remote":
                command += ["--api-url", s.mineru_api_url]
        command += ["-b", s.mineru_backend, "-m", "ocr", "-l", "ch"]
        # Never use a shell; terminate native children too on timeout.
        with (output / "process.log").open("wb") as log:
            process = subprocess.Popen(
                command, stdout=log, stderr=subprocess.STDOUT, start_new_session=True
            )
            try:
                code = process.wait(timeout=s.ocr_timeout)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                raise RuntimeError(
                    "MinerU timeout; successful page checkpoints are retained"
                )
            finally:
                if s.mineru_mode == "docker":
                    subprocess.run(
                        ["docker", "rm", "-f", container],
                        capture_output=True,
                        timeout=20,
                    )
        if code:
            raise RuntimeError(
                f"MinerU exited {code}; inspect the retained process.log"
            )
        files = list(output.rglob("*_content_list.json"))
        if len(files) != 1:
            raise ValueError(
                "Expected one legacy content_list.json; pin a compatible MinerU release"
            )
        page = normalize_mineru(
            json.loads(files[0].read_text()), page_number, width, height
        )
        return page, [p for p in output.rglob("*") if p.is_file()]


class PaddleOCRProvider:
    name = "paddleocr-pp-structure-v3"

    def recognize(self, pdf, output, page_number, width, height):
        raise NotImplementedError(
            "PaddleOCR PP-StructureV3 is an interface reservation, not an implemented fallback"
        )


def provider_from(settings: Settings) -> OCRProvider:
    if settings.provider == "mineru":
        return MinerUProvider(settings)
    if settings.provider == "paddleocr":
        return PaddleOCRProvider()
    raise ValueError("Unknown OCR provider")
