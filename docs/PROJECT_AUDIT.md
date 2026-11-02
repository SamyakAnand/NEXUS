# Nexus Repository Audit

**Audit date:** 2026-10-14 (Asia/Kolkata)
**Scope:** Source/configuration review and read-only provider catalog checks in the local checkout `E:\Nexus`. This is not a penetration test, load test, or production deployment verification.

## Executive summary

Nexus is a full-stack tabular analytics prototype, not yet a multimodal RAG/knowledge platform. The checked-out branch is `feature/enterprise-ai-analyst` and already contains substantial uncommitted backend, frontend, connector, semantic-model, and test changes. Those changes are user work and were left in place. The originally selected `E:\Argus ai` folder is empty; the Nexus source repository was found separately at `E:\Nexus`.

The current code has deterministic profiling and analytical calculations, upload/preview/export, SQL-on-frame, report/evaluation routes, REST and SQL connectors, and semantic join/lineage utilities. Remote model code exists, but the active analysis flow uses `llm.py`; an imported gateway and an LLM planner are not actually used for planning. No embeddings, vector store writes/search, BM25 index, reciprocal-rank fusion, OCR/layout parser, document image/chart/table ingestion, or citation-level retrieval chain was found. The PostgreSQL/pgvector schema is not safely aligned with ORM models, and persistence errors are swallowed. Authentication and tenant isolation are absent. The requested multimodal RAG path is therefore not a safe incremental production integration yet.

## Repository evidence

| Area | Evidence and finding |
|---|---|
| Framework | `apps/api/pyproject.toml`, `apps/api/requirements.txt`: Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy, psycopg, pgvector, Redis client, LangGraph, Pandas/scikit-learn. `apps/web/package.json`: Next.js 16 / React 19. |
| Existing functionality | `apps/api/nexus_api/main.py`, `analysis.py`, `profiling.py`, `connectors.py`, `semantic.py`, `cleaning.py`, `stats.py`; web workspace in `apps/web/src/components/Workspace.tsx`. |
| Persistence | `main.py` retains global in-process `datasets`, `frames`, and `runs`, a JSON manifest, and local files; it also attempts SQLAlchemy persistence. `db.py` silently switches to SQLite on initialization failure. Broad persistence exceptions are ignored. |
| Schema mismatch | `database/init.sql` defines `datasets.source_filename` and `file_format`; `db.py` ORM expects `filename`, `format`, and `storage_path`. `init.sql` uses UUID ids while ORM uses string ids and does not declare the ORM columns/tables consistently. Docker mounts this DDL as first-run initialization, while the app calls `create_all`; compatibility is unverified and likely to fail on a pre-created schema. |
| Retrieval | `evaluation.py` ranks fixed metadata fixtures only. No production embedding, BM25, vector query, RRF, reranker, or retrieval-grounded generation path was found. `knowledge_embeddings` is DDL only. |
| Model flow | `analysis.py` imports `gateway`, `plan_with_llm`, but calls neither for analysis planning. The actual summary path calls `synthesize_with_llm` from `llm.py`. Provider selection and retry logic are duplicated across `llm.py` and `gateway.py`. |
| Upload/connectors | Upload is capped at `MAX_UPLOAD_MB` (default 15 MiB) and extension allowlisted in `main.py`. Parser work is synchronous/in-process. REST connector accepts caller URLs, follows redirects, and returns raw exception strings; SQL connector accepts caller connection URLs. No outbound-host policy or credential vault was found. |
| Access control | Dataset, export, SQL, analysis, source, and report routes have no authentication/authorization dependency. No tenant ownership check exists. CORS is restricted to local development origins, which does not protect direct API access. |
| Deployment | `docker-compose.yml` provisions API, web, PostgreSQL/pgvector and Redis. `vercel.json` routes API and web publicly. `main.py` uses `/tmp/nexus-data` under Vercel and also loads complete frames in process; shared/durable serverless persistence is not established. No live deployment check was performed. |
| CI/tests | `.github/workflows/ci.yml` specifies API pytest plus frontend typecheck/build. New uncommitted tests are present. Results for this checkout are recorded only after the final test run below. |
| Working tree | Existing modified and untracked files were present at audit start, including `.env.local`; their contents were not printed or changed. `git diff --stat` showed about 1,786 added/338 removed tracked lines before this documentation pass. |

