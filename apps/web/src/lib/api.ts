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

export type SuggestedQuestion = {
  question: string;
  category: string;
  badge: string;
  explanation: string;
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
    suggested_questions?: SuggestedQuestion[];
  };
};

export type DatasetPreview = {
  dataset_id: string;
  name: string;
  total_rows: number;
  offset: number;
  limit: number;
  columns: { name: string; dtype: string; semantic_type: string }[];
  rows: Record<string, unknown>[];
  suggested_questions: SuggestedQuestion[];
};

export type CleaningOperation =
  | "normalize_missing_values"
  | "trim_whitespace"
  | "remove_exact_duplicates"
  | "clip_outliers"
  | "impute_missing_median"
  | "impute_missing_mode"
  | "drop_high_missing_columns";

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
  changes: {
    missing_values_normalized: number;
    text_values_trimmed: number;
    rows_removed: number;
    outliers_clipped?: number;
    values_imputed?: number;
    columns_dropped?: number;
  };
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

export type Visualization = {
  kind: string;
  purpose?: string;
  title: string;
  x_key: string;
  y_key: string;
  category_key?: string;
  series?: string[];
  data: Record<string, string | number>[];
};

export type DatasetColumnSummary = {
  name: string;
  dtype: string;
  semantic_type: "numeric" | "categorical" | "temporal" | "text";
  missing: number;
  missing_pct: number;
  unique: number;
  cardinality: "high" | "low";
  summary?: Record<string, number | null>;
  top_values?: Record<string, number>;
  is_constant: boolean;
  has_outliers: boolean;
};

export type DataQualityReport = {
  completeness_score: number;
  duplicate_rows: number;
  duplicate_pct: number;
  missing_cells: number;
  missing_cells_pct: number;
  constant_columns: string[];
  high_missing_columns: string[];
  outlier_columns: string[];
  warnings: string[];
  recommendations: string[];
};

export type CorrelationPair = {
  column_a: string;
  column_b: string;
  correlation: number;
  strength: "strong_positive" | "moderate_positive" | "weak" | "moderate_negative" | "strong_negative";
};

export type DatasetOverview = {
  dataset_id: string;
  name: string;
  row_count: number;
  column_count: number;
  numeric_columns: string[];
  categorical_columns: string[];
  temporal_columns: string[];
  columns: DatasetColumnSummary[];
  quality: DataQualityReport;
  correlations: CorrelationPair[];
  summary_narrative?: string | null;
  suggested_questions: SuggestedQuestion[];
  visualizations: Visualization[];
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
  overview?: DatasetOverview | null;
  suggested_followups?: string[];
  degraded_mode?: boolean;
  data_quality_warnings?: string[];
  trace: TraceStep[];
  latency_ms: number;
  token_usage: number | null;
  estimated_cost_usd: number | null;
  model_name?: string | null;
  validation: { passed: boolean; checked: string[]; failed: string[] };
};

export type SqlQueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  duration_ms: number;
};

export type SourceRelationship = {
  source_a_id: string;
  source_a_column: string;
  source_b_id: string;
  source_b_column: string;
  relationship_type: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
  confidence: number;
  overlap_ratio: number;
  sample_matching_keys: string[];
};

export type TableClassification = {
  dataset_id: string;
  dataset_name: string;
  classification: "fact" | "dimension" | "hybrid";
  primary_keys: string[];
  measures: string[];
  attributes: string[];
  temporal_keys: string[];
  rationale: string;
};

export type LineageNode = {
  id: string;
  type: string;
  label: string;
  metadata: Record<string, unknown>;
};

export type LineageEdge = {
  source: string;
  target: string;
  label?: string;
};

export type LineageGraph = {
  nodes: LineageNode[];
  edges: LineageEdge[];
};

export type APIConnectPayload = {
  name: string;
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  auth_type?: "none" | "bearer" | "api_key" | "basic";
  auth_token?: string;
  auth_header?: string;
  params?: Record<string, string>;
  nested_records_path?: string;
  pagination_type?: "none" | "page" | "offset_limit" | "cursor" | "next_url";
  page_param?: string;
  limit_param?: string;
  page_size?: number;
  max_pages?: number;
  max_records?: number;
};

