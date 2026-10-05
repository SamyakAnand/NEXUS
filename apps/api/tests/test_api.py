from fastapi.testclient import TestClient

from nexus_api.main import app


client = TestClient(app)


def test_health_and_dataset_profile_are_live():
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    datasets = client.get("/datasets").json()
    demo = next(item for item in datasets if item["id"] == "demo-sales")
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
