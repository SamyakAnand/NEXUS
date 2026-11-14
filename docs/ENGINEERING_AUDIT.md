# NEXUS Engineering Audit

**Reviewed:** 2026-11-14
**Scope:** Current checkout source, configuration, tests, and CI. This is a code review, not a penetration test, production database verification, or load benchmark.

## Executive summary

NEXUS is a Next.js 16 / React 19 frontend backed by a single FastAPI application and a deterministic Pandas analytics engine. It already supports tabular uploads, profiling, cleaning previews and derived copies, SQL over an in-memory SQLite snapshot, statistical analysis, charts, reports, evaluation endpoints, REST/SQL connectors, and semantic join/lineage utilities. The model integration now targets a single Euron EURI provider, but live inference awaits a rotated credential; the analysis planner remains primarily keyword based and uses deterministic column fallbacks. LangGraph, PostgreSQL, Redis, and pgvector packages/configuration do not by themselves establish runtime integrations.

The backend currently combines routing, file and dataframe handling, persistence, startup restoration, reporting, and connector operations in `apps/api/nexus_api/main.py` (still a large monolithic module). Process globals (`datasets`, `frames`, `runs`) are the request-time source of truth. Files and a JSON manifest are used for recovery. Database initialization and key writes now propagate failures instead of silently switching databases or publishing uncommitted resources; other persistence and storage design gaps remain. Multiple instances do not share the in-memory dataset state.

The application has no authentication or ownership model. Dataset identifiers are globally accessible. Uploads are synchronously parsed and stored under a digest-derived filename, which permits same-content collisions and does not provide private object storage. URL and database connectors accept user-controlled destinations/credentials and need SSRF and secret-handling review before exposure. The analytical SQL guard is regex based, though execution uses a transient SQLite database with `query_only`; it is not a structural SQL validator. The current evaluation includes fixed routing/retrieval fixtures and does not establish analytical accuracy or performance.

## Current architecture and implemented behavior

- **Web:** `apps/web/src` contains the existing product UI and API client. The requested scope does not call for a visual redesign.
- **API:** `main.py` defines routes and global state; `schemas.py` contains Pydantic v2 request/response models.
- **Analytics:** `analysis.py`, `profiling.py`, `cleaning.py`, and `stats.py` perform deterministic Pandas/SciPy/scikit-learn work. `analysis.py` classifies intents using string checks and selects a default numeric or categorical field when it cannot resolve one explicitly.
- **Connectors:** `connectors.py` implements file, REST, and SQL source handling; `semantic.py` includes cross-source matching, classification, conflict, and lineage utilities.
- **Persistence:** `db.py` has SQLAlchemy models for datasets, runs, reports, and contact inquiries. Runtime also writes files and restores all datasets into memory at startup. `database/init.sql` separately declares users, sessions, tool calls, findings, evaluations, and embeddings, but these are not equivalent to the ORM model set.
- **Infrastructure:** Compose provisions PostgreSQL/pgvector and Redis. The API does not enqueue jobs to Redis; the shown API routes execute analysis synchronously. Docker starts the API directly, and Vercel routes the API and web app.
- **Tests/CI:** Pytest covers API flows and several numerical/connector behaviors. CI runs pytest plus frontend typecheck/build. There is no configured Ruff gate, migration check, PostgreSQL integration service, or Redis worker test in the inspected workflow.

## Critical defects and risks

