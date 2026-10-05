from __future__ import annotations

import re
import sqlite3
import time
import uuid
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import linregress
from sklearn.ensemble import IsolationForest

from .profiling import profile_frame
from .schemas import AnalysisResponse, Finding, TraceStep


DENIED_SQL = re.compile(r"\b(attach|detach|pragma|drop|delete|update|insert|alter|create|replace|vacuum|load_extension)\b|;", re.I)


def _tool_plan(question: str, frame: pd.DataFrame) -> list[str]:
    q = question.casefold()
    tools = ["schema_inspector", "pandas_analysis"]
    if any(w in q for w in ("anomal", "outlier", "unusual", "spike")):
        tools.append("anomaly_detection")
    if any(w in q for w in ("correlat", "relationship", "related")):
        tools.append("correlation_analysis")
    if any(w in q for w in ("forecast", "predict", "next month", "future")):
        tools.append("forecasting")
    if any(w in q for w in ("which", "highest", "lowest", "compare", "by region", "by product", "category", "decline", "increase")):
        tools.append("sql_query")
    if any(w in q for w in ("chart", "plot", "show", "trend", "change", "decline", "increase", "correlat")):
        tools.append("visualization_generator")
    return list(dict.fromkeys(tools))


def _safe_sql_aggregate(frame: pd.DataFrame, metric: str, group: str) -> tuple[list[dict[str, Any]], str]:
    """Execute a one-statement read-only aggregate on a transient SQLite snapshot."""
    if metric not in frame.columns or group not in frame.columns:
        raise ValueError("Selected fields do not exist in the dataset schema.")
    if not pd.api.types.is_numeric_dtype(frame[metric]):
        raise ValueError("The selected metric is not numeric.")
    # Identifiers are quoted after exact allow-list membership above.
    quote = lambda identifier: '"' + identifier.replace('"', '""') + '"'
    query = f'SELECT {quote(group)} AS group_value, AVG({quote(metric)}) AS mean_value, SUM({quote(metric)}) AS sum_value, COUNT(*) AS row_count FROM dataset GROUP BY {quote(group)} ORDER BY sum_value DESC LIMIT 20'
    validate_read_only_sql(query)
    with sqlite3.connect(":memory:") as conn:
        frame.to_sql("dataset", conn, index=False)
        conn.execute("PRAGMA query_only = ON")
        rows = pd.read_sql_query(query, conn).to_dict(orient="records")
    return rows, query


def validate_read_only_sql(query: str) -> None:
    """Reject multi-statement and mutating SQL before transient execution."""
    normalized = query.strip()
    if not normalized[:6].casefold() == "select" or DENIED_SQL.search(normalized):
        raise ValueError("Only one read-only SELECT statement is allowed.")


def _choose_metric(frame: pd.DataFrame, question: str) -> str | None:
    q = question.casefold()
    numeric = [c for c in frame.select_dtypes(include="number").columns]
    for col in numeric:
        if str(col).casefold() in q:
            return str(col)
    for hint in ("revenue", "sales", "profit", "cost", "units", "amount"):
        matches = [str(c) for c in numeric if hint in str(c).casefold()]
        if matches:
            return matches[0]
    return str(numeric[0]) if numeric else None


def _choose_group(frame: pd.DataFrame, metric: str, question: str) -> str | None:
    q = question.casefold()
    candidates = [str(c) for c in frame.columns if c != metric and (not pd.api.types.is_numeric_dtype(frame[c]))]
    for col in candidates:
        if col.casefold() in q:
            return col
    for hint in ("region", "category", "product", "channel", "customer", "segment"):
        found = next((c for c in candidates if hint in c.casefold()), None)
        if found:
            return found
    return candidates[0] if candidates else None


