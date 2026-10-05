from fastapi.testclient import TestClient

from nexus_api.main import app
from nexus_api import main as api_main


client = TestClient(app)


def test_health_and_dataset_profile_are_live():
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    datasets = client.get("/datasets").json()
    demo = next(item for item in datasets if item["id"] == "demo-sales")
    assert demo["source"] == "demo"
    assert demo["profile"]["row_count"] > 1000
    assert "revenue" in demo["profile"]["numeric_columns"]


def test_analysis_trace_and_markdown_report_end_to_end():
    response = client.post("/analysis", json={"dataset_id": "demo-sales", "question": "Which region has the highest revenue?"})
    assert response.status_code == 200
    result = response.json()
    assert result["validation"]["passed"]
    assert result["findings"]
    assert client.get(f"/analysis/{result['run_id']}/trace").json()
    assert client.get(f"/analysis/{result['run_id']}/insights").json()[0]["evidence"]
    report = client.post("/reports/generate", params={"run_id": result["run_id"]})
    assert report.status_code == 200
    assert "Executive Analysis" in report.text


def test_upload_rejects_unsupported_format():
    response = client.post("/datasets/upload", files={"file": ("notes.txt", b"not a table", "text/plain")})
    assert response.status_code == 415


def test_cleaning_preview_and_apply_preserve_original_and_create_derived_copy(tmp_path, monkeypatch):
    monkeypatch.setattr(api_main, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(api_main, "MANIFEST", tmp_path / "datasets.json")
    monkeypatch.setattr(api_main, "RUN_DIR", tmp_path / "runs")
    monkeypatch.setattr(api_main, "datasets", {})
    monkeypatch.setattr(api_main, "frames", {})
    monkeypatch.setattr(api_main, "runs", {})
    api_main.UPLOAD_DIR.mkdir(parents=True)
    api_main.RUN_DIR.mkdir(parents=True)

    csv = b"city,comment,amount\n Mumbai , ok ,1\nMumbai,unknown,2\nMumbai,unknown,2\n"
    uploaded = client.post("/datasets/upload", files={"file": ("messy.csv", csv, "text/csv")})
    assert uploaded.status_code == 200
    original = uploaded.json()
    operations = ["normalize_missing_values", "trim_whitespace", "remove_exact_duplicates"]

    plan = client.get(f"/datasets/{original['id']}/cleaning")
    assert plan.status_code == 200
    assert len(plan.json()["issues"]) == 3

    preview = client.post(f"/datasets/{original['id']}/cleaning/preview", json={"operations": operations})
    assert preview.status_code == 200
    assert preview.json()["changes"] == {
        "missing_values_normalized": 2,
        "text_values_trimmed": 2,
        "rows_removed": 1,
    }
    assert preview.json()["before"]["row_count"] == 3
    assert preview.json()["after"]["row_count"] == 2
    assert original["profile"]["row_count"] == 3

    applied = client.post(f"/datasets/{original['id']}/cleaning/apply", json={"operations": operations})
    assert applied.status_code == 200
    derived = applied.json()["dataset"]
    assert derived["id"] != original["id"]
    assert derived["derived_from"] == original["id"]
    assert derived["transformations"] == operations
    assert derived["profile"]["row_count"] == 2
    assert api_main.frames[original["id"]].shape[0] == 3
    assert api_main.frames[derived["id"]].shape[0] == 2

    repeated = client.post(f"/datasets/{original['id']}/cleaning/apply", json={"operations": operations})
    assert repeated.status_code == 200
    assert repeated.json()["reused"] is True


def test_sql_query_endpoint():
    res = client.post("/sql/query", json={"dataset_id": "demo-sales", "query": "SELECT region, COUNT(*) as count FROM dataset GROUP BY region"})
    assert res.status_code == 200
    data = res.json()
    assert data["columns"] == ["region", "count"]
    assert len(data["rows"]) == 4
    assert data["row_count"] == 4
    assert data["duration_ms"] >= 0


def test_export_dataset_endpoints():
    csv_res = client.get("/datasets/demo-sales/export?format=csv")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "attachment;" in csv_res.headers["content-disposition"]
    assert len(csv_res.content) > 1000

    xlsx_res = client.get("/datasets/demo-sales/export?format=xlsx")
    assert xlsx_res.status_code == 200
    assert "spreadsheetml" in xlsx_res.headers["content-type"]
    assert len(xlsx_res.content) > 1000


def test_health_reports_database_and_capabilities():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["database"] in {"sqlite", "postgresql"}
    assert "statistical_tests" in data["capabilities"]
    assert "clustering" in data["capabilities"]
    assert "forecasting" in data["capabilities"]
