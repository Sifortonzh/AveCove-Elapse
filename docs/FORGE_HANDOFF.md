# Forge continuation · GPT-5.6 Sol High

Read root `AGENTS.md`, all six `FORGE_*` design documents, `forge/README.md`, then current code. Do not reconstruct project context from the long conversation. Work on one bounded task per turn and rerun compatibility tests. Use the user's source PDFs only as authorized local benchmark material.

## Foundation delivered

- Isolated Next UI/relay; FastAPI upload, jobs, page image, review, export.
- Durable SQL queue, lease fencing, per-page checkpoints, retry child lineage/history.
- MinerU native/remote/Docker invocation and legacy content-list adapter; explicit Paddle stub.
- Separate Document/Question/Registry models, conservative document parser and reconciler, validation and export adapter.
- Canonical trees (141/160 nodes), exact/normalized/alias matching; fuzzy proposals only.
- Medical normalization audit, optional compatible AI extraction with dual schema validation and bounded repairs.
- Synthetic regression suite, real-Elapse-importer contract test, benchmark/ground truth schemas, bilingual runbooks.

## Ordered tasks and acceptance gates

1. **Real MinerU acceptance, highest priority.** Provision a separate suitable local/remote OCR runtime, pin engine/model/backend, run infectious p4–5 with `run_mineru_sample.py`. Retain native output + Document; inspect rotation/bbox and cross-page option ordering. Then military p8 answer table. Report duration/memory and actual failure, not assumed accuracy. Do not use the small production host for model builds.
2. **Gold benchmark annotation.** Manually label 10–20 questions spanning both sources: continuation, A1/A2/A3/A4/B1, repeated numbering, answer table, later explanation. Independent location-based identities; record coverage and reviewer. Exclude unlabeled pages from denominators. Implement evaluator only after annotation rules are fixed.
3. **Layout-aware document segmentation.** Preserve columns/physical book-page ordering; classify summaries/question/answer/explanation regions; introduce source-scope IDs with explicit scope links. No per-book hardcoding. Verify shared A3/A4/B1 context and separated registries against gold samples.
4. **Bounded AI window planner.** Replace <=3-page limitation with semantic windows and carried context. Parse answer/explanation registries independently across full document. Persist each window and raw attempts, restart only failed windows. No one-request full-book JSON and no guessing incomplete answers.
5. **Curriculum review.** Add tree picker, reviewed aliases and explicit job-level course reassignment. Display fuzzy candidates; add optional AI semantic proposals only with source evidence. Test title ambiguities and multi-depth trees. Preserve source labels alongside canonical paths.
6. **Field-oriented Review.** Replace JSON textarea with validated stem/options/answer editor; add keyboard actions, answer/explanation source navigation, richer OCR filters, explicit document-level issue resolution. Then Merge Blocks / Split Question with immutable original records and audit.
7. **Durability hardening.** PostgreSQL concurrent-worker integration tests, engine/model fingerprinting in checkpoint signature, configurable bounded timeouts, worker resource telemetry, consistent backups, retention, cancellation and human-edit merge into retry children. SQLite tests alone are insufficient production proof.
8. **Deployment acceptance.** Build API and verified lightweight worker image off production host. Private-network token/HTTPS, upload limits and authorized operators. Check source commit, health, queue recovery and real sample end-to-end export before a tagged public release. Never describe foundation scaffolding as a completed scan-import product.

## Explicitly deferred

Paddle fallback, deskew/OpenCV transforms, native model installation automation, S3, multi-tenant ACL, semantic mapping, full subjective export, automatic training, high-volume performance tuning, complete field UI, whole-book OCR and production rollout.

## Testing caveats

PyMuPDF/Starlette produce dependency deprecation warnings on the current Python 3.13 test environment; assertions still pass. Typecheck uses the Forge configuration and checks untyped bodies. The old product test had a stale 1.3.6 version assertion despite repository package version 1.3.7; only that assertion was corrected. Existing practice behavior was not changed.
