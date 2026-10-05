from __future__ import annotations

from typing import Any, Literal

import pandas as pd

CleaningOperation = Literal[
    "normalize_missing_values",
    "trim_whitespace",
    "remove_exact_duplicates",
]

MISSING_TOKENS = {"", "-", "na", "n/a", "nan", "null", "none", "unknown"}


def _text_columns(frame: pd.DataFrame) -> list[str]:
    return [str(name) for name in frame.columns if pd.api.types.is_object_dtype(frame[name].dtype) or pd.api.types.is_string_dtype(frame[name].dtype)]


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
        trimmed = values.map(lambda value: value.strip() if isinstance(value, str) else value)
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
    return issues


def clean_frame(frame: pd.DataFrame, operations: list[CleaningOperation]) -> tuple[pd.DataFrame, dict[str, int]]:
    """Apply selected, allowlisted operations to a copy and report measured changes."""
    allowed = {"normalize_missing_values", "trim_whitespace", "remove_exact_duplicates"}
    if not operations or any(operation not in allowed for operation in operations):
        raise ValueError("Select at least one supported cleaning operation.")

    cleaned = frame.copy(deep=True)
    normalized_count = 0
    trimmed_count = 0
    rows_removed = 0

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

    return cleaned, {
        "missing_values_normalized": normalized_count,
        "text_values_trimmed": trimmed_count,
        "rows_removed": rows_removed,
    }


def json_records(frame: pd.DataFrame, limit: int = 5) -> list[dict[str, Any]]:
    sample = frame.head(limit).astype(object).where(pd.notna(frame.head(limit)), None)
    return sample.to_dict(orient="records")
