# Deployment Plan

**Status:** Proposed staged plan; no deployment is claimed or verified.

## Environments and dependencies

- Local: Docker Compose for API, web, PostgreSQL/pgvector and optional Redis; synthetic data only.
- CI: migrations + API/unit/integration/security checks, frontend typecheck/build, dependency/SBOM checks.
- Staging: managed PostgreSQL with backups, encrypted object store, separate worker identity, secret manager, approved provider project, egress policy, OTel backend.
- Production: promote immutable image/config after staging evaluation, access-control, restore and rollback gates.

The current `docker-compose.yml` is a developer stack. Current Vercel routing and `/tmp` storage are not a durable document-processing deployment. The DB schema mismatch must be resolved before using provisioned PostgreSQL.

## Release gates

1. Migration starts against an empty DB and upgrades the current schema; ORM and migration definitions match.
2. Backup and restore rehearsal succeeds; app fails readiness rather than silently falling back to a different DB.
3. Tenant authorization and negative isolation tests pass; connector SSRF and secret-redaction checks pass.
4. Worker parser resource limits and job retry/idempotency tests pass.
5. Evaluation baseline is recorded on the versioned set; no fabricated metrics; targets and actuals are separate.
6. Provider and object-storage cost, quotas, data handling/retention terms are explicitly approved.
7. Staging smoke test verifies upload → job → ready → hybrid retrieval → valid citations → deletion.
8. Rollback path is rehearsed for app image and compatible schema; alerts and runbook ownership are assigned.

## Migrations and rollback

Use expand/migrate/contract. Apply additive schema, deploy compatible code, backfill resumably, verify counts/checksums, switch reads, then remove obsolete fields only after a compatibility window. For a failed release, roll back the app to the prior compatible image; use a compensating migration for schema/data changes. Do not run destructive down migrations automatically. Back up before each migration and retain restore point per policy.

## Observability and operations

Readiness covers database, queue and object store, but provider generation is not probed by routine health checks. Synthetic provider smoke requests are explicit controlled jobs with a bounded model/output and tracked cost. Alert on ingestion failures/age, queue depth, retrieval lane failure, citation validation failure, provider 429/5xx/circuit-open, DB pool saturation, p95 latency, storage quota and deletion SLA. Runbooks cover provider disable/fallback, worker pause/retry, data restore, key rotation and incident containment.
