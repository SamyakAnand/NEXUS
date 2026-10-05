from __future__ import annotations

from typing import Any, Literal

import numpy as np
import pandas as pd

CleaningOperation = Literal[
    "normalize_missing_values",
    "trim_whitespace",
    "remove_exact_duplicates",
    "clip_outliers",
    "impute_missing_median",
    "impute_missing_mode",
    "drop_high_missing_columns",
]

MISSING_TOKENS = {"", "-", "na", "n/a", "nan", "null", "none", "unknown"}


def _text_columns(frame: pd.DataFrame) -> list[str]:
    return [str(name) for name in frame.columns if pd.api.types.is_object_dtype(frame[name].dtype) or pd.api.types.is_string_dtype(frame[name].dtype)]


def _numeric_columns(frame: pd.DataFrame) -> list[str]:
    return [str(name) for name in frame.columns if pd.api.types.is_numeric_dtype(frame[name].dtype)]


def inspect_cleaning_issues(frame: pd.DataFrame) -> list[dict[str, Any]]:
    """Report conservative, deterministic cleaning suggestions without changing data."""
    issues: list[dict[str, Any]] = []
    token_columns: list[str] = []
    token_count = 0
    whitespace_columns: list[str] = []
    whitespace_count = 0

    for column in _text_columns(frame):
        values = frame[column]
        normalized = values.map(lambda value: value.strip().casefold() if isinstance(value, str) else None)
        token_mask = normalized.isin(MISSING_TOKENS)
        if token_mask.any():
            token_columns.append(column)
            token_count += int(token_mask.sum())
        trim_mask = values.map(lambda value: isinstance(value, str) and value != value.strip())
        if trim_mask.any():
            whitespace_columns.append(column)
            whitespace_count += int(trim_mask.sum())

    if token_count:
        issues.append({
            "operation": "normalize_missing_values",
            "count": token_count,
            "columns": token_columns,
            "title": "Normalize missing-value markers",
            "description": "Recognized text markers such as blank, N/A, null, dash, and unknown are converted to true missing values.",
            "recommendation": "Preview the affected values, then apply to a derived copy if appropriate.",
            "confidence": "high",
        })
    if whitespace_count:
        issues.append({
            "operation": "trim_whitespace",
            "count": whitespace_count,
            "columns": whitespace_columns,
            "title": "Trim surrounding whitespace",
            "description": "Leading and trailing spaces were found in text fields. Internal spacing and capitalization are preserved.",
            "recommendation": "Trim only the outer whitespace in a derived copy.",
            "confidence": "high",
        })

    duplicate_rows = int(frame.duplicated(keep="first").sum())
    if duplicate_rows:
        issues.append({
            "operation": "remove_exact_duplicates",
            "count": duplicate_rows,
            "columns": [str(column) for column in frame.columns],
            "title": "Review exact duplicate rows",
            "description": "Rows identical across every column were detected. Repeated records can be legitimate, so this action requires explicit selection.",
            "recommendation": "Keep the first copy of each exactly duplicated row in the derived copy.",
            "confidence": "medium",
        })

    # Outlier detection using IQR
    outlier_count = 0
    outlier_cols: list[str] = []
    for col in _numeric_columns(frame):
        s = frame[col].dropna()
        if len(s) > 10:
            q25, q75 = float(s.quantile(0.25)), float(s.quantile(0.75))
            iqr = q75 - q25
            if iqr > 0:
                low_b, high_b = q25 - 1.5 * iqr, q75 + 1.5 * iqr
                n_outliers = int(((s < low_b) | (s > high_b)).sum())
                if n_outliers > 0:
                    outlier_count += n_outliers
                    outlier_cols.append(col)

    if outlier_count:
        issues.append({
            "operation": "clip_outliers",
            "count": outlier_count,
            "columns": outlier_cols,
            "title": "Cap extreme numerical outliers (IQR 1.5x)",
            "description": "Values outside 1.5x IQR boundary can distort statistical distributions and model convergence.",
            "recommendation": "Clip extreme values to lower and upper quartile thresholds.",
            "confidence": "medium",
        })

    # Missing numeric values imputation
    missing_num_count = 0
    missing_num_cols: list[str] = []
    for col in _numeric_columns(frame):
        n_missing = int(frame[col].isna().sum())
        if n_missing > 0:
            missing_num_count += n_missing
            missing_num_cols.append(col)

    if missing_num_count:
        issues.append({
            "operation": "impute_missing_median",
            "count": missing_num_count,
            "columns": missing_num_cols,
            "title": "Impute missing numeric values with median",
            "description": "Fills unrecorded numeric cells with the column median to preserve distributions without skewing means.",
            "recommendation": "Impute median values for incomplete numeric fields.",
            "confidence": "high",
        })

    # High missing columns (>60%)
    high_missing_cols = [str(col) for col in frame.columns if frame[col].isna().mean() > 0.6]
    if high_missing_cols:
        issues.append({
            "operation": "drop_high_missing_columns",
            "count": len(high_missing_cols),
            "columns": high_missing_cols,
            "title": "Drop columns with >60% missing data",
            "description": f"Columns with more than 60% missing cells provide weak signal and inflate sparsity: {', '.join(high_missing_cols)}.",
            "recommendation": "Prune sparse columns in the derived dataset.",
            "confidence": "medium",
        })

    return issues


