# Elapse / Forge development contract

## Preserve Elapse

- Read the actual `app/lib/question-parser.ts` and `app/lib/local-bank.ts` contracts first. Forge is an optional companion, not a rewrite.
- Do not change practice, sync, scoring, existing imports, production DB tables or migrations just to accommodate Forge. Keep conversion in `forge/src/elapse_forge/export.py`.
- Current Elapse shared files use `hongdou-question-bank`, version 1. Curriculum paths flatten to `category`; exact original question numbers and chapter names go in `bank.description` (4000-character limit). Save provenance separately; imported question IDs may change.
- Private user PDFs, credentials, OCR artifacts, AI responses, reviews and local DB files must never enter Git, browser-public assets or the Elapse Docker context.

## Forge boundaries

- Read `docs/FORGE_*.md` and `forge/README.md` before work. Phase 1 status is foundation, NOT production OCR acceptance.
- OCRProvider only reads layout/text. Only `ocr.py` understands MinerU's wire format. Never hide exam parsing inside a provider.
- Preserve original files, provider output, page numbers, normalized display-coordinate bboxes and raw OCR. Unknown confidence must remain null. Layout scores and text similarity are not OCR confidence.
- Match question/answer/explanation at document level using document + source scope + question type + number. Conflicts, missing scopes, duplicates and unsupported tables require review; never solve a missing answer.
- Canonical curriculum comes only from designated curriculum sources. Scan-book chapters are mapping candidates, never new canonical nodes. Trees are arbitrary-depth parent relations; fuzzy/AI matches remain proposals until reviewed.
- Medical normalization is conservative and auditable. Do not silently change medicine, doses, units, characters or answers. Retain originals and reasons.
- AI results pass JSON Schema AND Pydantic checks before persistence. Validate source anchors, bound repair attempts, retain raw attempts, and surface exhausted repair in Review.
- Background jobs own OCR. Keep lease-fenced page checkpoints and revisions; stale workers/editors must not overwrite current work. Retrying creates a child task; preserve prior reviews.
- Export only confirmed compatible objective questions. Subjective types can be represented internally, but must not be forced into multiple choice.
- V1 has no fine-tuning, complete fallback, automatic semantic mapping or multi-tenant public service. Explicitly label limitations and mocks.

## Verification and release

- Run `.venv-forge/bin/pytest -q forge/tests`, `.venv-forge/bin/ruff check forge`, `.venv-forge/bin/mypy --config-file forge/pyproject.toml forge/src`, `npm run lint`, `npm test`.
- Test exported JSON against the REAL Elapse importer (`forge/tests/elapse-import.mjs`), not just a copied schema.
- Synthetic tests establish contracts, not OCR accuracy. Do not claim a real MinerU run unless retained native output and a normalized Document exist. No accuracy without independent annotated ground truth.
- Keep source control clean and preserve unrelated user changes; SSH remotes and bilingual README are preferred. Tag when publishing a release. A production-release push is not complete until running SHA, Docker health and public URL are separately verified.
- Do not build heavy OCR on the user's small Elapse production host. First use native Mac or a separately provisioned Linux OCR host; Docker on Apple Silicon does not imply MPS support.
- Provide concise progress updates. Next-stage tasks are in `docs/FORGE_HANDOFF.md`, sized for GPT-5.6 Sol High. Do not spawn parallel agents without explicit authorization.
