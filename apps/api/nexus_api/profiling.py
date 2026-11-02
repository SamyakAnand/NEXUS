from __future__ import annotations

import json
from typing import Any

import numpy as np
import pandas as pd

from .schemas import (
    CorrelationPair,
    DataQualityReport,
    DatasetColumnSummary,
    DatasetOverview,
)


def profile_frame(frame: pd.DataFrame) -> dict[str, Any]:
    """Compute enterprise-grade deterministic profile for any tabular DataFrame."""
    rows, cols = frame.shape
    columns: list[dict[str, Any]] = []
    constant_columns: list[str] = []
    high_missing_columns: list[str] = []
    outlier_columns: list[str] = []

    for name in frame.columns:
        series = frame[name]
        non_null = series.dropna()
        non_null_count = len(non_null)
        unique_count = int(series.nunique(dropna=True))
        missing_count = int(series.isna().sum())
        missing_pct = round(float(missing_count / rows * 100), 2) if rows > 0 else 0.0

        is_constant = bool(unique_count <= 1 and rows > 1)
        if is_constant:
            constant_columns.append(str(name))

        if missing_pct >= 20.0:
            high_missing_columns.append(str(name))

        # Classify semantic type
        inferred = (
            "numeric"
            if pd.api.types.is_numeric_dtype(series)
            else "temporal"
            if pd.api.types.is_datetime64_any_dtype(series)
            or any(kw in str(name).lower() for kw in ("date", "time", "timestamp", "year", "month", "day"))
            else "categorical"
            if unique_count <= max(50, rows * 0.08)
            else "text"
        )

        has_outliers = False
        item: dict[str, Any] = {
            "name": str(name),
            "dtype": str(series.dtype),
            "semantic_type": inferred,
            "missing": missing_count,
            "missing_pct": missing_pct,
            "unique": unique_count,
            "cardinality": "high" if unique_count > min(1000, rows * 0.5) else "low",
            "is_constant": is_constant,
            "has_outliers": False,
        }

        if inferred == "numeric" and non_null_count > 0:
            desc = non_null.describe(percentiles=[0.25, 0.5, 0.75]).to_dict()
            q25 = float(desc.get("25%", 0.0))
            q75 = float(desc.get("75%", 0.0))
            iqr = q75 - q25
            lower_bound = q25 - 1.5 * iqr
            upper_bound = q75 + 1.5 * iqr
            outlier_count = int(((non_null < lower_bound) | (non_null > upper_bound)).sum())
            if outlier_count > 0:
                has_outliers = True
                outlier_columns.append(str(name))

            item["has_outliers"] = has_outliers
            item["summary"] = {
                "count": _clean(float(desc.get("count", 0.0))),
                "mean": _clean(float(desc.get("mean", 0.0))),
                "std": _clean(float(desc.get("std", 0.0))),
                "min": _clean(float(desc.get("min", 0.0))),
                "25%": _clean(q25),
                "50%": _clean(float(desc.get("50%", 0.0))),
                "median": _clean(float(desc.get("50%", 0.0))),
                "75%": _clean(q75),
                "max": _clean(float(desc.get("max", 0.0))),
                "iqr": _clean(iqr),
                "outlier_count": outlier_count,
            }
        elif non_null_count > 0:
            item["top_values"] = {str(k): int(v) for k, v in non_null.astype(str).value_counts().head(5).items()}

        columns.append(item)

    # Missingness and completeness
    total_cells = rows * cols if rows * cols > 0 else 1
    missing_cells = int(frame.isna().sum().sum())
    missing_cells_pct = round((missing_cells / total_cells) * 100, 2)
    completeness_score = round(max(0.0, 100.0 - missing_cells_pct), 2)
    duplicate_rows = int(frame.duplicated().sum())
    duplicate_pct = round((duplicate_rows / rows * 100), 2) if rows > 0 else 0.0

    # Build quality warnings
    warnings: list[str] = []
    recommendations: list[str] = []
    if duplicate_rows > 0:
        warnings.append(f"{duplicate_rows:,} duplicate rows detected ({duplicate_pct}% of total records).")
        recommendations.append("Consider deduplicating records before statistical aggregations.")
    if high_missing_columns:
        warnings.append(f"High missingness in columns: {', '.join(high_missing_columns)}.")
        recommendations.append("Review whether missing values should be imputed with median/mode or dropped.")
    if constant_columns:
        warnings.append(f"Zero-variance constant columns detected: {', '.join(constant_columns)}.")
        recommendations.append("Consider excluding constant features as they provide no variance.")
    if outlier_columns:
        warnings.append(f"Statistical outliers detected in: {', '.join(outlier_columns)}.")
        recommendations.append("Examine extreme values to verify if they are valid transactions or data entry anomalies.")

    # Compute correlations
    numeric_names = [c["name"] for c in columns if c["semantic_type"] == "numeric"]
    correlations: list[dict[str, Any]] = []
    if len(numeric_names) >= 2 and rows >= 3:
        corr_matrix = frame[numeric_names].corr(method="pearson")
        for i in range(len(numeric_names)):
            for j in range(i + 1, len(numeric_names)):
                col_a = numeric_names[i]
                col_b = numeric_names[j]
                val = corr_matrix.loc[col_a, col_b]
                if np.isfinite(val):
                    val_clean = round(float(val), 4)
                    strength = (
                        "strong_positive"
                        if val_clean >= 0.7
                        else "moderate_positive"
                        if val_clean >= 0.3
                        else "weak"
                        if val_clean > -0.3
                        else "moderate_negative"
                        if val_clean > -0.7
                        else "strong_negative"
                    )
                    correlations.append({
                        "column_a": col_a,
                        "column_b": col_b,
                        "correlation": val_clean,
                        "strength": strength,
                    })

    profile_data = {
        "row_count": rows,
        "column_count": cols,
        "duplicate_rows": duplicate_rows,
        "duplicate_pct": duplicate_pct,
        "missing_cells": missing_cells,
        "missing_cells_pct": missing_cells_pct,
        "completeness_score": completeness_score,
        "columns": columns,
        "numeric_columns": numeric_names,
        "categorical_columns": [c["name"] for c in columns if c["semantic_type"] == "categorical"],
        "temporal_columns": [c["name"] for c in columns if c["semantic_type"] == "temporal"],
        "constant_columns": constant_columns,
        "high_missing_columns": high_missing_columns,
        "outlier_columns": outlier_columns,
        "warnings": warnings,
        "recommendations": recommendations,
        "correlations": correlations,
    }
    profile_data["suggested_questions"] = generate_suggested_questions(profile_data, frame)
    return profile_data


