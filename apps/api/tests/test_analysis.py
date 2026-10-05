import pandas as pd
import pytest

from nexus_api.analysis import _safe_sql_aggregate, run_analysis, validate_read_only_sql
from nexus_api.cleaning import clean_frame, inspect_cleaning_issues
from nexus_api.demo import build_demo_dataset
from nexus_api.profiling import profile_frame
from nexus_api.evaluation import run_evaluation


def test_profile_captures_quality_and_semantic_columns():
    frame = pd.DataFrame({"sale_date": ["2025-01-01", None, "2025-01-03"], "revenue": [10.0, 12.0, 10.0], "region": ["North", "South", "North"]})
    profile = profile_frame(frame)
    assert (profile["row_count"], profile["column_count"]) == (3, 3)
    assert profile["missing_cells"] == 1
    assert profile["duplicate_rows"] == 0
    semantic = {column["name"]: column["semantic_type"] for column in profile["columns"]}
    assert semantic == {"sale_date": "temporal", "revenue": "numeric", "region": "categorical"}


def test_sql_executes_real_aggregate_and_blocks_mutation():
    frame = pd.DataFrame({"group key": ["A", "B", "A"], "amount": [3.0, 8.0, 2.0]})
    rows, query = _safe_sql_aggregate(frame, "amount", "group key")
    assert rows[0]["group_value"] == "B"
    assert rows[0]["sum_value"] == 8
    assert '"group key"' in query
    with pytest.raises(ValueError, match="read-only"):
        validate_read_only_sql("SELECT * FROM dataset; DROP TABLE dataset")
    with pytest.raises(ValueError, match="read-only"):
        validate_read_only_sql("UPDATE dataset SET amount = 0")


def test_analysis_uses_computed_results_and_evidence():
    frame = pd.DataFrame({
        "date": pd.date_range("2025-01-01", periods=90, freq="D").astype(str),
        "region": ["North", "South", "East"] * 30,
        "revenue": [120.0, 100.0, 80.0] * 30,
    })
    result = run_analysis("fixture", frame, "Show the revenue trend by region")
    assert result.validation["passed"]
    assert result.visualization and len(result.visualization["data"]) == 3
    assert result.visualization["series"] == ["East", "North", "South"]
    assert result.visualization["data"][0]["North"] > result.visualization["data"][0]["South"]
    assert len(result.findings) == 4
    assert any("revenue" in claim.lower() for finding in result.findings for claim in finding.evidence)
    assert {step.name for step in result.trace} >= {"dataset_profiler", "analysis_planner", "sql_query", "result_validation", "insight_synthesis"}


def test_generated_demo_dataset_and_evaluation_are_deterministic():
    first = build_demo_dataset()
    second = build_demo_dataset()
    pd.testing.assert_frame_equal(first, second)
    report = run_evaluation(first)
    assert report["metrics"]["cases_total"] == 4
    assert 0 <= report["metrics"]["recall_at_k"] <= 1
    assert len(report["retrieval"]) == 3


def test_cleaning_suggestions_and_operations_are_measured_and_non_destructive():
    frame = pd.DataFrame({
        "city": [" Mumbai ", "Mumbai", "Mumbai"],
        "comment": [" ok ", "N/A", "N/A"],
        "amount": [1, 2, 2],
    })
    original = frame.copy(deep=True)

    issues = inspect_cleaning_issues(frame)
    assert {item["operation"] for item in issues} == {
        "normalize_missing_values", "trim_whitespace", "remove_exact_duplicates",
    }

    cleaned, changes = clean_frame(frame, [
        "normalize_missing_values", "trim_whitespace", "remove_exact_duplicates",
    ])
    pd.testing.assert_frame_equal(frame, original)
    assert len(cleaned) == 2
    assert pd.isna(cleaned.loc[1, "comment"])
    assert cleaned.loc[0, "city"] == "Mumbai"
    assert changes == {
        "missing_values_normalized": 2,
        "text_values_trimmed": 2,
        "rows_removed": 1,
    }