def clean_frame(frame: pd.DataFrame, operations: list[CleaningOperation]) -> tuple[pd.DataFrame, dict[str, int]]:
    """Apply selected, allowlisted operations to a copy and report measured changes."""
    allowed = {
        "normalize_missing_values",
        "trim_whitespace",
        "remove_exact_duplicates",
        "clip_outliers",
        "impute_missing_median",
        "impute_missing_mode",
        "drop_high_missing_columns",
    }
    if not operations or any(operation not in allowed for operation in operations):
        raise ValueError("Select at least one supported cleaning operation.")

    cleaned = frame.copy(deep=True)
    normalized_count = 0
    trimmed_count = 0
    rows_removed = 0
    outliers_clipped = 0
    imputed_count = 0
    columns_dropped = 0

    for operation in operations:
        if operation == "normalize_missing_values":
            for column in _text_columns(cleaned):
                values = cleaned[column]
                normalized = values.map(lambda value: value.strip().casefold() if isinstance(value, str) else None)
                mask = normalized.isin(MISSING_TOKENS)
                normalized_count += int(mask.sum())
                cleaned.loc[mask, column] = pd.NA
        elif operation == "trim_whitespace":
            for column in _text_columns(cleaned):
                values = cleaned[column]
                trimmed = values.map(lambda value: value.strip() if isinstance(value, str) else value)
                mask = values.map(lambda value: isinstance(value, str) and value != value.strip())
                trimmed_count += int(mask.sum())
                cleaned[column] = trimmed
        elif operation == "remove_exact_duplicates":
            before = len(cleaned)
            cleaned = cleaned.drop_duplicates(keep="first").reset_index(drop=True)
            rows_removed += before - len(cleaned)
        elif operation == "clip_outliers":
            for col in _numeric_columns(cleaned):
                s = cleaned[col].dropna()
                if len(s) > 10:
                    q25, q75 = float(s.quantile(0.25)), float(s.quantile(0.75))
                    iqr = q75 - q25
                    if iqr > 0:
                        low_b, high_b = q25 - 1.5 * iqr, q75 + 1.5 * iqr
                        mask = (cleaned[col] < low_b) | (cleaned[col] > high_b)
                        outliers_clipped += int(mask.sum())
                        cleaned[col] = cleaned[col].clip(lower=low_b, upper=high_b)
        elif operation == "impute_missing_median":
            for col in _numeric_columns(cleaned):
                missing_mask = cleaned[col].isna()
                n_miss = int(missing_mask.sum())
                if n_miss > 0:
                    med = cleaned[col].median()
                    cleaned[col] = cleaned[col].fillna(med)
                    imputed_count += n_miss
        elif operation == "impute_missing_mode":
            for col in _text_columns(cleaned):
                missing_mask = cleaned[col].isna()
                n_miss = int(missing_mask.sum())
                if n_miss > 0:
                    mode_val = cleaned[col].mode(dropna=True)
                    if not mode_val.empty:
                        cleaned[col] = cleaned[col].fillna(mode_val.iloc[0])
                        imputed_count += n_miss
        elif operation == "drop_high_missing_columns":
            high_miss = [col for col in cleaned.columns if cleaned[col].isna().mean() > 0.6]
            columns_dropped += len(high_miss)
            cleaned = cleaned.drop(columns=high_miss)

    changes: dict[str, int] = {
        "missing_values_normalized": normalized_count,
        "text_values_trimmed": trimmed_count,
        "rows_removed": rows_removed,
    }
    if outliers_clipped:
        changes["outliers_clipped"] = outliers_clipped
    if imputed_count:
        changes["values_imputed"] = imputed_count
    if columns_dropped:
        changes["columns_dropped"] = columns_dropped

    return cleaned, changes


def json_records(frame: pd.DataFrame, limit: int = 5) -> list[dict[str, Any]]:
    sample = frame.head(limit).astype(object).where(pd.notna(frame.head(limit)), None)
    return sample.to_dict(orient="records")