def generate_suggested_questions(profile: dict[str, Any], frame: pd.DataFrame) -> list[dict[str, str]]:
    """Intelligently suggest high-impact analytical questions based on dataset schema."""
    numerics = profile.get("numeric_columns", [])
    categoricals = profile.get("categorical_columns", [])
    temporals = profile.get("temporal_columns", [])

    suggestions: list[dict[str, str]] = []

    # 0. Core Overview Question
    suggestions.append({
        "question": "Give me an overview of this data.",
        "category": "overview",
        "badge": "Dataset Overview",
        "explanation": "Generates complete deterministic profile, data quality audit, key distributions, and executive synthesis.",
    })

    # 1. Primary Aggregation / Ranking
    if categoricals and numerics:
        cat = categoricals[0]
        num = numerics[0]
        suggestions.append({
            "question": f"Which {cat} generated the highest and lowest total {num}?",
            "category": "ranking",
            "badge": "Top Ranking",
            "explanation": f"Ranks {cat} by aggregate {num} to identify top and bottom performers.",
        })

    # 2. Distribution / Segmentation
    if len(categoricals) > 1 and numerics:
        cat2 = categoricals[1]
        num = numerics[0]
        suggestions.append({
            "question": f"Compare total {num} across {cat2} categories",
            "category": "comparison",
            "badge": "Group Comparison",
            "explanation": f"Evaluates {num} variations across {cat2} segments.",
        })

    # 3. Temporal Trend & Forecasting
    if temporals and numerics:
        temp = temporals[0]
        num = numerics[0]
        suggestions.append({
            "question": f"How does {num} trend over {temp} and what is the forecast?",
            "category": "forecasting",
            "badge": "Trend & Forecast",
            "explanation": f"Decomposes historical time series for {num} and computes 95% CI future projection.",
        })

    # 4. Missing Data Investigation
    suggestions.append({
        "question": "Which columns have the most missing values?",
        "category": "data_quality",
        "badge": "Data Quality",
        "explanation": "Identifies missing counts, completeness scores, and data health metrics.",
    })

    # 5. Correlation & Hypothesis Testing
    if len(numerics) >= 2:
        num1, num2 = numerics[0], numerics[1]
        suggestions.append({
            "question": f"Is there a correlation between {num1} and {num2}?",
            "category": "correlation",
            "badge": "Correlation Test",
            "explanation": f"Computes Pearson correlation coefficient between {num1} and {num2}.",
        })

    return suggestions[:6]


