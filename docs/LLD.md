# Low-Level Design — Nexus Intelligence Engine

**Status:** Proposed implementation detail. Existing modules listed in this document are reuse candidates, not proof that target behavior exists.

## Python package boundaries

```text
apps/api/nexus_api/
  api/                 routers, auth dependencies, request/response models
  auth/                identity, tenant context, policy checks
  ingestion/           job service, parser registry, normalization, chunking
  retrieval/           lexical, dense, RRF, reranking, evidence packing
  providers/           protocol + Gemini/NVIDIA adapters + redaction
  persistence/         SQLAlchemy models, repositories, transactions
  observability/       trace context, structured logging, metrics
  evaluation/           dataset loader, deterministic metrics, report writer
```

Reuse candidate modules: `profiling.py`, `cleaning.py`, and selected connector/semantic utilities after their security and behavior are reviewed. Avoid importing API-global mutable dictionaries as persistence.

## Ingestion pipeline

1. API validates authenticated tenant, extension/MIME/signature, compressed and expanded size, and idempotency key; stores original under opaque tenant-scoped object key.
2. A transaction creates `document`, `document_version`, and `ingestion_job` records. Unique key `(tenant_id, content_sha256, pipeline_version)` makes retries safe.
3. Worker claims a job with a lease, emits trace/job attempt, and selects a parser by verified format.
4. Parser emits typed blocks: text, table, chart/image, page/region, source offsets, page number, bounding box, confidence, and parser version. No arbitrary network access or host filesystem access.
5. Normalizer preserves table headers/cells and chart captions/series as structured evidence. OCR output retains confidence and the original region reference.
6. Chunker emits stable block/chunk IDs and token-bounded text; no cross-tenant chunk merges. Store text, modality, provenance and content hash.
7. Embedding adapter emits a model/version/dimension-tagged vector. Validate vector length/finiteness before insert. Retry transient failures; permanent parse/format errors become terminal with sanitized error codes.
8. Commit chunks/index state and mark version ready atomically where possible; update searchable status only after both lexical and dense indexes are available or explicitly report partial indexing.

## Query path

1. Validate query length, corpus selection and caller quota. Build tenant/document ACL predicates from authenticated context only.
2. Run lexical top-k and dense top-k independently with timeouts. A failed lane degrades to the healthy lane and records the lane status.
3. Deduplicate candidates by chunk ID and compute `RRF(d) = Σ_i 1 / (k0 + rank_i(d))`, with versioned `k0` and deterministic tie-break.
4. Optionally rerank only top-N authorized candidates using a configured cross-encoder; do not send data to an unapproved service.
5. Pack evidence under model context budget while preserving source/page/region identity. Send instructions separately from evidence and label evidence as untrusted.
6. Validate every cited chunk ID against the retrieved authorized set. If citations are missing/invalid, return a grounded refusal/insufficient-evidence response rather than fabricate sources.
7. Persist query/run metadata, ranks, model/prompt/index versions, timings, token usage and estimated cost; do not persist secrets or unnecessary raw prompts.

## Provider adapter contract

`ProviderCapabilities` declares input modalities, output modalities, context limits, structured output, embeddings/reranking support, and whether limits are catalog-derived, documentation-derived, or account-observed. Adapter methods accept normalized messages and bounded media references; return response, usage, model version, latency and sanitized error category. Provider selection is explicit configuration, not key-presence priority. Credentials are read from secret storage/environment only at runtime and are redacted from URLs, exceptions and telemetry.

## Failure policy

| Failure | Behavior |
|---|---|
| Parser invalid/unsupported | Terminal job state with sanitized error; keep original according to retention policy. |
| Worker lost | Lease expires; idempotent retry resumes from last committed stage. |
| Embedding outage | Retry bounded with jitter; keep version non-searchable or lexical-only with explicit partial status. |
| BM25 lane outage | Continue dense lane; include degraded retrieval metadata. |
| Vector lane outage | Continue lexical lane; do not claim hybrid retrieval. |
| Reranker unavailable | Continue fused order if policy allows; record rerank skipped. |
| Generation timeout/open circuit | Return citations/evidence plus deterministic extractive response or explicit unavailable response; no unverified provider fallback. |
| Invalid citations | Reject generated answer and return insufficient-evidence result. |

## Idempotency and concurrency

Use database uniqueness for idempotency, transaction boundaries for version/job transitions, bounded worker concurrency, lease renewal and dead-letter/terminal job state. API request idempotency keys are scoped to tenant and route. Ingestion retries must not create duplicate chunks or charge repeated embedding work when cached outputs with matching model/pipeline version are available.