1. **Persistence can fail silently.** `db.py:init_db` falls back to SQLite; `_register`, analysis-run persistence, and report persistence swallow exceptions in `main.py`.
2. **State is process-local.** Dataset frames and runs are loaded into module globals; another instance cannot reliably access uploads or runs created elsewhere.
3. **Storage is local and not production durable.** Vercel uses `/tmp/nexus-data`; the manifest and file paths are not shared object storage. Startup rebuilds dataframes by reparsing files.
4. **No tenant boundary.** Routes do not authenticate users or scope dataset/run/report access by owner. Identifiers alone grant access.
5. **Database DDL and ORM diverge.** `database/init.sql` declares UUID-based columns such as `source_filename` / `file_format`; ORM expects string IDs, `filename`, `format`, `storage_path`, and different run fields. Docker's first-run DDL can conflict with application expectations. `create_all` is not a migration strategy.
6. **Upload validation is incomplete.** The API limits request bytes and suffixes, but the suffix set includes formats beyond the stated CSV/XLSX/JSON core. It does not validate content signatures or XLSX decompression/resource limits before parsing.
7. **Connector egress and credentials need controls.** Caller-controlled REST URLs, redirects, connection strings, headers, and authentication values require host policy, redirect policy, timeouts, and redaction.
8. **SQL validation is lexical.** Regex validation can be bypass-prone; result rows are bounded after query execution, and no database statement timeout is configured.
9. **Planner abstention is weak.** `_choose_metric` and `_choose_group` fall back to the first available matching/default field, allowing unsupported or ambiguous questions to return arbitrary results.
10. **Operational claims exceed evidence.** Health reports `langgraph_runtime: active`; Redis workers and durable jobs are not wired into the runtime. Current evaluation fixtures do not measure numerical correctness, reproducibility across versions, latency distributions, or memory.

## Recommended target and migration sequence

Keep the frontend and a modular-monolith deployment. Introduce explicit configuration and lifespan-managed resources first. Move HTTP routes into versioned routers while keeping existing paths/contracts compatible. Establish one authoritative SQLAlchemy 2.x model set and Alembic migrations, then repositories and service functions. Migrate dataset metadata, versions, sessions, runs, findings, evidence, and reports into durable storage with transactions and user ownership. Add a storage interface with local development implementation and private object storage for deployed use. Remove process-global metadata/run state; use bounded per-request frame loading or worker-managed analytical artifacts.

Implement authentication before exposing uploaded data in a multi-user deployment. Require owner scoping for every dataset-derived resource, and make local demo identity explicit and unavailable in production. Add upload content validation and quotas, connector egress restrictions, structured safe errors, and a structurally parsed SQL allowlist. Add durable jobs only when the chosen queue and worker deployment are wired end to end; Redis currently has no runtime role.

For analytical behavior, introduce typed intent/plan contracts and schema validation before replacing the current routing. Ambiguous plans should ask for clarification. Add independent numerical validators and evidence records, then benchmark forecasts/anomalies against deterministic baselines. Replace fixture-only evaluation with versioned golden datasets/questions and reproducible CLI/CI runs. Add performance tests only with disclosed machine and dataset conditions.

## Stage status

- **Audit:** completed from repository inspection.
- **Database failure semantics:** implemented for engine creation, schema initialization, startup database reads, dataset registration, analysis-run persistence, and report persistence. Failures now propagate instead of silently substituting SQLite or publishing a newly registered dataset/run in process memory.
- **Model provider consolidation:** backend now has a single Euron EURI adapter and deterministic fallback; legacy provider selectors and the unused duplicate gateway were removed. The supplied credential was sent once to a similarly named but incorrect Euri G2 host during the first smoke attempt, then removed locally. Revoke and replace it before live Euron inference; no successful generation is verified.
- **Remaining phases:** PostgreSQL model/migration reconciliation, object storage, authentication/ownership, modular route/service split, typed planner/abstention, background jobs, analytical validation, expanded evaluation, and performance/deployment gates remain unimplemented and must not be represented as complete.

## Baseline verification

The Windows `python` command is unavailable in the current PowerShell session; `py` is available. Final API suite after DB and model-provider changes: **41 passed**. The suite emitted 26,257 warnings, primarily deprecated `Timestamp.dayofyear` usage in demo dataset generation. Frontend typecheck and production build passed; the later edits were backend-only and documentation. Five database-failure regression tests and three Euri-provider tests are included. No PostgreSQL or Redis integration test was run; local tests use SQLite. Live Euron inference remains unverified pending a rotated key.
