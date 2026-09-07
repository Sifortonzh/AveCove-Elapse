# Elapse Forge

[简体中文](README-zh.md) · [Architecture](../docs/FORGE_ARCHITECTURE.md) · [Handoff](../docs/FORGE_HANDOFF.md)

Foundation **0.1.0** for an optional scanned medical question-bank import workbench. Not a complete OCR product. Existing Elapse remains untouched apart from optional routes. Real MinerU execution is pending on a provisioned engine host.

## Local start (from repository root)

```sh
python3 -m venv .venv-forge
.venv-forge/bin/pip install -e 'forge[dev]'
cp forge/.env.example forge/.env
```

Set a strong `FORGE_API_TOKEN` in `forge/.env`. Start API and worker in **separate terminals**, with the same environment:

```sh
set -a
source forge/.env
set +a
.venv-forge/bin/uvicorn elapse_forge.api:app --host 127.0.0.1 --port 8091
```

```sh
set -a
source forge/.env
set +a
.venv-forge/bin/python -m elapse_forge.worker
```

Start the existing web app in a third terminal:

```sh
FORGE_API_URL=http://127.0.0.1:8091 npm run dev
```

Open `http://localhost:3000/forge`, enter the same access token, connect, choose a canonical course, upload a PDF/image, keep its job ID and manually refresh. The API can queue uploads before OCR is installed, but the worker will report a clear failed status until MinerU is available. Stop/restart a worker to recover an expired nonterminal lease; explicit failed-job retry creates a child task reusing successful page checkpoints.

Review the source scan alongside structured JSON. Save edits, then Confirm; export a ZIP. Import only `elapse-bank.json` into existing Elapse. Retain `forge-provenance.json` privately for source/audit history. Default exports exclude unanswered, rejected, uncertain and unsupported subjective questions. Choose a course at upload for export; unassigned API jobs are diagnostic-only in this foundation UI.

## OCR configuration

See [OCR modes and the real-run command](../docs/FORGE_OCR.md). Install a tested MinerU environment separately, then point `FORGE_MINERU_COMMAND` to its CLI. Native, operator-managed remote API and Docker invocation are implemented configuration paths; they still need real-engine acceptance. PaddleOCR is only an interface reservation. No model download, API key, hidden fallback or fake OCR is bundled.

## Self-hosted layout

`docker-compose.forge.yml` is an **optional overlay**. Copy/edit `forge/.env` first:

```sh
docker compose -f docker-compose.yml -f docker-compose.forge.yml --profile forge up -d --build forge-api
```

It does not modify or restart Elapse or run native OCR. For the existing app container, configure `FORGE_API_URL=http://forge-api:8091` in its runtime env when deliberately enabling the UI relay. API uses a persistent private volume. To use PostgreSQL, create a dedicated Forge DB/role on an existing managed PostgreSQL instance and set `FORGE_DATABASE_URL=postgresql+psycopg://...`; no automatic destructive migration occurs. SQLite is for one local worker only. Back up DB and artifacts together.

The base image lacks MinerU. Before enabling the separate `forge-worker` profile, supply `FORGE_WORKER_IMAGE` with a verified CLI/runtime and matching environment; remote mode still needs the CLI. Do not mount the host Docker socket into an internet-facing API. Native OCR memory/model requirements must be measured on a separate machine, not assumed to fit the small Elapse server. Compose itself has not been started on production in this phase.

## Verify

```sh
.venv-forge/bin/pytest -q forge/tests
.venv-forge/bin/ruff check forge
.venv-forge/bin/mypy --config-file forge/pyproject.toml forge/src
npm run lint
npm test
```

The Python export test invokes the actual TypeScript Elapse importer. Tests use explicitly synthetic documents and mock AI transport, not fake accuracy benchmarks. Sources/metrics: [benchmark notes](../docs/FORGE_BENCHMARK.md). Known limitations and small continuation tasks: [handoff](../docs/FORGE_HANDOFF.md).
