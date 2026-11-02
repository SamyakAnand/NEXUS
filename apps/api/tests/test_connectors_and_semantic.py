import json
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from nexus_api.connectors import FileConnector, RESTAPIConnector
from nexus_api.main import app
from nexus_api.profiling import profile_frame, generate_suggested_questions
from nexus_api.semantic import (
    ConflictResolver,
    CrossSourceMatcher,
    LineageTracker,
    SemanticModelEngine,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_file_connector_csv_and_parquet(tmp_path):
    df = pd.DataFrame({
        "order_id": ["ORD-1", "ORD-2", "ORD-3"],
        "customer_id": ["CUST-10", "CUST-20", "CUST-30"],
        "revenue": [150.0, 300.5, 450.0],
    })
    csv_bytes = df.to_csv(index=False).encode("utf-8")
    parquet_bytes = df.to_parquet(index=False)

    conn_csv = FileConnector(csv_bytes, "orders.csv")
    ok, msg = conn_csv.test_connection()
    assert ok
    df_csv = conn_csv.ingest()
    assert len(df_csv) == 3
    assert list(df_csv.columns) == ["order_id", "customer_id", "revenue"]

    conn_pq = FileConnector(parquet_bytes, "orders.parquet")
    ok_pq, _ = conn_pq.test_connection()
    assert ok_pq
    df_pq = conn_pq.ingest()
    assert len(df_pq) == 3


def test_file_connector_json_nested():
    data = {
        "status": "success",
        "data": {
            "items": [
                {"id": 1, "name": "Alpha", "amount": 100},
                {"id": 2, "name": "Beta", "amount": 250},
            ]
        }
    }
    raw_bytes = json.dumps(data).encode("utf-8")
    conn = FileConnector(raw_bytes, "api_export.json")
    df = conn.ingest()
    assert len(df) == 2
    assert "amount" in df.columns


def test_suggested_questions_generation():
    df = pd.DataFrame({
        "customer_region": ["North", "South", "East", "West"] * 25,
        "revenue": [100.0, 250.0, 300.0, 400.0] * 25,
        "satisfaction_score": [4.2, 4.8, 3.9, 4.5] * 25,
        "order_date": pd.date_range("2026-01-01", periods=100),
    })
    profile = profile_frame(df)
    questions = profile.get("suggested_questions", [])
    assert len(questions) >= 4
    categories = [q["category"] for q in questions]
    assert "ranking" in categories
    assert "forecasting" in categories
    assert "correlation" in categories


def test_cross_source_matcher_and_joins():
    df_sales = pd.DataFrame({
        "order_id": ["O1", "O2", "O3", "O4"],
        "customer_id": ["C1", "C2", "C3", "C4"],
        "total_amount": [120, 450, 300, 800],
    })
    df_customers = pd.DataFrame({
        "client_id": ["C1", "C2", "C3", "C5"],
        "client_name": ["Alice", "Bob", "Charlie", "David"],
        "loyalty_tier": ["Gold", "Silver", "Platinum", "Bronze"],
    })
    datasets = {"sales": df_sales, "crm": df_customers}
    joins = CrossSourceMatcher.find_relationships(datasets)
    assert len(joins) >= 1
    join = joins[0]
    assert join.source_a_column in ("customer_id", "client_id")
    assert join.source_b_column in ("customer_id", "client_id")
    assert join.confidence > 0.5


def test_semantic_classification():
    df_fact = pd.DataFrame({
        "order_id": [f"ORD-{i}" for i in range(100)],
        "revenue": [10.0 * i for i in range(100)],
        "cost": [5.0 * i for i in range(100)],
        "order_date": pd.date_range("2026-01-01", periods=100),
    })
    fact_class = SemanticModelEngine.classify_dataset("f1", "Orders", df_fact)
    assert fact_class.classification == "fact"
    assert "revenue" in fact_class.measures


def test_dataset_preview_endpoint(client):
    res = client.get("/datasets/demo-sales/preview?limit=10")
    assert res.status_code == 200
    data = res.json()
    assert "rows" in data
    assert len(data["rows"]) == 10
    assert "columns" in data
    assert "suggested_questions" in data
    assert len(data["suggested_questions"]) > 0


def test_sources_lineage_and_relationships(client):
    res_rel = client.get("/sources/relationships")
    assert res_rel.status_code == 200
    assert "classifications" in res_rel.json()

    res_lin = client.get("/sources/lineage")
    assert res_lin.status_code == 200
    assert "nodes" in res_lin.json()
    assert "edges" in res_lin.json()
