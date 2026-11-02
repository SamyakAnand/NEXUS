# Multi-Source Data Ingestion Architecture

NEXUS is designed from the foundation to be completely **source-agnostic**. The analyst or business user should never need to care whether their enterprise data originates in a flat file, a paginated REST API, a distributed SQL database, or multiple disparate systems simultaneously.

---

## 1. High-Level System Architecture

```text
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │ Flat Files   │   │  REST APIs   │   │  Databases   │   │ Cloud Wareh. │
 │ CSV, TSV,    │   │  Bearer Auth │   │  PostgreSQL  │   │  Snowflake   │
 │ XLSX, JSON,  │   │  Pagination  │   │  MySQL       │   │  BigQuery    │
 │ Parquet, XML │   │  Backoff 429 │   │  SQLite      │   │  Redshift    │
 └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
        │                  │                  │                  │
        └──────────────────┼──────────────────┴──────────────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │ CONNECTOR PLUGIN LAYER│
               │ (Standard Base Class) │
               └───────────┬───────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │    DATA INGESTION     │
               │ Type coercion & ingest│
               └───────────┬───────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │    DATA PROFILING     │
               │ Types, Nulls, Entropy │
               └───────────┬───────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │  DATA QUALITY ENGINE  │
               │ Outliers, Duplicates  │
               └───────────┬───────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │    CLEANING ENGINE    │
               │ Imputation, Clipping  │
               └───────────┬───────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │    SEMANTIC MODEL     │
               │ Fact/Dim, Joins, DAG  │
               └───────────┬───────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │  AI REASONING & STATS │
               │ LangGraph, CIs, Tests │
               └───────────────────────┘
```

---

## 2. Ingestion Stages

### Stage 1: Source Discovery & Connector Dispatch
When a source is provided (file upload, API URL, or connection string), the Connector Factory selects the appropriate connector subclass. The connector inspects authentication, executes connectivity handshakes, and returns an initial schema preview without loading the full volume into memory.

### Stage 2: Ingestion & Buffer Normalization
Data is streamed and buffered into normalized columnar structures (leveraging Apache Arrow and Pandas memory representations). Text encodings (UTF-8, Latin-1) and delimiters (`,`, `\t`, `;`, `|`) are discovered automatically.

### Stage 3: Statistical & Semantic Profiling
Every column is scanned to compute:
- **Data type & Semantic class**: Numeric measure, temporal timestamp, categorical dimension, or unstructured text.
- **Cardinals & Entropy**: Cardinality, unique count, null ratio.
- **Parametric summaries**: Min, max, mean, standard deviation, quartiles (25%, 50%, 75%).
- **Smart Question Generation**: Formulates tailored analytical prompts mapped directly to the dataset's metrics.

### Stage 4: Cleaning & Remediation
Deterministic remediation routines:
- Missing value imputation (median for skewed numerics, mode for categoricals).
- Winsorization and outlier clipping via Interquartile Range (IQR).
- String whitespace trimming and duplicate deduplication.

### Stage 5: Semantic Entity Resolution
Cross-source schemas are evaluated for candidate entity relationships (e.g. matching `customer_id` across sales CSV and CRM REST API) using synonym clustering and value-set overlap.

### Stage 6: Autonomous Analytical Execution
The question and schema-bound semantic context are dispatched to the LangGraph execution graph, utilizing high-speed free LLM inference (Groq Llama-3.3-70B, Google Gemini Flash, or Ollama) with deterministic statistical verification.
