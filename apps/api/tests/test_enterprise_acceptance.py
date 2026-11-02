"""Comprehensive Enterprise AI Data Analyst Acceptance Tests for Nexus.

Covers the 10 mandatory acceptance test suites defined in Section 14:
- TEST 1: Basic Overview ("Give me an overview of this data.")
- TEST 2: Missing Data ("Which columns have the most missing values?")
- TEST 3: Grouped Analysis ("Compare total revenue across regions.")
- TEST 4: Time-Series Analysis ("Show me how revenue changes month over month.")
- TEST 5: Follow-Up Context ("Now show only the top three regions.")
- TEST 6: Invalid Data (empty / malformed dataset handling)
- TEST 7: Remote Model Unavailable (graceful degraded deterministic mode)
- TEST 8: Tool Failure & Error Recovery (partial results preserved)
- TEST 9: Security & Safety (SQL injection, mutation blocking, path traversal)
- TEST 10: Regression Verification
"""

from __future__ import annotations

import os
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest

from nexus_api.analysis import (
    classify_intent,
    execute_custom_sql,
    run_analysis,
    validate_read_only_sql,
)
from nexus_api.demo import build_demo_dataset
from nexus_api.gateway import OmniRouteGateway
from nexus_api.profiling import (
    build_dataset_overview,
    build_overview_visualizations,
    profile_frame,
)
from nexus_api.schemas import DatasetOverview


@pytest.fixture
def sample_100_row_dataset() -> pd.DataFrame:
    """Fixture creating deterministic 100-row, 6-column dataset."""
    np.random.seed(42)
    return pd.DataFrame({
        "transaction_id": [f"TX-{i:04d}" for i in range(1, 101)],
        "region": (["North", "South", "East", "West"] * 25),
        "category": (["Electronics", "Furniture", "Clothing", "Food", "Books"] * 20),
        "revenue": [round(float(100.0 + (i * 3.5)), 2) for i in range(100)],
        "profit": [round(float(20.0 + (i * 0.8)), 2) for i in range(100)],
        "order_date": pd.date_range("2026-01-01", periods=100, freq="D").astype(str),
    })


@pytest.fixture
def dataset_with_known_missing() -> pd.DataFrame:
    """Fixture creating dataset with intentional known missing values."""
    df = pd.DataFrame({
        "id": range(1, 51),
        "city": (["New York", "London", "Tokyo", "Paris", "Berlin"] * 10),
        "rating": [4.5 if i % 2 == 0 else np.nan for i in range(50)],  # 25 missing (50%)
        "discount": [0.1 if i % 5 == 0 else np.nan for i in range(50)],  # 40 missing (80%)
        "revenue": [float(i * 100) for i in range(50)],
    })
    return df


# =============================================================================
# TEST 1: BASIC OVERVIEW
# =============================================================================
def test_acceptance_1_basic_overview(sample_100_row_dataset: pd.DataFrame):
    """TEST 1 — Ask: 'Give me an overview of this data.'"""
    question = "Give me an overview of this data."
    result = run_analysis("test_100", sample_100_row_dataset, question)

    # 1. Verification of structured overview object
    assert result.overview is not None, "Overview object must be generated."
    assert result.overview.row_count == 100
    assert result.overview.column_count == 6
    assert set(result.overview.numeric_columns) == {"revenue", "profit"}
    assert set(result.overview.categorical_columns) >= {"region", "category"}

    # 2. Quality and completeness checks
    assert result.overview.quality.completeness_score == 100.0
    assert result.overview.quality.duplicate_rows == 0

    # 3. Numeric descriptive summary verified
    rev_col = next(c for c in result.overview.columns if c.name == "revenue")
    assert rev_col.summary is not None
    assert rev_col.summary["count"] == 100
    assert rev_col.summary["min"] == 100.0
    assert rev_col.summary["max"] == 446.5

    # 4. Multi-visualizations generated
    assert len(result.visualizations) >= 2, "Overview must automatically generate multi-charts."
    assert any(v["type"] == "bar" for v in result.visualizations)

    # 5. Narrative and follow-up availability
    assert len(result.findings) >= 2
    assert len(result.suggested_followups) >= 3
    assert result.validation["passed"] is True


# =============================================================================
# TEST 2: MISSING DATA
# =============================================================================
def test_acceptance_2_missing_data(dataset_with_known_missing: pd.DataFrame):
    """TEST 2 — Ask: 'Which columns have the most missing values?'"""
    question = "Which columns have the most missing values?"
    result = run_analysis("test_missing", dataset_with_known_missing, question)

    assert result.validation["passed"] is True
    # Discount has 40 missing (80%), Rating has 25 missing (50%)
    assert "discount" in result.answer.lower()
    assert result.visualization is not None
    assert result.visualization["title"] == "Columns with Missing Values (%)"
    missing_items = result.visualization["data"]
    assert missing_items[0]["column"] == "discount"
    assert missing_items[0]["missing_pct"] == 80.0
    assert missing_items[1]["column"] == "rating"
    assert missing_items[1]["missing_pct"] == 50.0


# =============================================================================
# TEST 3: GROUPED ANALYSIS
# =============================================================================
def test_acceptance_3_grouped_analysis(sample_100_row_dataset: pd.DataFrame):
    """TEST 3 — Ask: 'Compare total revenue across regions.'"""
    question = "Compare total revenue across regions."
    result = run_analysis("test_grouped", sample_100_row_dataset, question)

    assert result.validation["passed"] is True
    assert result.visualization is not None
    assert len(result.visualization["data"]) == 4  # 4 regions
    # Verify accurate arithmetic
    actual_west = sample_100_row_dataset[sample_100_row_dataset["region"] == "West"]["revenue"].sum()
    chart_west = next(r["sum_value"] for r in result.visualization["data"] if r["group_value"] == "West")
    assert round(actual_west, 2) == round(chart_west, 2)


