# Elapse Forge · Architecture / 架构边界

Status: foundation 0.1.0, 2026-09-07. Elapse remains 1.3.7. This is not a production OCR acceptance claim.

## Audit of the existing system

| Concern | Actual code / infrastructure | Forge decision |
| --- | --- | --- |
| Web | Next.js 16.2.10, React 19.2.6, TypeScript 5.9.3, Node >=22.13 | Add isolated `/forge`, scoped CSS and `/api/forge/*` relay |
| Questions | `app/lib/question-parser.ts`: `QuizQuestion` | Separate Python internal model; export adapter only |
| Portable imports | `app/lib/local-bank.ts`: `parseSharedQuestionBankPackage`, format/version checks | Keep version 1 contract; regression executes production importer |
| Browser data | IndexedDB `hongdou-local-data`, `question-banks`; sourceNumber/category flat strings | No browser DB migration; no canonical tree grafted into old data |
| File ingestion | `app/lib/file-import.ts`: PDF.js text, Tesseract fallback; mammoth; server DOC extraction | Existing workflow unchanged; Forge handles scans separately |
| AI import | `app/api/import-ai/route.ts`, medical/306 chunk parsers | Do not reuse synchronous endpoint for hundred-page OCR jobs |
| Server DB | `app/lib/server/db.ts`, `db/init.sql`: PostgreSQL, learning JSONB, shared banks, account/comments/config | Reuse PostgreSQL infrastructure where configured; only additive `forge_*` tables |
| Auth | Existing personal sync and ADMIN_KEY serve different purposes | Separate operator bearer token; NOT end-user multi-tenancy |
| Deploy | Standalone Next output; root Compose app/postgres, optional Caddy | Optional Forge overlay, own process/image/storage; never OCR inside Next |

Audit also covered `app/lib/local-bank.ts` correction/share behavior, package scripts, `next.config.ts`, Dockerfile, `.dockerignore`, existing product tests and `app/lib/server/admin.ts`. Runtime production health was not revalidated in this phase.

## Boundary diagram

```text
Elapse /forge ── /api/forge/* relay ── FastAPI (upload, jobs, review, export)
                                      │
                              DB job queue + review log
                                      │ lease / revision
                                independent worker
                                      │
input → identity preprocessing → OCRProvider → Document → Parser/Registries
                                                           │
                                            Reconciler → Curriculum → Validation
                                                           │
                                                      Review → Adapter
                                                           │
                                            Elapse JSON + provenance sidecar
```

The durable SQL queue is the phase-1 equivalent of Redis/RQ, avoiding another production service. PostgreSQL is the intended server DB; SQLite supports one local worker. Claim/update compare-and-swap protects ownership; heartbeat renews a 60-second lease every 15 seconds. This is at-least-once processing with fenced writes, NOT exactly-once OCR execution. A lost worker may finish OCR, but cannot overwrite newer state.

## Source roles

- `curriculums/27传染病学_目录.pdf` and `31皮肤性病学_目录.pdf`: canonical sources only, 4 and 5 PDF pages, full page/text inspection performed.
- Two `ocr-benchmarks/*_演示.pdf`: scanned benchmark material only, 21 and 10 PDF pages. All pages inspected via contact sheets. No original PDFs are copied into Git.
- Textbook edition is not proven by these TOC pages: seed version is `user-provided-2026-09-06`, not an invented edition number.

## Isolation, privacy, tradeoffs

Only new Forge routes join the web app. Existing practice/English/import/scoring/sync routes are untouched. OCR, uploads, AI replies and human reviews live under private `FORGE_STORAGE_ROOT`, excluded from both Git and the Elapse image context. The UI keeps its token in memory, not localStorage. It sends it only to the same-origin fixed relay; no arbitrary upstream URL is accepted from users.

Phase 1 is a trusted-operator tool, not an internet-public upload service: no per-user ACL, quota, file malware sandbox, object-store lifecycle, or complete audit export UI. Bind API to loopback/private network; protect the Next frontend with operator access if exposed. Bearer tokens require HTTPS in transit. Remote OCR and optional AI explicitly send source content to configured services; use only authorized non-sensitive documents.

Local filesystem is behind an artifact abstraction. Multiple server nodes require a shared artifact volume; PostgreSQL alone does not share OCR files. S3/MinIO and schema migrations for later Forge versions remain future work.