## Provider and model verification

Read-only authenticated `GET /v1beta/models` (Gemini) and `GET /v1/models` (NVIDIA) checks returned HTTP 200. No generation/completion was sent, so inference permission, latency, quota, rate limits, and billing behavior are not asserted. The configured NVIDIA model ID is not in the returned catalog. Configured secrets were inspected only for presence; secret values were not printed or written into these docs. See [PROVIDER_CAPABILITIES.md](PROVIDER_CAPABILITIES.md) for details and official references.

## Prioritized findings

### P0 — Before any sensitive or multi-tenant use

- Add authentication, authorization, tenant-scoped ownership checks, and private document access.
- Restrict outbound network access for REST/database connectors; prevent SSRF, redirect credential leakage, and unsafe connection-string use.
- Reconcile ORM and SQL migration schemas; fail loudly on persistence errors and verify storage durability.
- Remove secrets from query strings and exception/log paths; add centralized redaction.

### P1 — Before describing this as RAG or production-capable

- Choose one provider adapter and verify model existence, generation permission, billing/quotas, modality, context, and fallback policy. The configured NVIDIA ID currently fails catalog membership.
- Implement immutable document/version records, parser isolation, background ingestion, chunk provenance, embedding lifecycle, BM25+dense retrieval, RRF, and citation validation.
- Replace fixture-only retrieval evaluation with a versioned labeled dataset and reproducible measured baselines.
- Add request tracing, structured metrics, provider failure/circuit state, and operational readiness checks.

### P2 — Scale and quality

- Add layout-aware PDF/OCR, chart/table extraction, optional reranking, deduplication, incremental reindex, retention/deletion, and workload benchmarking.
- Add rate limits, queue capacity controls, backpressure, and verified deployment/rollback automation.

## Proposed implementation sequence

1. Freeze the audit snapshot and resolve ownership of the pre-existing worktree changes; do not reset or overwrite them.
2. Make DB migrations authoritative and test startup, persistence, backup/restore, and failure semantics against the actual configured DB.
3. Add auth/tenant isolation, connector egress controls, file safety limits, and secret-safe logs before exposing document data to a provider.
4. Select one provider based on verified catalog/model fit and explicitly approved quota/cost policy; implement one adapter and a redacted health check. Keep document generation disabled until a bounded generation smoke test is approved.
5. Add a document/inventory data model, safe parser worker, idempotent ingestion, provenance-preserving text/table/image chunks, and status/retry lifecycle.
6. Add BM25+dense retrieval, RRF, optional reranking behind configuration, citation-constrained answer generation, and adversarial prompt-injection tests.
7. Establish the checked-in v1 evaluation set and offline retrieval baseline before tuning; publish measured values with dataset/model/version identifiers.
8. Add OpenTelemetry-compatible spans/metrics, SLO dashboards/alerts, deployment staging checks, and rollback rehearsals.

No minimal runtime feature was added in this pass: the current unauthenticated access path, persistence mismatch, unbounded connector egress, and unverified NVIDIA model configuration make provider/document integration an unsafe foundation. The deliverable is the design/audit baseline and a versioned synthetic evaluation set.

## Verification status

Provider catalog checks: Gemini HTTP 200; configured `gemini-3.5-flash` listed with generation methods and 1,048,576 input / 65,536 output token limits. NVIDIA HTTP 200; 80 model IDs returned; configured `meta/llama-3.3-70b-instruct` absent. No inference was called. Isolated API suite: **33 passed** using temporary SQLite and data directories outside the repository. Frontend typecheck did not complete within the observed run and was interrupted; no frontend build was run because a Next.js development server is already using this checkout's `.next` directory. `git diff --check` reports only a pre-existing blank line at EOF in `apps/web/src/components/Workspace.tsx`; this audit documentation adds no whitespace errors.