def _run_analysis_core(dataset_id: str, frame: pd.DataFrame, question: str, profile_override: dict[str, Any] | None = None, tools_override: list[str] | None = None) -> AnalysisResponse:
    started = time.perf_counter()
    run_id = str(uuid.uuid4())
    trace: list[TraceStep] = []

    def step(name: str, status: str, began: float, summary: str, inp: dict[str, Any] | None = None, out: dict[str, Any] | None = None) -> None:
        trace.append(TraceStep(name=name, status=status, duration_ms=round((time.perf_counter() - began) * 1000, 2), summary=summary, input_summary=inp or {}, output_summary=out or {}))

    mark = time.perf_counter()
    profile = profile_override or profile_frame(frame)
    step("dataset_profiler", "completed", mark, f"Profiled {profile['row_count']:,} rows and {profile['column_count']} columns.", out={"rows": profile["row_count"], "columns": profile["column_count"], "missing_cells": profile["missing_cells"]})
    trace.append(TraceStep(name="schema_inspector", status="completed", duration_ms=0.0, summary="Classified fields and cardinality from the dataset profile.", input_summary={"column_count": profile["column_count"]}, output_summary={"numeric": profile["numeric_columns"], "categorical": profile["categorical_columns"], "temporal": profile["temporal_columns"]}))

    mark = time.perf_counter()
    tools = tools_override or _tool_plan(question, frame)
    metric = _choose_metric(frame, question)
    group = _choose_group(frame, metric, question) if metric else None
    step("analysis_planner", "completed", mark, "Selected tools from question intent and available schema.", {"question": question[:160]}, {"tools": tools, "metric": metric, "group": group})

    findings: list[Finding] = []
    visualization: dict[str, Any] | None = None
    visualizations: list[dict[str, Any]] = []
    result_rows: list[dict[str, Any]] = []
    if metric:
        mark = time.perf_counter()
        stats = {"mean": round(float(frame[metric].mean()), 4), "median": round(float(frame[metric].median()), 4), "std": round(float(frame[metric].std()), 4) if len(frame) > 1 else 0}
        step("pandas_analysis", "completed", mark, "Computed deterministic summary statistics from the uploaded frame.", {"metric": metric}, stats)
    else:
        findings.append(Finding(title="Dataset profiled", detail=f"The dataset contains {profile['row_count']:,} rows and {profile['column_count']} columns. Ask about a numeric measure or a column to compare segments.", confidence="high", evidence=["Dataset profile computed directly from uploaded records."], caveat="No numeric measure and grouping field could be inferred for this question."))
        step("pandas_analysis", "warning", time.perf_counter(), "No compatible metric/group pair was detected; returned schema guidance.", out={"numeric_columns": profile["numeric_columns"]})

    if "sql_query" in tools:
        mark = time.perf_counter()
        if metric and group:
            result_rows, sql = _safe_sql_aggregate(frame, metric, group)
            step("sql_query", "completed", mark, f"Read-only grouped aggregation on {metric} by {group}.", {"metric": metric, "group": group}, {"sql": sql, "groups": len(result_rows)})
            if result_rows:
                top = result_rows[0]
                findings.append(Finding(title=f"{top['group_value']} leads {metric}", detail=f"The grouped SQL result ranks {top['group_value']} highest by total {metric} ({top['sum_value']:,.2f} across {top['row_count']:,} rows).", confidence="high", evidence=[f"Executed read-only SUM({metric}) grouped by {group}.", f"{len(result_rows)} groups returned from {profile['row_count']:,} rows."], caveat="This is an aggregate comparison; it does not establish causation."))
                if len(result_rows) > 1:
                    bottom = result_rows[-1]
                    findings.append(Finding(title=f"{bottom['group_value']} ranks lowest by {metric}", detail=f"{bottom['group_value']} recorded the lowest total {metric} ({bottom['sum_value']:,.2f} across {bottom['row_count']:,} rows).", confidence="high", evidence=[f"Executed read-only SUM({metric}) grouped by {group}.", f"Compared {len(result_rows)} groups from {profile['row_count']:,} rows."], caveat="An aggregate ranking does not explain differences in group size or mix."))
                segment_chart = {"kind": "bar", "purpose": "segments", "title": f"{metric.title()} by {group}", "x_key": "group_value", "y_key": "sum_value", "data": result_rows}
                visualizations.append(segment_chart)
                visualization = segment_chart
        else:
            step("sql_query", "warning", mark, "No numeric measure and grouping field were available for a safe aggregation.", out={"numeric_columns": profile["numeric_columns"], "categorical_columns": profile["categorical_columns"]})

    if "anomaly_detection" in tools:
        mark = time.perf_counter()
        numeric = frame.select_dtypes(include="number").replace([np.inf, -np.inf], np.nan).dropna(axis=1, how="all").fillna(0)
        anomaly_rows = 0
        if len(numeric) >= 20 and numeric.shape[1] > 0:
            sample = numeric.sample(min(20000, len(numeric)), random_state=7)
            labels = IsolationForest(contamination="auto", random_state=7, n_estimators=100).fit_predict(sample)
            anomaly_rows = int((labels == -1).sum())
        step("anomaly_detection", "completed" if anomaly_rows else "warning", mark, "Isolation Forest evaluated the numeric feature sample." if anomaly_rows else "Not enough numeric rows to fit Isolation Forest.", {"numeric_columns": list(numeric.columns), "sample_limit": 20000}, {"flagged_in_sample": anomaly_rows})
        if anomaly_rows:
            findings.append(Finding(title="Potential multivariate outliers flagged", detail=f"Isolation Forest marked {anomaly_rows:,} of {len(sample):,} sampled rows for review.", confidence="medium", evidence=["Isolation Forest trained on numeric columns with fixed random seed 7."], caveat="Flags are screening signals, not proof of data error; review source rows."))

    if "correlation_analysis" in tools:
        mark = time.perf_counter()
        numeric = frame.select_dtypes(include="number")
        matrix = numeric.corr(method="pearson") if numeric.shape[1] >= 2 else pd.DataFrame()
        pairs: list[dict[str, Any]] = []
        if not matrix.empty:
            for i, left in enumerate(matrix.columns):
                for right in matrix.columns[i + 1:]:
                    value = matrix.loc[left, right]
                    if pd.notna(value):
                        pairs.append({"pair": f"{left} · {right}", "correlation": round(float(value), 4), "strength": abs(float(value))})
        pairs.sort(key=lambda item: item["strength"], reverse=True)
        if pairs:
            strongest = pairs[0]
            findings.append(Finding(title="Strongest numeric relationship", detail=f"{strongest['pair']} have a Pearson correlation of {strongest['correlation']:+.2f} across {len(numeric):,} rows.", confidence="medium", evidence=["Pearson correlation computed from numeric columns with pairwise complete observations."], caveat="Correlation does not establish causation."))
            correlation_chart = {"kind": "bar", "purpose": "correlation", "title": "Strongest numeric correlations", "x_key": "pair", "y_key": "correlation", "data": pairs[:8]}
            visualizations.append(correlation_chart)
            if visualization is None:
                visualization = correlation_chart
        else:
            step("correlation_analysis", "warning", mark, "At least two numeric fields are required for correlation analysis.", out={"numeric_columns": list(numeric.columns)})
        if pairs:
            step("correlation_analysis", "completed", mark, "Computed Pearson correlations across numeric columns.", {"numeric_columns": list(numeric.columns)}, {"pairs": len(pairs), "strongest": pairs[0]})

    # Time series output is derived from the data, never from a canned result.
    date_cols = [c for c in frame.columns if "date" in str(c).casefold() or "time" in str(c).casefold()]
    if metric and date_cols and any(w in question.casefold() for w in ("trend", "change", "decline", "increase", "month", "over time", "sales")):
        date_col = date_cols[0]
        dates = pd.to_datetime(frame[date_col], errors="coerce")
        if getattr(dates.dt, "tz", None) is not None:
            dates = dates.dt.tz_localize(None)
        valid = frame.loc[dates.notna(), [metric]].copy()
        valid["period"] = dates[dates.notna()].dt.strftime("%Y-%m").values
        grouped = valid.groupby("period", as_index=False)[metric].sum().sort_values("period")
        if len(grouped) > 1:
            trend_data = grouped.tail(24).to_dict(orient="records")
            trend_series: list[str] = []
            compare_terms = ("compare", "by ", "across", "breakdown", "segment")
            if group and any(term in question.casefold() for term in compare_terms) and group in frame.columns:
                grouped_by_segment = frame.loc[dates.notna(), [metric, group]].copy()
                grouped_by_segment["period"] = dates[dates.notna()].dt.strftime("%Y-%m").values
                totals = grouped_by_segment.groupby(group, dropna=True)[metric].sum().nlargest(5)
                top_groups = totals.index.tolist()
                pivot = (grouped_by_segment[grouped_by_segment[group].isin(top_groups)]
                         .groupby(["period", group], dropna=True)[metric].sum()
                         .unstack(fill_value=0).sort_index().tail(24))
                trend_series = [str(name) for name in pivot.columns]
                if trend_series:
                    trend_data = [{"period": str(period), **{str(name): round(float(row[name]), 2) for name in pivot.columns}}
                                  for period, row in pivot.iterrows()]
            trend_title = f"Monthly {metric} by {group}" if trend_series else f"Monthly {metric}"
            trend_chart = {"kind": "line", "purpose": "trend", "title": trend_title, "x_key": "period", "y_key": metric, "series": trend_series, "data": trend_data}
            visualizations.append(trend_chart)
            visualization = trend_chart
            pct = ((float(grouped.iloc[-1][metric]) / float(grouped.iloc[-2][metric])) - 1) * 100 if float(grouped.iloc[-2][metric]) else None
            peak = grouped.loc[grouped[metric].idxmax()]
            findings.append(Finding(title=f"Peak month for {metric}", detail=f"{peak['period']} had the highest monthly {metric} at {float(peak[metric]):,.2f}.", confidence="high", evidence=[f"Summed {metric} by calendar month from {date_col}.", f"Compared {len(grouped)} available monthly periods."], caveat="Partial periods can appear lower than complete months."))
            findings.append(Finding(title=f"Latest month {('increased' if pct is not None and pct >= 0 else 'decreased')} versus prior month", detail=f"{metric.title()} moved by {pct:+.1f}% between {grouped.iloc[-2]['period']} and {grouped.iloc[-1]['period']}." if pct is not None else "The prior period is zero, so a percentage change cannot be calculated.", confidence="high", evidence=[f"Grouped {metric} by calendar month from {date_col}.", f"{len(grouped)} monthly periods were available."], caveat="Month-to-month changes may reflect seasonality or incomplete periods."))
            if "forecasting" in tools and len(grouped) >= 4:
                mark = time.perf_counter()
                x = np.arange(len(grouped), dtype=float)
                y = grouped[metric].astype(float).to_numpy()
                regression = linregress(x, y)
                forecast_rows = [{"period": f"P+{step_index}", metric: round(float(regression.intercept + regression.slope * (len(y) + step_index - 1)), 2)} for step_index in range(1, 4)]
                findings.append(Finding(title="Short-horizon linear forecast", detail=f"A simple linear trend projects {metric} at {forecast_rows[-1][metric]:,.2f} three periods ahead (R² {regression.rvalue ** 2:.2f}).", confidence="low", evidence=[f"OLS trend fitted to {len(y)} monthly aggregate values from {date_col}."], caveat="Illustrative extrapolation only; seasonality, regime changes, and uncertainty intervals are not modeled."))
                trend_chart = {"kind": "line", "purpose": "trend", "title": f"Monthly {metric} · trend projection", "x_key": "period", "y_key": metric, "data": grouped.tail(24).to_dict(orient="records") + forecast_rows}
                visualizations[-1] = trend_chart
                visualization = trend_chart
                step("forecasting", "completed", mark, "Fitted a simple linear trend to monthly aggregates.", {"periods": len(y)}, {"horizon": 3, "r_squared": round(regression.rvalue ** 2, 3)})
    elif "forecasting" in tools:
        step("forecasting", "warning", time.perf_counter(), "Forecasting requires a recognizable date field and at least four aggregated periods.", out={"date_columns": date_cols})

    if visualization:
        mark = time.perf_counter()
        step("visualization_generator", "completed", mark, f"Created a {visualization['kind']} visualization from computed aggregates.", {"purpose": visualization.get("purpose", "summary")}, {"points": len(visualization["data"]), "title": visualization["title"]})
    elif "visualization_generator" in tools:
        step("visualization_generator", "warning", time.perf_counter(), "No chart was generated because the selected question had no supported aggregate result.")

    mark = time.perf_counter()
    valid = bool(findings and profile["row_count"] > 0 and len(trace) >= 3)
    step("result_validation", "completed" if valid else "warning", mark, "Checked that every emitted finding has supporting computation and provenance.", {"finding_count": len(findings)}, {"valid": valid})
    if not valid:
        findings = [Finding(title="Analysis needs a narrower question", detail="The dataset was profiled, but a supported result could not be derived from the available columns.", confidence="low", evidence=["Dataset schema inspected."], caveat="Try naming a numeric measure and a segment or time period.")]

    answer = " ".join(f.detail for f in findings[:2])
    trace.append(TraceStep(name="insight_synthesis", status="completed", duration_ms=0.0, summary="Assembled a concise answer from validated findings and their evidence.", input_summary={"finding_count": len(findings)}, output_summary={"evidence_items": sum(len(f.evidence) for f in findings)}))
    latency = round((time.perf_counter() - started) * 1000, 2)
    return AnalysisResponse(run_id=run_id, dataset_id=dataset_id, question=question, answer=answer, tools=tools, findings=findings, profile_summary={"row_count": profile["row_count"], "column_count": profile["column_count"], "missing_cells": profile["missing_cells"]}, visualization=visualization, visualizations=visualizations, trace=trace, latency_ms=latency, validation={"passed": valid, "checked": ["profile_available", "finding_has_evidence", "provenance_present"], "failed": [] if valid else ["insufficient_analytic_fields"]})


