# Forge Pipeline / 流程和恢复

Implemented states:

```text
uploaded → queued → preprocessing → ocr → parsing → reconciling
    → curriculum_mapping → validating → completed | review_required
any processing error → failed → explicit child-job retry
```

1. Upload validates readable PDF/PNG/JPEG, rejects encrypted/empty/oversized input. Default cap: 100 MiB and 300 PDF pages. Original images remain intact alongside their converted PDF. Worker executes after HTTP 202; no OCR in upload response.
2. Preprocessing currently preserves original layout/rotation and splits into single-PDF-page inputs. It does NOT deskew, crop columns or improve contrast. Future transformations must store inverse mappings back to original bboxes; never silently discard margins or another book page.
3. OCRProvider returns normalized Page plus raw artifact paths. Each successful page is checkpointed immediately. Signature includes source hash, provider/mode/command/backend/image/service and preprocessing version. Provider model upgrades under the same command require a fresh run or explicit checkpoint invalidation; model-hash fingerprinting is still pending.
4. Rule baseline maintains state across pages, extracting conservative numbered candidates and separate registries. Tables and orphan text remain explicit unparsed blocks. Optional AI parser uses the same model; at most 3 pages in phase 1, at most 2 schema attempts. Entire-book semantic window planning is NOT implemented.
5. Reconciler joins by `(document_id, source_scope, question_type, original_number)`, never page distance. Missing/ambiguous candidates are retained and flagged. Multiple questions in one scope with the same number are not silently deduplicated. Do not use medical knowledge to fill an answer.
6. Match source scope to a designated canonical curriculum. Exact/normalized/alias uniqueness can match automatically. Fuzzy results are suggestions only. Unresolved nodes go to Review.
7. Structural validation checks options, labels, answer cardinality/membership/evidence, shared context, source locations and canonical membership. Fullwidth/ambiguous medical normalization proposals are retained separately and force review. Unknown confidence remains null and forces `ocr_confidence_unverified`; any explicit source block confidence below 0.9 forces `ocr_issue`. This provisional threshold is not a calibrated accuracy guarantee. Structurally clean deterministic candidates with complete confidence evidence can be confirmed; this does not establish OCR correctness. Legacy MinerU output commonly lacks text confidence, so manual confirmation is expected.
8. Review accepts/edits/rejects/marks uncertain, with optimistic revision checks. Schema-invalid documents with no candidates surface as document-level issues. Current UI offers manual refresh/job-ID recovery, original page/bbox, JSON editor and filter skeleton. Merge Blocks/Split Question and rich field editing are future work.
9. Export includes only compatible confirmed questions, exact chapter-number notes and an auditable sidecar ZIP. Existing Elapse imports `elapse-bank.json`, NOT the ZIP or sidecar. A document can still have unresolved blocks; exported omissions are explicitly listed.

## Resume / concurrency

One worker by default. Native OCR subprocesses have timeouts and process-group termination. DB leases prevent stale commits; expiry may cause duplicate computation, not duplicate state overwrite. Crash recovery scans nonterminal expired jobs. Explicit retry of a failed job copies successful checkpoints; retrying a selected OCR page removes only that page checkpoint. All new artifacts use unique attempt directories. Human review is prohibited during processing.

LocalStorage atomically replaces individual files and validates path containment. A DB checkpoint is written after artifacts exist, so a crash before checkpoint may leave harmless unreferenced output. Cleanup/retention is not yet automatic; back up both DB and artifact volume together.

## Known extraction limits

Baseline rules do not fully understand multi-column answer tables, all inline `【答案】` patterns, combined A3/A4 headings, mixed learning summaries, every section scope or repeated numbering across missing headings. The user's samples exercise exactly these hard cases. They require annotated benchmarks and layout/semantic parsing, not additional book-specific regex. Scope aliases across distant answer sections must be reviewed rather than joined only on number.
