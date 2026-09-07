# OCR Provider / MinerU integration

`OCRProvider.recognize(pdf, output, page_number, width, height)` returns a normalized `Page` and retained raw files. Only `ocr.py` sees MinerU fields. `PaddleOCRProvider` intentionally raises NotImplementedError; there is no pretend fallback.

## Modes

| Setting | Behavior | Readiness |
| --- | --- | --- |
| `FORGE_MINERU_MODE=native` | Calls operator-installed `FORGE_MINERU_COMMAND` without a shell | CLI, Python/model dependencies and hardware must exist |
| `remote` | Installed MinerU 3.x CLI with `--api-url` to operator-managed MinerU API | Not the commercial MinerU batch REST API; no invented REST contract |
| `docker` | Runs explicitly configured image with read-only input and output volume | Pin compatible image; runtime/GPU provisioning belongs to operator |

Arguments include `-p`, `-o`, `-b pipeline`, `-m ocr`, `-l ch`. The remote API flag is distinct from `-u` (model backend server). Modes are configuration switches; they have not all been integration-tested here. The Docker worker base image intentionally includes no model package. Build/provide a separately verified OCR worker image or run native worker in an engine-enabled environment.

References: [MinerU CLI documentation](https://github.com/opendatalab/MinerU/blob/master/docs/en/usage/cli_tools.md), [output files documentation](https://github.com/opendatalab/MinerU/blob/master/docs/en/reference/output_files.md). These are moving upstream documents; pin a tested release in the next real engine run.

## Normalization dialect

Forge supports two explicitly separated dialects:

- Legacy flat `*_content_list.json` from the self-hosted per-page CLI path. Each OCR input is one original PDF page: page_idx must be 0, then remapped to the original 1-based page number. Bboxes 0–1000 normalize to 0–1.
- Official MinerU 3.x `hybrid` JSON with a document-wide `pdf_info` array. `page_idx` must be contiguous; each bbox is normalized using that page's real `page_size`. Text/inline equations, headings, table HTML, cell spans and image references are retained. The original PDF/image and result JSON are imported together through `POST /jobs/import-mineru`; optional Markdown is archival evidence only.

Unexpected dialects, noncontiguous pages, invalid boxes and page-count mismatches are rejected instead of manufacturing text. Imported cloud results bypass OCR execution and cannot use per-page “retry OCR”; import a replacement result instead.

Only an explicit engine `confidence` field is stored as confidence. Missing means null; layout/model scores are not substituted. Raw content lists, middle/output artifacts and subprocess log are retained. Coordinate correctness on the supplied rotated double-page scans still needs real-engine visual comparison; a schema-valid box is not proof it covers the intended text.

## First real run

After installing a tested MinerU runtime following upstream instructions (in an isolated environment; do not alter Elapse Node dependencies):

```sh
export FORGE_MINERU_COMMAND=/absolute/path/to/mineru
export FORGE_MINERU_MODE=native
.venv-forge/bin/python forge/tools/run_mineru_sample.py \
  /path/to/传染指导与习题集配套第九版_演示.pdf --pages 4,5 \
  --output forge/.data/real-run-infectious-001
```

Output directory must not already exist. The script keeps original PDF page numbers, all engine files and `document.json`. Inspect p4→p5 continuation and overlay boxes before accepting the adapter. Next use the military sample p8 answer table and adjacent pages.

## Actual status this phase

Two user-produced MinerU 3.4.4 hybrid results were used for a private local regression on 2026-09-07. The 21-page infectious-diseases sample preserved a question crossing PDF pages 4→5 and associated 79 answers. The 10-page military obstetrics/gynecology sample exposed a structured answer table: 64 answer entries were read, 55 linked to questions, and 13 missing X-type section labels were conservatively recovered from the answer-table section and flagged for review. These are observed integration counts, not independently annotated accuracy scores. Multi-column OCR still interleaves some options and must remain in Review.

No local MinerU executable, official-cloud automatic upload client or public OCR endpoint is provisioned yet. Synthetic contract tests remain separate from real OCR evidence.

Do not run heavyweight OCR or download models on the existing small production Elapse server. On Apple Silicon, native acceleration is runtime-dependent; Docker cannot be assumed to access MPS. Do not upload copyrighted/sensitive samples to an external OCR service without appropriate authorization.
