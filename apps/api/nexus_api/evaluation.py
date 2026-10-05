from __future__ import annotations

from typing import Any

from .analysis import _tool_plan, run_analysis


CASES = [
    {"id": "route-01", "question": "Which region has the highest revenue?", "expected": ["schema_inspector", "pandas_analysis", "sql_query"]},
    {"id": "route-02", "question": "Show the monthly sales trend", "expected": ["schema_inspector", "pandas_analysis", "visualization_generator"]},
    {"id": "route-03", "question": "Find unusual revenue spikes", "expected": ["schema_inspector", "pandas_analysis", "anomaly_detection"]},
    {"id": "route-04", "question": "Are profit and discount correlated?", "expected": ["schema_inspector", "pandas_analysis", "correlation_analysis"]},
]

RETRIEVAL = [
    {"query": "revenue trend", "relevant": ["revenue", "date", "region"], "ranked": ["revenue", "date", "region", "product"]},
    {"query": "customer segments", "relevant": ["customer", "region"], "ranked": ["customer", "product", "region", "channel"]},
    {"query": "profit and cost", "relevant": ["profit", "cost"], "ranked": ["profit", "cost", "discount", "date"]},
]


def run_evaluation(frame: Any, k: int = 3) -> dict[str, Any]:
    route_hits = []
    successful_tools = 0
    selected_tool_count = 0
    for case in CASES:
        selected = set(_tool_plan(case["question"], frame))
        expected = set(case["expected"])
        result = run_analysis("evaluation", frame, case["question"])
        completed = {step.name for step in result.trace if step.status == "completed"}
        selected_tool_count += len(selected)
        successful_tools += len(selected.intersection(completed))
        route_hits.append({"id": case["id"], "question": case["question"], "pass": expected.issubset(selected), "selected": sorted(selected), "expected": sorted(expected), "tools_completed": len(selected.intersection(completed)), "tools_selected": len(selected)})
    recalls, precisions, reciprocal_ranks = [], [], []
    retrieval_rows = []
    for case in RETRIEVAL:
        ranked = case["ranked"][:k]
        relevant = set(case["relevant"])
        hits = [index for index, doc in enumerate(ranked, 1) if doc in relevant]
        recall = len(hits) / max(1, len(relevant))
        precision = len(hits) / max(1, len(ranked))
        rr = 1 / hits[0] if hits else 0
        recalls.append(recall); precisions.append(precision); reciprocal_ranks.append(rr)
        retrieval_rows.append({"query": case["query"], "recall_at_k": round(recall, 3), "precision_at_k": round(precision, 3), "reciprocal_rank": round(rr, 3)})
    return {
        "cases": route_hits,
        "retrieval": retrieval_rows,
        "metrics": {
            "tool_selection_accuracy": round(sum(r["pass"] for r in route_hits) / len(route_hits), 3),
            "tool_success_rate": round(successful_tools / max(1, selected_tool_count), 3),
            "recall_at_k": round(sum(recalls) / len(recalls), 3),
            "precision_at_k": round(sum(precisions) / len(precisions), 3),
            "mrr": round(sum(reciprocal_ranks) / len(reciprocal_ranks), 3),
            "cases_passed": sum(r["pass"] for r in route_hits),
            "cases_total": len(route_hits),
        },
        "limitations": ["Retrieval metrics use deterministic column metadata fixtures; they do not evaluate semantic vector retrieval.", "No LLM relevance, token, or cost metrics are available in offline mode."],
    }
