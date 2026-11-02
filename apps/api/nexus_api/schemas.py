from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, model_validator


class AnalysisRequest(BaseModel):
    dataset_id: str
    question: str = Field(min_length=3, max_length=1000)
    requested_visualization: Literal["auto", "line", "bar", "scatter", "area", "table"] = "auto"


CleaningOperation = Literal[
    "normalize_missing_values",
    "trim_whitespace",
    "remove_exact_duplicates",
    "clip_outliers",
    "impute_missing_median",
    "impute_missing_mode",
    "drop_high_missing_columns",
]


class CleaningRequest(BaseModel):
    operations: list[CleaningOperation] = Field(min_length=1, max_length=7)

    @model_validator(mode="after")
    def operations_are_unique(self):
        if len(self.operations) != len(set(self.operations)):
            raise ValueError("Each cleaning operation can only be selected once.")
        return self


class Finding(BaseModel):
    title: str
    detail: str
    confidence: Literal["high", "medium", "low"]
    evidence: list[str]
    caveat: str | None = None


class TraceStep(BaseModel):
    name: str
    status: Literal["completed", "skipped", "warning", "failed"]
    duration_ms: float
    summary: str
    input_summary: dict[str, Any] = Field(default_factory=dict)
    output_summary: dict[str, Any] = Field(default_factory=dict)


class DatasetColumnSummary(BaseModel):
    name: str
    dtype: str
    semantic_type: Literal["numeric", "categorical", "temporal", "text"]
    missing: int
    missing_pct: float
    unique: int
    cardinality: Literal["high", "low"]
    summary: dict[str, Any] | None = None
    top_values: dict[str, int] | None = None
    is_constant: bool = False
    has_outliers: bool = False


class DataQualityReport(BaseModel):
    completeness_score: float
    duplicate_rows: int
    duplicate_pct: float
    missing_cells: int
    missing_cells_pct: float
    constant_columns: list[str] = Field(default_factory=list)
    high_missing_columns: list[str] = Field(default_factory=list)
    outlier_columns: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class CorrelationPair(BaseModel):
    column_a: str
    column_b: str
    correlation: float
    strength: Literal["strong_positive", "moderate_positive", "weak", "moderate_negative", "strong_negative"]


class DatasetOverview(BaseModel):
    dataset_id: str
    name: str
    row_count: int
    column_count: int
    numeric_columns: list[str]
    categorical_columns: list[str]
    temporal_columns: list[str]
    columns: list[DatasetColumnSummary]
    quality: DataQualityReport
    correlations: list[CorrelationPair] = Field(default_factory=list)
    summary_narrative: str | None = None
    suggested_questions: list[dict[str, str]] = Field(default_factory=list)
    visualizations: list[dict[str, Any]] = Field(default_factory=list)


class AnalysisPlan(BaseModel):
    request_id: str
    dataset_id: str
    intent: str
    metric: str | None = None
    group: str | None = None
    temporal_column: str | None = None
    filters: list[dict[str, Any]] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    visualization_type: str = "auto"
    verification_requirements: list[str] = Field(default_factory=list)


class AnalysisResponse(BaseModel):
    run_id: str
    dataset_id: str
    question: str
    answer: str
    tools: list[str]
    findings: list[Finding]
    profile_summary: dict[str, Any]
    visualization: dict[str, Any] | None
    visualizations: list[dict[str, Any]] = Field(default_factory=list)
    overview: DatasetOverview | None = None
    suggested_followups: list[str] = Field(default_factory=list)
    degraded_mode: bool = False
    data_quality_warnings: list[str] = Field(default_factory=list)
    trace: list[TraceStep]
    latency_ms: float
    token_usage: int | None = None
    estimated_cost_usd: float | None = None
    model_name: str | None = None
    validation: dict[str, Any]


class SqlQueryRequest(BaseModel):
    dataset_id: str
    query: str = Field(min_length=6, max_length=2000)


class SqlQueryResponse(BaseModel):
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int
    duration_ms: float


class ContactRequest(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    email: str = Field(min_length=5, max_length=254)
    subject: str = Field(min_length=2, max_length=200)
    message: str = Field(min_length=5, max_length=5000)


class APIConnectRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    url: str = Field(min_length=8, max_length=2000)
    method: Literal["GET", "POST"] = "GET"
    headers: dict[str, str] = Field(default_factory=dict)
    auth_type: Literal["none", "bearer", "api_key", "basic"] = "none"
    auth_token: Optional[str] = None
    auth_header: str = "Authorization"
    params: dict[str, str] = Field(default_factory=dict)
    body: Optional[Any] = None
    nested_records_path: Optional[str] = None
    pagination_type: Literal["none", "page", "offset_limit", "cursor", "next_url"] = "none"
    page_param: str = "page"
    limit_param: str = "limit"
    page_size: int = 100
    max_pages: int = 10
    max_records: int = 5000


class DBConnectRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    connection_url: str = Field(min_length=8, max_length=2000)
    table_name: Optional[str] = None
    query: Optional[str] = None
    max_records: int = 10000


class ReconciliationRequest(BaseModel):
    source_a_id: str
    source_b_id: str
    join_key: str
    compare_columns: Optional[list[str]] = None