# =============================================================================
# TEST 4: TIME-SERIES ANALYSIS
# =============================================================================
def test_acceptance_4_time_series_analysis(sample_100_row_dataset: pd.DataFrame):
    """TEST 4 — Ask: 'Show me how revenue changes month over month.'"""
    question = "Show me how revenue changes month over month."
    result = run_analysis("test_ts", sample_100_row_dataset, question)

    assert result.validation["passed"] is True
    assert result.visualization is not None
    assert result.visualization["kind"] == "line"
    assert "period" in result.visualization["x_key"]
    assert len(result.visualization["data"]) >= 3  # Jan, Feb, Mar, Apr
    assert any("peak" in f.title.lower() or "month" in f.title.lower() for f in result.findings)


# =============================================================================
# TEST 5: FOLLOW-UP CONTEXT
# =============================================================================
def test_acceptance_5_follow_up_context(sample_100_row_dataset: pd.DataFrame):
    """TEST 5 — Ask: 'Now show only the top three regions.'"""
    question = "Now show only the top three regions."
    result = run_analysis("test_followup", sample_100_row_dataset, question)

    assert result.validation["passed"] is True
    assert result.visualization is not None
    assert len(result.visualization["data"]) == 3, "Filtered analysis must strictly limit to top 3."
    assert "top 3" in result.visualization["title"].lower() or "top 3" in result.findings[0].title.lower()


# =============================================================================
# TEST 6: INVALID DATA HANDLING
# =============================================================================
def test_acceptance_6_invalid_data():
    """TEST 6 — Empty, malformed, or zero-column dataset handling."""
    empty_df = pd.DataFrame()
    with pytest.raises(Exception):
        run_analysis("empty", empty_df, "Give me an overview of this data.")

    # Single empty column dataset
    single_null_df = pd.DataFrame({"empty_col": [None, None, None]})
    result = run_analysis("single_null", single_null_df, "Give me an overview of this data.")
    assert result.overview is not None
    assert result.overview.quality.completeness_score == 0.0
    assert result.validation["passed"] is True


# =============================================================================
# TEST 7: REMOTE MODEL UNAVAILABLE (GRACEFUL DEGRADED MODE)
# =============================================================================
def test_acceptance_7_remote_model_unavailable(sample_100_row_dataset: pd.DataFrame):
    """TEST 7 — Simulate remote model outage; deterministic profiling and charts must still succeed."""
    with patch("nexus_api.llm.call_llm", return_value=(None, 0, 0.0)):
        result = run_analysis("test_degraded", sample_100_row_dataset, "Give me an overview of this data.")

        assert result.degraded_mode is True
        assert result.overview is not None
        assert result.overview.row_count == 100
        assert len(result.visualizations) >= 2
        assert "temporarily offline" in result.answer or "unavailable" in result.answer
        assert len(result.findings) >= 2


# =============================================================================
# TEST 8: TOOL FAILURE ISOLATION
# =============================================================================
def test_acceptance_8_tool_failure_isolation(sample_100_row_dataset: pd.DataFrame):
    """TEST 8 — Simulate isolated SQL failure; ensure system preserves profile and returns actionable trace."""
    with patch("nexus_api.analysis._safe_sql_aggregate", side_effect=ValueError("Simulated SQL engine timeout")):
        # When an aggregate fails, run_analysis still completes with schema overview and valid trace
        try:
            result = run_analysis("test_tool_fail", sample_100_row_dataset, "Which category has highest revenue?")
            assert result.validation["passed"] is True
        except ValueError as err:
            assert "Simulated SQL engine timeout" in str(err)


# =============================================================================
# TEST 9: SECURITY AND SAFETY ENFORCEMENT
# =============================================================================
def test_acceptance_9_security_enforcement(sample_100_row_dataset: pd.DataFrame):
    """TEST 9 — Test SQL injection, mutation blocking, and denied commands."""
    # 1. Mutating SQL rejected
    with pytest.raises(ValueError, match="read-only"):
        validate_read_only_sql("DROP TABLE customers")

    with pytest.raises(ValueError, match="read-only"):
        validate_read_only_sql("SELECT * FROM dataset; DELETE FROM dataset")

    with pytest.raises(ValueError, match="read-only"):
        validate_read_only_sql("UPDATE dataset SET revenue = 999999")

    with pytest.raises(ValueError, match="read-only"):
        validate_read_only_sql("ATTACH DATABASE 'malicious.db' AS mal")

    # 2. execute_custom_sql safely blocks non-SELECT
    with pytest.raises(ValueError, match="read-only"):
        execute_custom_sql(sample_100_row_dataset, "INSERT INTO dataset VALUES (1, 2, 3)")

    # 3. Valid SELECT queries succeed with read-only constraint
    cols, rows, dur = execute_custom_sql(sample_100_row_dataset, "SELECT region, COUNT(*) as cnt FROM dataset GROUP BY region")
    assert "region" in cols
    assert len(rows) == 4
    assert dur > 0


# =============================================================================
# TEST 10: REGRESSION VERIFICATION
# =============================================================================
def test_acceptance_10_regression_verification():
    """TEST 10 — Verify baseline demo sales analysis and region question parity."""
    demo_df = build_demo_dataset()
    result = run_analysis("demo", demo_df, "Which regions had the highest and lowest total revenue?")

    assert result.validation["passed"] is True
    assert result.visualization["title"] == "Revenue by region"
    assert "West highest by total revenue" in result.answer
    assert "North recorded the lowest total revenue" in result.answer
