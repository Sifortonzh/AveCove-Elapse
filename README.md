# AveCove Elapse

<p align="center">
  <img src="public/hongdou-logo.png" width="112" alt="AveCove Elapse medical serpent emblem" />
</p>

<p align="center">
  A privacy-minded, self-hosted question-bank workspace for medical learning, deliberate practice, review, and optional AI assistance.
</p>

<p align="center">
  <a href="README-zh.md">简体中文</a> ·
  <a href="docs/1.0.0功能介绍与视频演示提纲.md">1.0 Video Guide</a> ·
  <a href="docs/部署与上线指南.md">Deployment</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="COPYRIGHT.md">Copyright</a>
</p>

<p align="center">
  <img alt="Version 1.0.0" src="https://img.shields.io/badge/version-1.0.0-b43d35" />
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-111111?logo=nextdotjs" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-087ea4?logo=react&logoColor=white" />
  <img alt="PostgreSQL 16" src="https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white" />
  <img alt="Docker ready" src="https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white" />
</p>

<p align="center">
  <img src="public/hongdou-share.png" width="920" alt="AveCove Elapse interface preview" />
</p>

## What it is

AveCove Elapse is the self-hostable edition of **红豆生南国**, initially designed for personal medical question-bank practice. It turns authorized Word and PDF materials into a durable library with objective-question practice, review records, notes, optional AI explanations, and lightweight cross-device sync.

The project deliberately avoids advertising, phone-number login, and mandatory social-platform accounts. A student ID is converted into an irreversible sync identifier; the original value is not stored. Email is optional and is used only when the user enables verification-code login or identity protection.

Version `1.0.0` marks the first public-source release suitable for self-hosting and demonstrations. It contains only a small demo bank—no copyrighted commercial or course bank is bundled.

## Highlights

### Import and organize your own banks

- Import multiple `.doc`, `.docx`, text PDF, scanned PDF, and portable AveCove JSON files.
- Keep every successful import in a browser-local library.
- Rename, describe, search, share, delete, and safely reset one bank’s learning record.
- Search bank titles, descriptions, groups, stems, options, categories, and source numbers with highlighted matches.
- Group related banks manually or by safe keyword suggestions; yearly Western Medicine 306 papers can share one `考研西综306` group.
- Review wrong questions across every bank in the active group.
- Keep unanswered objective questions in test mode and add a matching answer file later.

### Medical practice

- Single-choice, multiple-choice, and true/false questions.
- Sequential practice, 20-question random challenge, and 100-question mock exam.
- Wrong-answer review, favorites, answer sheet, notes, and per-bank progress.
- Optional answer-on-return, option shuffling, auto-favorite, and correct-answer auto-advance.
- Friendly first/last-question boundary messages.
- Source explanations remain visible below the question independently of AI output.
- AI learning content can be written into Markdown notes with source, textbook-reference reminder, search, and tags.

### Western Medicine 306 workbench

- Modern 165-question / 300-point A/B/X profile and legacy C-type support.
- Source-paper plus answer/explanation-paper pairing.
- Page-aware extraction, cross-page seam recovery, deterministic answer-table reconciliation, and AI structuring.
- Audits expected question count, A/B/C/X distribution, duplicates, missing source numbers, and answer coverage.
- Fewer than ten missing answers may be reconciled into normal practice only when the source proves a safe one-to-one question/answer mapping.
- First-attempt scoring prevents repeated attempts from increasing the exam score.
- Standard JSON export for corrected or externally OCR-processed papers.

### AI, without provider lock-in

- Three learning views: concise summary, common pitfalls, and follow-up explanation.
- Personal AI configuration works without administrator approval.
- Site-wide AI configuration is optional and remains server-side.
- OpenAI-compatible domestic and international providers are supported through configurable base URL, model, and key.
- AI import receives extracted text rather than the original document.
- AI output is a study aid, not clinical or legal advice; imported answers must still be sampled and verified.

### Sync and privacy

- Optional student-ID-based cross-device sync for parsed banks and learning records.
- Sync includes Chinese banks, English preview records, answers, wrong questions, favorites, notes, drafts, and settings.
- Original Word, PDF, and image files are not stored in the sync database.
- PostgreSQL stays inside the Docker network and is not exposed publicly.
- Session cookies are HttpOnly and production-only Secure.
- Email verification codes expire after ten minutes and are rate-limited.

### English Lab preview

English Lab is intentionally frozen as a **preview after 1.0.0** while the medical import pipeline remains the priority.

- Interactive demos for cloze, reading, listening, paragraph matching, translation, and writing.
- Cloze answers write back into the passage and can be checked in context.
- Reading supports click-to-translate, a local wordbook, highlights, pen, marker, eraser, and answer analysis.
- Listening, matching, and translation demos now support real selection, submission, and feedback.
- The browser remembers the last English stage and page. Imported Test Library records remain visible after switching to Chinese practice.
- Existing experimental English imports remain local-first, but high-stakes use is not recommended until the import pipeline is resumed and audited.

