from __future__ import annotations

import pytest
from types import SimpleNamespace

from nexus_api import db
from nexus_api import main
from nexus_api.schemas import AnalysisRequest


def test_init_db_propagates_schema_failure_without_switching_databases(monkeypatch):
    failure = RuntimeError("configured database is unavailable")
    monkeypatch.setattr(db, "engine", object())
    monkeypatch.setattr(db.Base.metadata, "create_all", lambda **_: (_ for _ in ()).throw(failure))

    def unexpected_fallback(*args, **kwargs):
        pytest.fail("database initialization must not silently create a SQLite fallback")

    monkeypatch.setattr(db, "create_engine", unexpected_fallback)

    with pytest.raises(RuntimeError, match="configured database is unavailable"):
        db.init_db()


def test_application_startup_propagates_database_initialization_failure(monkeypatch):
    def fail_startup():
        raise RuntimeError("configured database is unavailable")

    monkeypatch.setattr(main, "init_db", fail_startup)

    with pytest.raises(RuntimeError, match="configured database is unavailable"):
        main._restore()


def test_dataset_registration_propagates_database_write_failure(monkeypatch, tmp_path):
    class Query:
        def filter(self, *_):
            return self

        def first(self):
            return None

    class Session:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def query(self, *_):
            return Query()

        def add(self, _):
            pass

        def commit(self):
            raise RuntimeError("database write failed")

    source = tmp_path / "dataset.csv"
    source.write_text("value\n1\n", encoding="utf-8")
    monkeypatch.setattr(main, "SessionLocal", Session)
    monkeypatch.setattr(main, "datasets", {})
    monkeypatch.setattr(main, "frames", {})
    monkeypatch.setattr(main, "MANIFEST", tmp_path / "manifest.json")

    with pytest.raises(RuntimeError, match="database write failed"):
        main._register("dataset-id", "Dataset", source, ".csv")


def test_analysis_run_is_not_published_when_database_write_fails(monkeypatch):
    class FailedSession:
        def __enter__(self):
            raise RuntimeError("database write failed")

        def __exit__(self, *_):
            return False

    result = SimpleNamespace(
        run_id="failed-run",
        model_dump=lambda **_: {"run_id": "failed-run"},
    )
    monkeypatch.setattr(main, "frames", {"dataset-id": object()})
    monkeypatch.setattr(main, "runs", {})
    monkeypatch.setattr(main, "run_analysis", lambda *_: result)
    monkeypatch.setattr(main, "SessionLocal", FailedSession)
    with pytest.raises(RuntimeError, match="database write failed"):
        main.create_analysis(
            AnalysisRequest(dataset_id="dataset-id", question="Summarize this dataset")
        )

    assert "failed-run" not in main.runs


def test_report_generation_propagates_database_write_failure(monkeypatch):
    class FailedSession:
        def __enter__(self):
            raise RuntimeError("database write failed")

        def __exit__(self, *_):
            return False

    monkeypatch.setattr(
        main,
        "get_analysis",
        lambda _: {
            "question": "Summarize this dataset",
            "dataset_id": "dataset-id",
            "answer": "Summary",
            "findings": [],
            "model_name": None,
            "token_usage": None,
            "estimated_cost_usd": None,
            "latency_ms": 1.0,
        },
    )
    monkeypatch.setattr(main, "SessionLocal", FailedSession)

    with pytest.raises(RuntimeError, match="database write failed"):
        main.generate_report("run-id")
