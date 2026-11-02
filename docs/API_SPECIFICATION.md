# API Specification (Target)

**Status:** Proposed versioned contracts. Current routes in `apps/api/nexus_api/main.py` are legacy/unversioned and lack authentication; do not assume these target contracts are implemented.

All routes require authenticated identity except explicitly public health/readiness endpoints. Tenant scope comes from verified identity. JSON errors use `{ "error": { "code": "...", "message": "...", "request_id": "..." } }`; never echo secrets, raw parser traces or provider bodies.

## Endpoints

| Method and path | Purpose | Success |
|---|---|---|
| `GET /health/live` | Process liveness only. | `200 {status}` |
| `GET /health/ready` | DB, queue and configured adapter readiness without model generation. | `200` or `503` with sanitized component states. |
| `POST /v1/documents` | Create upload session; request includes filename, media type, byte count, SHA-256, idempotency key. | `201 {document_id,version_id,upload_url,expires_at}` |
| `POST /v1/documents/{id}/complete` | Verify uploaded object and enqueue idempotent ingestion. | `202 {job_id,state}` |
| `GET /v1/documents` | Paginated tenant-visible documents. | `200 {items,next_cursor}` |
| `GET /v1/documents/{id}` | Document/version status and safe metadata. | `200` |
| `DELETE /v1/documents/{id}` | Start retention-aware deletion. | `202 {deletion_id,state}` |
| `GET /v1/ingestion-jobs/{id}` | Job progress and sanitized error code. | `200` |
| `POST /v1/query` | Evidence-grounded hybrid retrieval and answer. Body: `{question, document_ids?, top_k?, include_citations?}`. | `200 {answer,citations,grounding,usage,run_id}` |
| `GET /v1/query-runs/{id}` | Authorized run and citation metadata. | `200` |
| `POST /v1/feedback` | Record answer/citation feedback tied to run. | `202` |

## Query response contract

`citations[]` includes `citation_id`, `document_id`, `document_name`, `version_id`, `page`, `region`, optional table coordinates, `chunk_id`, and displayed excerpt. Excerpts must be authorized and length-bounded. `grounding` includes `status` (`grounded`, `insufficient_evidence`, `degraded_retrieval`), cited chunk IDs validated by the server, and retrieval lane availability. `usage` reports model/version, input/output tokens and cost only when provider usage and a current price source are available; otherwise fields are null with a reason. Never return provider credentials or internal object keys.

## Validation and limits

Bound question length, page size, top-k, upload bytes, file count, media pixels/pages, response tokens, and request duration. Use `413` for payload limit, `415` unsupported media, `422` malformed input, `401/403` auth/access, `404` inaccessible or missing resource (avoid ID enumeration), `409` idempotency conflict, `429` quota, `503` dependency unavailable. All errors include request ID and safe retry hint where applicable.

## Legacy compatibility

Current endpoints include `/health`, `/datasets/*`, `/analysis`, `/sql/query`, `/reports/generate`, `/evaluations/*`, `/sources/*`, and `/contact`. Migration should add `/v1` and move clients deliberately. Do not expose legacy routes publicly in a multi-tenant deployment until each has authentication, authorization, limits and ownership checks.
