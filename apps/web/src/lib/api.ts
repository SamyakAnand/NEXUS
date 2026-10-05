export type ColumnProfile = {
  name: string;
  dtype: string;
  semantic_type: "numeric" | "categorical" | "temporal" | "text";
  missing: number;
  missing_pct: number;
  unique: number;
  cardinality: "high" | "low";
  summary?: Record<string, number | null>;
  top_values?: Record<string, number>;
};

export type Dataset = {
  id: string;
  name: string;
  filename: string;
  format: string;
  source: string;
  derived_from?: string;
  transformations?: CleaningOperation[];
  profile: {
    row_count: number;
    column_count: number;
    duplicate_rows: number;
    missing_cells: number;
    columns: ColumnProfile[];
    numeric_columns: string[];
    categorical_columns: string[];
    temporal_columns: string[];
  };
};

export type CleaningOperation = "normalize_missing_values" | "trim_whitespace" | "remove_exact_duplicates";

export type CleaningIssue = {
  operation: CleaningOperation;
  count: number;
  columns: string[];
  title: string;
  description: string;
  recommendation: string;
  confidence: "high" | "medium";
};

export type CleaningPreview = {
  source_dataset_id: string;
  operations: CleaningOperation[];
  changes: { missing_values_normalized: number; text_values_trimmed: number; rows_removed: number };
  before: Dataset["profile"];
  after: Dataset["profile"];
  sample_before: Record<string, unknown>[];
  sample_after: Record<string, unknown>[];
};

export type CleaningApplyResult = { dataset: Dataset; preview: CleaningPreview; reused: boolean };

export type Finding = {
  title: string;
  detail: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  caveat?: string | null;
};

export type TraceStep = {
  name: string;
  status: "completed" | "skipped" | "warning" | "failed";
  duration_ms: number;
  summary: string;
  input_summary: Record<string, unknown>;
  output_summary: Record<string, unknown>;
};

export type Analysis = {
  run_id: string;
  dataset_id: string;
  question: string;
  answer: string;
  tools: string[];
  findings: Finding[];
  profile_summary: { row_count: number; column_count: number; missing_cells: number };
  visualization: null | Visualization;
  visualizations: Visualization[];
  trace: TraceStep[];
  latency_ms: number;
  token_usage: number | null;
  estimated_cost_usd: number | null;
  validation: { passed: boolean; checked: string[]; failed: string[] };
};

export type Visualization = { kind: string; purpose?: string; title: string; x_key: string; y_key: string; series?: string[]; data: Record<string, string | number>[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, cache: "no-store" });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  datasets: () => request<Dataset[]>("/datasets"),
  dataset: (id: string) => request<Dataset>(`/datasets/${encodeURIComponent(id)}`),
  cleaningPlan: (id: string) => request<{ dataset_id: string; issues: CleaningIssue[] }>(`/datasets/${encodeURIComponent(id)}/cleaning`),
  previewCleaning: (id: string, operations: CleaningOperation[]) => request<CleaningPreview>(`/datasets/${encodeURIComponent(id)}/cleaning/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operations }) }),
  applyCleaning: (id: string, operations: CleaningOperation[]) => request<CleaningApplyResult>(`/datasets/${encodeURIComponent(id)}/cleaning/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operations }) }),
  analyze: (datasetId: string, question: string) => request<Analysis>("/analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataset_id: datasetId, question }) }),
  analysis: (runId: string) => request<Analysis>(`/analysis/${encodeURIComponent(runId)}`),
  upload: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Dataset>("/datasets/upload", { method: "POST", body: form });
  },
  report: async (runId: string) => {
    const response = await fetch(`/api/reports/generate?run_id=${encodeURIComponent(runId)}`, { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error("Could not generate this report.");
    return response.text();
  },
  evaluate: () => request<EvaluationReport>("/evaluations/run", { method: "POST" }),
};

export type EvaluationReport = {
  cases: { id: string; question: string; pass: boolean; selected: string[]; expected: string[] }[];
  retrieval: { query: string; recall_at_k: number; precision_at_k: number; reciprocal_rank: number }[];
  metrics: Record<string, number>;
  limitations: string[];
};
