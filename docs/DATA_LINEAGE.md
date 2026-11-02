# Data Lineage & Provenance Architecture

Transparency and auditability are non-negotiable in enterprise AI. NEXUS maintains a complete Directed Acyclic Graph (DAG) of every data artifact, transformation step, and computational output.

---

## 1. Lineage DAG Model

```text
[Raw Source File / REST API / DB]
               │
               ▼ (Connector Ingest)
       [Dataset Table]
               │
               ├─────────────────────────┐
               ▼ (Cleaning Engine)       ▼ (Semantic Match)
      [Remediated Dataset]        [Unified Join Node]
               │                         │
               ├─────────────────────────┘
               ▼ (LangGraph Planner)
       [Analysis Run Node]
               │
               ├─────────────────────────┐
               ▼                         ▼
   [Statistical Findings]        [Visualizations]
```

---

## 2. Lineage Node Types

1. **`source`**: Identifies the origin URI, filename, API endpoint, or DB connection.
2. **`dataset`**: The registered tabular frame with complete schema metrics (row count, column count, null percentage).
3. **`cleaning`**: Transformation operations applied (outlier clipping, median imputation, duplicate removal).
4. **`model`**: Semantic federated joins between two or more tables with key mapping and confidence scores.
5. **`analysis`**: Specific analytical runs triggered by natural language questions.
6. **`visualization`**: Chart definitions citing exact row filters and aggregate keys.

---

## 3. Querying Lineage

Lineage is accessible programmatically via:
```http
GET /sources/lineage
```
Returns a complete JSON payload containing `nodes` and `edges`, ready for visual DAG rendering in the NEXUS Workspace or export into enterprise data governance catalogs (e.g. Apache Atlas, OpenLineage).
