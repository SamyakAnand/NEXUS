from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def profile_frame(frame: pd.DataFrame) -> dict[str, Any]:
    rows, cols = frame.shape
    columns: list[dict[str, Any]] = []
    for name in frame.columns:
        series = frame[name]
        non_null = series.dropna()
        inferred = "numeric" if pd.api.types.is_numeric_dtype(series) else "temporal" if pd.api.types.is_datetime64_any_dtype(series) or "date" in str(name).lower() else "categorical" if non_null.nunique() <= max(30, rows * 0.05) else "text"
        item: dict[str, Any] = {
            "name": str(name),
            "dtype": str(series.dtype),
            "semantic_type": inferred,
            "missing": int(series.isna().sum()),
            "missing_pct": round(float(series.isna().mean() * 100), 2),
            "unique": int(series.nunique(dropna=True)),
            "cardinality": "high" if series.nunique(dropna=True) > min(1000, rows * 0.5) else "low",
        }
        if inferred == "numeric" and len(non_null):
            item["summary"] = {k: _clean(float(v)) for k, v in non_null.describe(percentiles=[.25, .5, .75]).to_dict().items()}
        elif len(non_null):
            item["top_values"] = non_null.astype(str).value_counts().head(5).to_dict()
        columns.append(item)
    return {
        "row_count": rows,
        "column_count": cols,
        "duplicate_rows": int(frame.duplicated().sum()),
        "missing_cells": int(frame.isna().sum().sum()),
        "columns": columns,
        "numeric_columns": [c["name"] for c in columns if c["semantic_type"] == "numeric"],
        "categorical_columns": [c["name"] for c in columns if c["semantic_type"] == "categorical"],
        "temporal_columns": [c["name"] for c in columns if c["semantic_type"] == "temporal"],
    }


def _clean(value: float) -> float | None:
    return round(value, 4) if np.isfinite(value) else None