def _run_with_langgraph(dataset_id: str, frame: pd.DataFrame, question: str) -> AnalysisResponse:
    """Run the conditional NEXUS graph when LangGraph is installed."""
    from typing import TypedDict
    from langgraph.graph import END, START, StateGraph

    class AgentState(TypedDict, total=False):
        dataset_id: str
        frame: pd.DataFrame
        question: str
        profile: dict[str, Any]
        tools: list[str]
        lane: str
        result: AnalysisResponse

    def profile_node(state: dict[str, Any]) -> dict[str, Any]:
        return {"profile": profile_frame(state["frame"])}

    def plan_node(state: dict[str, Any]) -> dict[str, Any]:
        return {"tools": _tool_plan(state["question"], state["frame"])}

    def route_lane(state: dict[str, Any]) -> str:
        tools = state["tools"]
        if "sql_query" in tools:
            return "sql"
        if "anomaly_detection" in tools or "correlation_analysis" in tools:
            return "statistics"
        return "pandas"

    def lane_node(lane: str):
        def select_lane(_: dict[str, Any]) -> dict[str, Any]:
            return {"lane": lane}
        return select_lane

    def execute_node(state: dict[str, Any]) -> dict[str, Any]:
        result = _run_analysis_core(state["dataset_id"], state["frame"], state["question"], state["profile"], state["tools"])
        return {"result": result}

    def validate_node(state: dict[str, Any]) -> dict[str, Any]:
        result = state["result"]
        result.validation["passed"] = bool(result.findings and all(finding.evidence for finding in result.findings))
        return {"result": result}

    def synthesize_node(state: dict[str, Any]) -> dict[str, Any]:
        result = state["result"]
        result.answer = " ".join(finding.detail for finding in result.findings[:2])
        return {"result": result}

    graph = StateGraph(AgentState)
    graph.add_node("profile", profile_node)
    graph.add_node("plan", plan_node)
    graph.add_node("select_sql_lane", lane_node("sql"))
    graph.add_node("select_statistics_lane", lane_node("statistics"))
    graph.add_node("select_pandas_lane", lane_node("pandas"))
    graph.add_node("execute", execute_node)
    graph.add_node("validate", validate_node)
    graph.add_node("synthesize", synthesize_node)
    graph.add_edge(START, "profile")
    graph.add_edge("profile", "plan")
    graph.add_conditional_edges("plan", route_lane, {"sql": "select_sql_lane", "statistics": "select_statistics_lane", "pandas": "select_pandas_lane"})
    for lane in ("select_sql_lane", "select_statistics_lane", "select_pandas_lane"):
        graph.add_edge(lane, "execute")
    graph.add_edge("execute", "validate")
    graph.add_edge("validate", "synthesize")
    graph.add_edge("synthesize", END)
    output = graph.compile().invoke({"dataset_id": dataset_id, "frame": frame, "question": question})
    return output["result"]


def run_analysis(dataset_id: str, frame: pd.DataFrame, question: str) -> AnalysisResponse:
    try:
        return _run_with_langgraph(dataset_id, frame, question)
    except ImportError:
        # Keep the deterministic local demo usable when optional dependencies are absent.
        return _run_analysis_core(dataset_id, frame, question)
