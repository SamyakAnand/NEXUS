# Prioritized Implementation Backlog

This backlog follows the repository audit and is ordered by dependency and risk. Items are proposals; no production readiness is implied.

## P0 — Security and durable data foundation

1. Resolve current worktree changes and define ownership/review points; retain all existing edits.
2. Reconcile `database/init.sql`, ORM models and migration tooling; remove silent SQLite fallback and swallowed DB write errors.
3. Add identity integration, tenant membership/roles, route authorization, repository scoping and PostgreSQL RLS.
4. Restrict REST/database connector egress; block private/metadata addresses and redirects; move credentials to a secret store and redact all errors/logs.
5. Isolate parsing; enforce upload, decompression, page, pixel, time and memory budgets; define retention/deletion lifecycle.

## P1 — RAG vertical slice

6. Create document/version/job/chunk/provenance models and idempotent ingestion state machine.
7. Implement safe text/PDF and tabular parsing, retaining page, table, chart/image and region provenance; add OCR only with selected parser and licenses.
8. Add BM25 and dense indexing with versioned embeddings; implement tenant-filtered retrieval and RRF.
9. Implement citation-constrained grounded answers through one explicit capability-checked model adapter; require policy/cost/quota approval first.
10. Add v1 evaluation runner and report output; establish actual baseline before optimizing.

## P1 — Operations and verification

11. Add OpenTelemetry tracing, structured secret-safe logging, request/job/provider metrics and health/readiness.
12. Add CI migration/integration/security gates, dependency checks, staging pipeline, backup restore and rollback runbooks.
13. Add API versioning, upload/query quotas, rate limits and bounded worker concurrency.

## P2 — Quality and scale

14. Add optional cross-encoder reranking only if v1 measurements improve quality within latency/cost budget.
15. Expand evaluation with human-labeled real-but-approved documents, adversarial prompts, language/layout variation and regression cases.
16. Benchmark larger corpora, storage/index partitioning, caching and queue technology; adopt extra infrastructure only on measured need.
