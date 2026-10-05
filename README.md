# NEXUS — Autonomous Data Analyst

NEXUS is a portfolio-grade analytics prototype that profiles real tabular data, plans analysis from a user's question, runs deterministic Python/SQL tools, validates the results, and returns evidence-backed findings with a visible trace. It is designed to keep raw records out of model context.

> **Current scope:** The first local build supports CSV, JSON, and XLSX uploads, a deterministic synthetic sales dataset, dataset profiling, analysis, anomaly checks, chart-ready output, reports, run traces, and a small evaluation suite. LLM synthesis, semantic embeddings, multi-user auth, persistent PostgreSQL repositories, and production sandbox isolation require configuration/next-phase work and are labeled in the UI. No claim is made that generated business findings are externally validated.

## Architecture

```mermaid
flowchart LR
  U[Analyst] --> W[Next.js workspace]
  W --> API[FastAPI]
  API --> I[Validated ingestion]
  I --> P[Profiler]
  P --> PL[Question planner]
  PL --> T{Select tools]
  T --> PY[Pandas / SciPy analysis]
  T --> SQL[Read-only SQL on isolated frame]
  T --> A[Anomaly detection]
  PY --> V[Result validation]
  SQL --> V
  A --> V
  V --> S[Evidence-backed synthesis]
  S --> R[Charts, report, trace]
  R --> W
```

The execution flow is conditional: the question planner chooses relevant tools, deterministic code performs calculations, validation checks whether evidence is usable, then the response is assembled with source columns and caveats. When installed, LangGraph runs the profile → plan → conditional tool lane → execute → validate → synthesize state graph. A deterministic local fallback keeps the demo usable if that optional runtime is unavailable. No LLM is called by the current local path.

## Run locally

Requirements: Python 3.11+, Node.js 20+, npm.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r apps/api/requirements.txt
Copy-Item .env.example .env
uvicorn nexus_api.main:app --app-dir apps/api --reload --port 8000
```

In a second terminal:

```powershell
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000. API docs are at http://localhost:8000/docs.

## Docker

```powershell
docker compose up --build
```

The web app is served on port 3000 and FastAPI on port 8000. PostgreSQL with pgvector and Redis are provisioned, and `database/init.sql` creates the production-shaped schema. The current API registry and run store still use files under `data/`; it does not yet write to PostgreSQL or Redis.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Service and capability status |
| POST | `/datasets/upload` | Validate and ingest CSV, JSON, or XLSX |
| GET | `/datasets` | List datasets |
| GET | `/datasets/{id}` | Schema and data profile |
| POST | `/analysis` | Run a question against a dataset |
| GET | `/analysis/{id}` | Fetch a run |
| GET | `/analysis/{id}/trace` | Inspect tool trace |
| GET | `/analysis/{id}/insights` | Return findings and evidence |
| POST | `/reports/generate` | Generate Markdown report |
| GET | `/evaluations` | List evaluation cases and recent result |
| POST | `/evaluations/run` | Execute deterministic fixture evaluation |

## Evaluation

The starter evaluation suite measures retrieval Recall@K, Precision@K, and MRR on small, deterministic metadata retrieval examples. Analysis cases check tool routing and calculation invariants against generated fixture data. Latency is measured at runtime; token usage and cost are reported as unavailable until a model provider is configured. No unmeasured performance metrics are published.

## Security and data handling

- Uploads have an explicit size ceiling and allowlisted extensions; parse failures are rejected.
- The local SQL tool executes one read-only query against a transient SQLite copy, with table/column identifiers drawn from the inspected schema. It does not expose filesystem or arbitrary code execution.
- Uploaded data remains local in `data/uploads/` in the development setup. Do not use this prototype for sensitive data.
- Production deployment still needs an isolated worker/container, auth/tenant controls, a durable database, retention policy, rate limits, and managed secret storage.
- LLM API keys are server-only. No LLM key is required for deterministic analysis.

## Resume bullets (evidence-based)

- Built a full-stack analytics workflow with Next.js, FastAPI, Pandas, and conditional tool selection for dataset profiling, statistical analysis, anomalies, and evidence-linked responses.
- Added an observable analysis trace with tool inputs/outputs, validation status, and measured wall-clock latency; token/cost metrics remain unavailable without a model provider.
- Implemented safe local read-only SQL execution and deterministic evaluation metrics for retrieval ranking and analysis routing.

## Roadmap

1. Add LangGraph conditional graph runtime and model-provider structured tool calling.
2. Persist users, datasets, sessions, runs, insights, reports, and evaluations in PostgreSQL; add pgvector retrieval and Redis caching.
3. Add forecasting/model evaluation, sandboxed worker execution, authentication, and production rate limits.
4. Add export PDF, mobile QA, and deployment CI gates.