## Quick start

Requirements:

- Node.js `22.13+`
- npm

```bash
git clone git@github.com:Sifortonzh/AveCove-Elapse.git
cd AveCove-Elapse
cp .env.example .env
npm ci
npm run dev
```

Open `http://localhost:3000`.

Quality checks:

```bash
npm run lint
npm run test
```

`npm run test` performs a production build before running the product tests.

## Production deployment with Docker and Caddy

1. Point your domain to the server.
2. Copy `.env.example` to `.env`.
3. Replace every placeholder secret.
4. Start PostgreSQL and the application:

```bash
docker compose up -d --build
```

The application listens on `127.0.0.1:3011`; place Caddy, Nginx, or the BT panel reverse proxy in front of that port. The optional Compose Caddy profile is also included:

```bash
docker compose --profile caddy up -d --build
```

Health check:

```bash
curl http://127.0.0.1:3011/api/health
```

See [Deployment Guide](docs/部署与上线指南.md) and [Launch Checklist](docs/上线检查清单.md).

## SMTP verification codes

QQ Mail and Foxmail:

```env
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-account@foxmail.com
SMTP_PASS=your-16-character-smtp-authorization-code
SMTP_FROM="AveCove Elapse <your-account@foxmail.com>"
```

Enable SMTP in the mailbox settings and use the generated authorization code—not the web-login password. Recreate the app container after changing `.env`:

```bash
docker compose up -d --force-recreate app
```

Never commit `.env`, SMTP credentials, AI keys, or real student data.

## AI configuration

Two independent modes are available:

1. **Personal AI** at `/custom-ai`: stored only in the user’s browser and does not require administrator approval.
2. **Site AI** at `/admin/ai`: configured by the deployment administrator and protected by `ADMIN_KEY`.

For site configuration, set independent secrets in `.env`:

```env
SYNC_SECRET=replace-with-32-or-more-random-characters
CONFIG_ENCRYPTION_KEY=replace-with-an-independent-random-secret
ADMIN_KEY=replace-with-another-long-random-secret
AI_DAILY_LIMIT=20
```

## Data boundaries

| Data | Default location |
| --- | --- |
| Imported structured banks | Browser IndexedDB |
| Local answers and settings | Browser localStorage |
| Optional synchronized structures and records | Self-hosted PostgreSQL |
| Original Word/PDF/image files | User device; not retained by sync |
| Personal AI key | User browser |
| Site AI key | Server configuration / encrypted database |

Read [Data and Privacy](docs/数据与隐私说明.md), [Security](SECURITY.md), [Terms](TERMS.md), and [Copyright](COPYRIGHT.md) before operating a public instance.
These documents contain the project disclaimer and responsible-use terms.

## Known limitations

- OCR quality still depends on scan clarity, layout, watermark density, and page continuity.
- AI structuring may be slow or incomplete for large files; verify question count and answers.
- The English import pipeline is experimental and paused after the 1.0 preview.
- Audio QR extraction is a preview workflow, not a universal downloader.
- This repository currently declares no open-source license. Public source access does not grant reuse, redistribution, commercial use, or brand rights.

## 1.0 release scope and next priorities

Completed for 1.0:

- Stable medical practice and review workflow.
- Multi-bank library, groups, group-wide wrong questions, descriptions, search, share, and reset.
- Western Medicine 306 import/standardization and scoring profile.
- Optional personal/site AI and SMTP email-code login.
- Docker/PostgreSQL deployment, health checks, backup scripts, bilingual documentation.
- English interaction demonstrations and persistent preview navigation.

Next priorities:

- Improve deterministic and AI-assisted import quality across more medical paper layouts.
- Reduce OCR and AI latency, especially for long and cross-page files.
- Add stronger post-import auditing and manual correction tools.
- Resume English exam import only after the medical pipeline and public release are stable.

## Repository documents

- [中文说明](README-zh.md)
- [1.0 Feature and Video Demonstration Outline](docs/1.0.0功能介绍与视频演示提纲.md)
- [Western Medicine 306 Import and Scoring](docs/西医综合306导入与计分.md)
- [English AI Import Protocol](docs/英语AI导入Prompt.md)
- [Deployment Guide](docs/部署与上线指南.md)
- [Launch Checklist](docs/上线检查清单.md)
- [Question Sources](QUESTION_SOURCES.md)
- [Terms](TERMS.md)
- [Copyright](COPYRIGHT.md)
- [Security](SECURITY.md)

## Rights and responsibility

© 2026 AveCove Elapse / 红豆生南国. All relevant rights reserved.

Users are responsible for ensuring that imported, synchronized, or shared material is authorized. Do not upload patient information, confidential exam material, illegally copied publications, or personal secrets. AI and community output must not replace textbooks, current guidelines, professional judgment, or clinical care.