export type DBConnectPayload = {
  name: string;
  connection_url: string;
  table_name?: string;
  query?: string;
  max_records?: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, cache: "no-store" });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<APIHealth>("/health"),
  datasets: () => request<Dataset[]>("/datasets"),
  dataset: (id: string) => request<Dataset>(`/datasets/${encodeURIComponent(id)}`),
  overview: (id: string) => request<DatasetOverview>(`/datasets/${encodeURIComponent(id)}/overview`),
  previewData: (id: string, limit = 50, offset = 0) =>
    request<DatasetPreview>(`/datasets/${encodeURIComponent(id)}/preview?limit=${limit}&offset=${offset}`),
  cleaningPlan: (id: string) =>
    request<{ dataset_id: string; issues: CleaningIssue[] }>(`/datasets/${encodeURIComponent(id)}/cleaning`),
  previewCleaning: (id: string, operations: CleaningOperation[]) =>
    request<CleaningPreview>(`/datasets/${encodeURIComponent(id)}/cleaning/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations }),
    }),
  applyCleaning: (id: string, operations: CleaningOperation[]) =>
    request<CleaningApplyResult>(`/datasets/${encodeURIComponent(id)}/cleaning/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations }),
    }),
  analyze: (datasetId: string, question: string) =>
    request<Analysis>("/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_id: datasetId, question }),
    }),
  analysis: (runId: string) => request<Analysis>(`/analysis/${encodeURIComponent(runId)}`),
  upload: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Dataset>("/datasets/upload", { method: "POST", body: form });
  },
  previewApi: (payload: APIConnectPayload) =>
    request<any>("/sources/preview-api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  connectApi: (payload: APIConnectPayload) =>
    request<Dataset>("/sources/connect-api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  previewDb: (payload: DBConnectPayload) =>
    request<any>("/sources/preview-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  connectDb: (payload: DBConnectPayload) =>
    request<Dataset>("/sources/connect-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  relationships: () =>
    request<{ relationships: SourceRelationship[]; classifications: TableClassification[] }>("/sources/relationships"),
  lineage: () => request<LineageGraph>("/sources/lineage"),
  reconcile: (payload: { source_a_id: string; source_b_id: string; join_key: string; compare_columns?: string[] }) =>
    request<any>("/sources/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  report: async (runId: string) => {
    const response = await fetch(`/api/reports/generate?run_id=${encodeURIComponent(runId)}`, {
      method: "POST",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not generate this report.");
    return response.text();
  },
  querySql: (datasetId: string, query: string) =>
    request<SqlQueryResult>("/sql/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_id: datasetId, query }),
    }),
  contact: (payload: { name: string; email: string; subject: string; message: string }) =>
    request<{ status: string; inquiry_id: string; message: string }>("/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  evaluate: () => request<EvaluationReport>("/evaluations/run", { method: "POST" }),
};

export type EvaluationReport = {
  cases: { id: string; question: string; pass: boolean; selected: string[]; expected: string[] }[];
  retrieval: { query: string; recall_at_k: number; precision_at_k: number; reciprocal_rank: number }[];
  metrics: Record<string, number>;
  limitations: string[];
};

export type APIHealth = {
  status: string;
  datasets?: number;
  database?: string;
  capabilities?: string[];
  model_provider?: string;
  active_model?: string;
  langgraph_runtime?: string;
};

export type ProductLineage = LineageGraph;

export type SourcePreview = {
  source_type: string;
  record_count: number;
  fields: { name: string; dtype: string; sample_values: unknown[]; nullable: boolean }[];
  sample_records: Record<string, unknown>[];
};

export type LocalSession = Pick<Analysis, "run_id" | "dataset_id" | "question" | "answer" | "latency_ms" | "model_name" | "findings"> & {
  created_at: string;
};
