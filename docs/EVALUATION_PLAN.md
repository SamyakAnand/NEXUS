# Evaluation Plan

## Versioned dataset

The initial synthetic gold set is [v1/cases.jsonl](../apps/api/evals/datasets/v1/cases.jsonl), version `nexus-rag-v1`. It contains hand-authored questions and evidence identifiers covering prose, table cells, charts, mixed evidence, insufficient evidence, and prompt injection. It is a fixture, not a measured benchmark or representative user dataset. Changes require a new version or an explicit reviewed correction with changelog.

## Baseline protocol

Before tuning, freeze code commit, dataset version, parser/OCR versions, embedding model/version/dimension, lexical configuration, `k0`, top-k, reranker and prompt/model versions. Run with deterministic seeds and temperature zero where supported. Record hardware, concurrency, warm/cold state and dataset digest. Keep offline retrieval results distinct from provider-backed generation results. Do not substitute guessed/estimated values for measurements.

No retrieval baseline is reported yet because the current repository has no operational RAG retriever. Existing `evaluation.py` computes tool routing and fixed metadata-fixture ranking metrics; that result is not an RAG baseline.

## Metrics

| Metric | Definition / aggregation |
|---|---|
| Recall@5 | Relevant evidence retrieved in top 5 / all known relevant evidence; macro-average across queries. |
| MRR | Mean reciprocal rank of first relevant evidence. |
| nDCG@10 | Graded relevance discounted by rank, normalized by ideal ranking. |
| Context precision | Relevant retrieved evidence / all retrieved evidence in the generation context. |
| Faithfulness | Claim-level answer support by cited/retrieved evidence; report evaluator method and human-audited subset. |
| Answer relevance | Whether response addresses the question under a documented rubric. |
| Citation accuracy | Correct, authorized cited source/page/region and support rate. |
| p50/p95 latency | End-to-end plus parse/retrieval/rerank/generation stage latencies; report load and sample count. |
| Token usage / cost | Provider-reported tokens and contemporaneous price source; null when unavailable. |
| Ingestion throughput | Successfully indexed bytes/pages/documents per second with corpus mix and concurrency. |
| Provider failures/recovery | Timeout/429/5xx/auth rate, circuit open time, retry count, and recovery time. |

## Run artifacts and acceptance targets

Each run writes a JSON report containing dataset digest, code SHA, config versions, per-query ranked evidence, metric values, failures, latency samples and cost availability. Evaluation targets are proposed gates, not achieved results: Recall@5 ≥ 0.85, MRR ≥ 0.70, nDCG@10 ≥ 0.75, citation accuracy ≥ 0.95, and no unauthorized evidence in adversarial tests. Review targets after a human-labeled pilot set. Faithfulness and answer quality gates require human audit to calibrate automated judges.

## Test strategy

- Unit: parser blocks/provenance, chunk IDs, RRF, ranking tie-breaks, ACL filters, adapter retry/circuit policy, citation validator, deletion.
- Integration: Postgres migrations/RLS, object-store lifecycle, lexical/vector search, idempotent job retry, provider mock.
- Security: cross-tenant access, SSRF redirects, prompt injection, secret redaction, malformed/decompression-bomb files, SQL migration failure.
- Regression: pinned v1 dataset with per-query ranked evidence and deterministic arithmetic checks.
- Load/failure: bounded queue saturation, provider timeout/rate-limit recovery, DB unavailable, worker restart and backup restore.

## Reporting rules

Publish measured outcomes separately from targets and estimates. State sample size, confidence intervals where appropriate, omissions, provider/model and exact dataset/code versions. Do not make production-readiness, throughput or cost-saving claims from synthetic fixtures.
