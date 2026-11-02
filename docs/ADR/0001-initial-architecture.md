# ADR 0001: Initial Knowledge Platform Architecture

- **Status:** Proposed
- **Date:** 2026-10-14
- **Decision owners:** Product/security and engineering approval required before production implementation

## Context

Nexus currently provides a tabular analytics prototype with some in-progress persistence and model-provider code. It does not have operational RAG, tenant controls, multimodal document ingestion or a verified model generation path. The goal is an enterprise-grade multimodal knowledge platform without introducing distributed services/Kubernetes absent a measured need.

## Decision

1. Use a modular FastAPI/Pydantic v2 application plus a separately scaled background worker.
2. Use PostgreSQL as system of record and pgvector for dense retrieval; combine lexical BM25 with dense candidates using Reciprocal Rank Fusion.
3. Keep source documents and large derived artifacts in encrypted object storage; persist typed provenance/chunk metadata in PostgreSQL.
4. Isolate parser execution and provider access behind narrow interfaces; declare provider modalities and limits explicitly.
5. Apply tenant isolation at API, repository query and PostgreSQL RLS layers; treat retrieved content as untrusted.
6. Establish a versioned evaluation baseline before tuning. Make reranking optional and evidence-driven.
7. Start without microservices/Kubernetes; add infrastructure only when measured scaling or reliability requires it.

## Alternatives considered

- **Current file/in-memory path as production store:** rejected; process-local state and serverless temporary storage are not durable/shared.
- **Vector-only retrieval:** rejected; lexical search is useful for identifiers, exact phrases and table labels; hybrid recall will be measured.
- **Provider-specific model calls across the app:** rejected; duplicate selectors make failover/capabilities inconsistent and make cost/security controls harder.
- **Immediate microservices/Kubernetes:** deferred; adds operational burden before measured scale requirements.
- **One global database table without tenant policy:** rejected; cross-tenant disclosure risk is unacceptable.

## Consequences

This architecture requires migration reconciliation, worker/object storage, auth and security boundaries before provider-backed document processing. pgvector and lexical search must be benchmarked against the actual corpus. More infrastructure is introduced only when those measurements justify it.

## Open decisions

Identity provider and tenant admin roles; object-store/queue vendor; supported formats and retention; OCR/parser selection; approved Gemini/NVIDIA model and account quotas; embedding model/dimension; regulatory controls and data residency; human review requirements for faithfulness evaluation.