def build_overview_visualizations(frame: pd.DataFrame, profile: dict[str, Any]) -> list[dict[str, Any]]:
    """Build a comprehensive suite of automatic visualizations for a dataset overview."""
    visualizations: list[dict[str, Any]] = []
    numerics = profile.get("numeric_columns", [])
    categoricals = profile.get("categorical_columns", [])
    temporals = profile.get("temporal_columns", [])

    # 1. Primary Ranked Categorical Distribution
    if categoricals and numerics:
        cat = categoricals[0]
        num = numerics[0]
        agg = frame.groupby(cat, observed=True)[num].sum().reset_index()
        agg = agg.sort_values(by=num, ascending=False).head(10)
        chart_data = [{"name": str(row[cat]), "value": round(float(row[num]), 2)} for _, row in agg.iterrows()]
        visualizations.append({
            "id": "overview_ranked_bar",
            "type": "bar",
            "title": f"Total {num} by {cat}",
            "x": "name",
            "y": "value",
            "x_label": cat.replace("_", " ").title(),
            "y_label": f"Total {num.replace('_', ' ').title()}",
            "data": chart_data,
        })

    # 2. Key Numeric Distribution (Histogram / Bins)
    if numerics:
        num = numerics[0]
        series = frame[num].dropna()
        if len(series) >= 5:
            counts, bin_edges = np.histogram(series, bins=min(8, len(series.unique())))
            hist_data = [
                {
                    "range": f"{round(float(bin_edges[i]), 1)} - {round(float(bin_edges[i+1]), 1)}",
                    "frequency": int(counts[i]),
                }
                for i in range(len(counts))
            ]
            visualizations.append({
                "id": "overview_distribution_hist",
                "type": "bar",
                "title": f"Distribution of {num}",
                "x": "range",
                "y": "frequency",
                "x_label": f"{num.replace('_', ' ').title()} Range",
                "y_label": "Frequency (Count)",
                "data": hist_data,
            })

    # 3. Missingness & Completeness Chart
    cols_meta = profile.get("columns", [])
    missing_data = [
        {"column": c["name"], "missing_pct": c["missing_pct"], "missing_count": c["missing"]}
        for c in cols_meta
        if c["missing"] > 0
    ]
    if missing_data:
        missing_data = sorted(missing_data, key=lambda x: x["missing_pct"], reverse=True)[:8]
        visualizations.append({
            "id": "overview_missingness_chart",
            "type": "bar",
            "title": "Columns with Missing Data (%)",
            "x": "column",
            "y": "missing_pct",
            "x_label": "Column Name",
            "y_label": "Missing Percentage (%)",
            "data": missing_data,
        })

    # 4. Temporal Trend Line (if temporal exists)
    if temporals and numerics:
        temp = temporals[0]
        num = numerics[0]
        try:
            temp_df = frame[[temp, num]].dropna().copy()
            temp_df[temp] = pd.to_datetime(temp_df[temp], errors="coerce")
            temp_df = temp_df.dropna().sort_values(by=temp)
            # Group by Month or Date
            grouped = temp_df.groupby(temp_df[temp].dt.to_period("M"), observed=True)[num].sum().reset_index()
            trend_data = [
                {"period": str(row[temp]), "value": round(float(row[num]), 2)}
                for _, row in grouped.iterrows()
            ]
            if len(trend_data) >= 2:
                visualizations.append({
                    "id": "overview_temporal_trend",
                    "type": "line",
                    "title": f"{num.replace('_', ' ').title()} Trend Over Time",
                    "x": "period",
                    "y": "value",
                    "x_label": "Time Period",
                    "y_label": f"Total {num.replace('_', ' ').title()}",
                    "data": trend_data,
                })
        except Exception:
            pass

    return visualizations


def build_dataset_overview(dataset_id: str, name: str, frame: pd.DataFrame) -> DatasetOverview:
    """Build a complete, typed DatasetOverview object containing deterministic profile and charts."""
    profile = profile_frame(frame)
    columns_summary = [
        DatasetColumnSummary(
            name=c["name"],
            dtype=c["dtype"],
            semantic_type=c["semantic_type"],
            missing=c["missing"],
            missing_pct=c["missing_pct"],
            unique=c["unique"],
            cardinality=c["cardinality"],
            summary=c.get("summary"),
            top_values=c.get("top_values"),
            is_constant=c.get("is_constant", False),
            has_outliers=c.get("has_outliers", False),
        )
        for c in profile["columns"]
    ]

    quality = DataQualityReport(
        completeness_score=profile["completeness_score"],
        duplicate_rows=profile["duplicate_rows"],
        duplicate_pct=profile["duplicate_pct"],
        missing_cells=profile["missing_cells"],
        missing_cells_pct=profile["missing_cells_pct"],
        constant_columns=profile["constant_columns"],
        high_missing_columns=profile["high_missing_columns"],
        outlier_columns=profile["outlier_columns"],
        warnings=profile["warnings"],
        recommendations=profile["recommendations"],
    )

    correlations = [
        CorrelationPair(
            column_a=c["column_a"],
            column_b=c["column_b"],
            correlation=c["correlation"],
            strength=c["strength"],
        )
        for c in profile.get("correlations", [])
    ]

    visualizations = build_overview_visualizations(frame, profile)

    return DatasetOverview(
        dataset_id=dataset_id,
        name=name,
        row_count=profile["row_count"],
        column_count=profile["column_count"],
        numeric_columns=profile["numeric_columns"],
        categorical_columns=profile["categorical_columns"],
        temporal_columns=profile["temporal_columns"],
        columns=columns_summary,
        quality=quality,
        correlations=correlations,
        suggested_questions=profile.get("suggested_questions", []),
        visualizations=visualizations,
    )


def _clean(value: float) -> float | None:
    return round(value, 4) if np.isfinite(value) else None
