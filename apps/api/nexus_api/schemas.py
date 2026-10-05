from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class AnalysisRequest(BaseModel):
    dataset_id: str
    question: str = Field(min_length=3, max_length=1000)
    requested_visualization: Literal["auto", "line", "bar", "scatter", "table"] = "auto"


CleaningOperation = Literal["normalize_missing_values", "trim_whitespace", "remove_exact_duplicates"]


class CleaningRequest(BaseModel):
    operations: list[CleaningOperation] = Field(min_length=1, max_length=3)

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
    trace: list[TraceStep]
    latency_ms: float
    token_usage: int | None = None
    estimated_cost_usd: float | None = None
    validation: dict[str, Any]
