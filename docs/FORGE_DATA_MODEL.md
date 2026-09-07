# Forge Data Model / 数据模型

Executable source of truth: `forge/src/elapse_forge/models.py`; generated Draft 2020-12 schemas: `forge/benchmarks/*.schema.json`. Every model forbids extra fields and non-finite numbers. AI outputs are checked by JSON Schema then Pydantic.

## Actual Elapse contract

`QuizQuestion` requires `id`, `sourceNumber`, `category`, `stem`, `options: {label,text}[]`, `answer: string[]`, `multiple`. Optional fields: `answerPending`, `draftAnswer`, `explanation`, `answerSource`, `sharedOptionGroup`; 306-only `examProfile`, `examYear`, `examFormat`, `questionType: A|B|C|X`, `points`.

Do not confuse medical A1/A2/A3/A4 with Elapse's 306-only `questionType`. The generic adapter deliberately omits 306 metadata; no score/year is invented.

Portable bank envelope:

```json
{
  "format": "hongdou-question-bank",
  "version": 1,
  "exportedAt": "ISO timestamp",
  "bank": {"name": "name", "description": "原题号 1、3 → 课程 / 章节", "groupName": "course", "questions": []}
}
```

Empty questions above illustrate the envelope only; a valid exported bank must contain at least one question. The old importer also supports the independent `avecove-western-306` format; Forge does not change either importer. Browser import can regenerate IDs, so the sidecar maps exported IDs and original source numbers, not a guaranteed persistent browser identity. `description` is limited to 4000 characters; Forge fails explicitly rather than silently truncating chapter notes. Batch export is next-phase work.

## Document and provenance

Document: schema_version, stable source hash id, metadata, pages, provider, raw_output_reference.

Page: physical PDF page_number (1-based), displayed width/height, original rotation, preprocessing log, blocks.

Block: unique id, type, raw text, bbox, reading_order, confidence (nullable), provider metadata. Bboxes use 0–1 coordinates relative to the displayed rotated original page. Missing locations remain null and require OCR review. Keep printed textbook page numbers distinct from PDF page numbers.

Source: source_file, source_page, block_id, bbox, ocr_text, ocr_provider. A question has multiple source anchors; answers and explanations have independent anchor arrays, so p10 questions can point to p80 answers and p90 explanations.

## Internal questions

Question supports A1/A2/A3/A4/B1/C/single/multiple/judgement/fill/term/short/essay/unknown. Fields include document identity, source number, source scope, stem/options/answers/explanation, shared stem/options group, course/canonical node, source arrays, nullable confidence, review status, flags and parser/model version.

Internal representation does not mean every type is fully extracted in phase 1. Subjective questions are retained for review but never disguised as objective questions. A3/A4 without shared stem, B1 without shared option context, and judgement without explicit choices cannot export. Missing answers stay pending internally; phase-1 export only includes confirmed answered objective questions.

QuestionRegistry and answer/explanation RegistryEntry share document_id + source scope + type + original number. RegistryEntry carries raw source anchors plus list-valued answers or string-valued explanation. Reconciliation validates the value kind and rejects conflicts.

## Curriculum and jobs

Curriculum: id/title/version/source_file/source_sha256/nodes. Node: id/course_id/parent_id/node_type/title/normalized_title/order/aliases/metadata. Parents are generic; no fixed maximum depth. Validation rejects cycles, duplicate IDs, missing parents and cross-course links.

SQL tables: `forge_jobs` (id,state,revision,payload,lease,lease_until); `forge_review_history` (id,job_id,event). Payload contains source keys, checkpoints, normalized document/registry references, candidate questions and issues. Event retains action, before/after correction, actor, reason, timestamp and base revision.

Accept/edit/reject/uncertain cannot change provenance. Edits are separate audited human content. Retry creates a child job with parent_job_id, preserving previous corrections instead of overwriting them. Retrying source extraction and manually merging corrections are intentionally separate operations.
