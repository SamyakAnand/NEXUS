from __future__ import annotations

import hashlib
import io
import json
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse

from .analysis import execute_custom_sql, run_analysis
from .cleaning import clean_frame, inspect_cleaning_issues, json_records
from .db import (
    AnalysisRunRecord,
    DATABASE_URL,
    DatasetRecord,
    ReportRecord,
    SessionLocal,
    init_db,
)
from .demo import ensure_demo_file
from .evaluation import CASES, run_evaluation
from .llm import get_configured_provider
from .profiling import profile_frame
from .schemas import (
    AnalysisRequest,
    AnalysisResponse,
    CleaningRequest,
    SqlQueryRequest,
    SqlQueryResponse,
)

DATA_DIR = Path(os.getenv("NEXUS_DATA_DIR", "/tmp/nexus-data" if os.getenv("VERCEL") else "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
RUN_DIR = DATA_DIR / "runs"
MANIFEST = DATA_DIR / "datasets.json"
RUN_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "15")) * 1024 * 1024

app = FastAPI(
    title="NEXUS Analyst API",
    version="0.2.0",
    description="Evidence-led autonomous data analysis API with durable persistence and agent reasoning",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def strip_vercel_api_prefix(request, call_next):
    path = request.scope["path"]
    if path == "/api" or path.startswith("/api/"):
        request.scope["path"] = path[4:] or "/"
        request.scope["raw_path"] = request.scope["raw_path"][4:]
    return await call_next(request)


# In-memory working state for fast querying & manipulation
datasets: dict[str, dict[str, Any]] = {}
frames: dict[str, pd.DataFrame] = {}
runs: dict[str, dict[str, Any]] = {}


def _read_frame(path: Path, suffix: str) -> pd.DataFrame:
    try:
        if suffix == ".csv":
            return pd.read_csv(path, nrows=1_000_000)
        if suffix == ".xlsx":
            return pd.read_excel(path, nrows=1_000_000)
        if suffix == ".json":
            return pd.read_json(path, orient="records")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Unable to parse {suffix.upper()} data: {exc}") from exc
    raise HTTPException(status_code=415, detail="Supported formats are CSV, XLSX, and JSON.")


def _register(
    dataset_id: str,
    name: str,
    path: Path,
    suffix: str,
    derived_from: str | None = None,
    transformations: list[str] | None = None,
) -> dict[str, Any]:
    frame = _read_frame(path, suffix)
    if frame.empty or frame.shape[1] == 0:
        raise HTTPException(status_code=422, detail="The uploaded dataset has no readable rows or columns.")
    if frame.shape[1] > 250:
        raise HTTPException(status_code=422, detail="Datasets are limited to 250 columns in this prototype.")
    profile = profile_frame(frame)
    record = {
        "id": dataset_id,
        "name": name,
        "filename": path.name,
        "format": suffix.removeprefix("."),
        "profile": profile,
        "source": "demo" if dataset_id == "demo-sales" else "upload",
        "storage": str(path),
    }
    if derived_from:
        record["derived_from"] = derived_from
    if transformations:
        record["transformations"] = transformations

    datasets[dataset_id] = record
    frames[dataset_id] = frame

    # Persist to database
    try:
        with SessionLocal() as db:
            existing = db.query(DatasetRecord).filter(DatasetRecord.id == dataset_id).first()
            if existing:
                existing.name = name
                existing.filename = path.name
                existing.format = suffix.removeprefix(".")
                existing.storage_path = str(path)
                existing.row_count = profile["row_count"]
                existing.column_count = profile["column_count"]
                existing.profile = profile
                if derived_from:
                    existing.derived_from = derived_from
                if transformations:
                    existing.transformations = transformations
            else:
                db_record = DatasetRecord(
                    id=dataset_id,
                    name=name,
                    filename=path.name,
                    format=suffix.removeprefix("."),
                    source=record["source"],
                    storage_path=str(path),
                    row_count=profile["row_count"],
                    column_count=profile["column_count"],
                    profile=profile,
                    derived_from=derived_from,
                    transformations=transformations,
                )
                db.add(db_record)
            db.commit()
    except Exception:
        pass

    # Keep file manifest for compatibility
    try:
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST.write_text(json.dumps(list(datasets.values()), indent=2), encoding="utf-8")
    except Exception:
        pass

    return record


def _restore() -> None:
    # 1. Initialize DB schema
    try:
        init_db()
    except Exception:
        pass

    # 2. Restore from DB if records exist
    restored_from_db = False
    try:
        with SessionLocal() as db:
            db_datasets = db.query(DatasetRecord).all()
            for record in db_datasets:
                source = Path(record.storage_path)
                if source.exists():
                    try:
                        _register(
                            record.id,
                            record.name,
                            source,
                            "." + record.format,
                            record.derived_from,
                            record.transformations,
                        )
                        restored_from_db = True
                    except Exception:
                        continue

            db_runs = db.query(AnalysisRunRecord).all()
            for run_rec in db_runs:
                runs[run_rec.id] = run_rec.to_dict()
    except Exception:
        pass

    # 3. Fallback to file manifest if DB was empty
    if not restored_from_db:
        try:
            saved = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            saved = []
        for record in saved:
            source = Path(record.get("storage", ""))
            if source.exists():
                try:
                    _register(
                        record["id"],
                        record["name"],
                        source,
                        "." + record["format"],
                        record.get("derived_from"),
                        record.get("transformations"),
                    )
                except Exception:
                    continue

    # 4. Ensure demo dataset exists
    demo_path = ensure_demo_file(DATA_DIR / "demo_sales.csv")
    if "demo-sales" not in datasets:
        _register("demo-sales", "Retail Operations · demo", demo_path, ".csv")

    # 5. Restore saved file runs
    for path in RUN_DIR.glob("*.json"):
        try:
            item = json.loads(path.read_text(encoding="utf-8"))
            if item.get("run_id") and item["run_id"] not in runs:
                runs[item["run_id"]] = item
        except (OSError, json.JSONDecodeError, KeyError):
            continue


_restore()


@app.get("/health")
def health() -> dict[str, Any]:
    provider = get_configured_provider()
    db_type = "postgresql" if "postgres" in DATABASE_URL else "sqlite"
    return {
        "status": "ok",
        "datasets": len(datasets),
        "database": db_type,
        "capabilities": [
            "csv",
            "xlsx",
            "json",
            "profiling",
            "pandas",
            "read_only_sql",
            "isolation_forest",
            "statistical_tests",
            "clustering",
            "forecasting",
            "data_cleaning",
            "reports",
            "evaluation",
        ],
        "model_provider": provider["provider"],
        "active_model": provider["model"],
        "langgraph_runtime": "active",
    }


@app.post("/datasets/upload")
async def upload_dataset(file: UploadFile = File(...)) -> dict[str, Any]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".csv", ".xlsx", ".json"}:
        raise HTTPException(status_code=415, detail="Supported formats are CSV, XLSX, and JSON.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if not content or len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Upload must be between 1 byte and {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )
    digest = hashlib.sha256(content).hexdigest()[:16]
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(file.filename or "dataset").name)[:100]
    path = UPLOAD_DIR / f"{digest}-{safe_name}"
    path.write_bytes(content)
    record = _register(digest, Path(file.filename or "Dataset").stem, path, suffix)
    return {k: v for k, v in record.items() if k != "storage"}


@app.get("/datasets")
def list_datasets() -> list[dict[str, Any]]:
    return [{k: v for k, v in item.items() if k != "storage"} for item in datasets.values()]


@app.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str) -> dict[str, Any]:
    if dataset_id not in datasets:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return {k: v for k, v in datasets[dataset_id].items() if k != "storage"}


@app.get("/datasets/{dataset_id}/export")
def export_dataset(dataset_id: str, format: str = "csv") -> Response:
    """Download the dataset in CSV or Excel format."""
    if dataset_id not in frames:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    frame = frames[dataset_id]
    record = datasets[dataset_id]
    stem = re.sub(r"[^A-Za-z0-9._-]", "_", record["name"])[:50]

    if format.lower() == "xlsx":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            frame.to_excel(writer, index=False, sheet_name="Data")
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{stem}.xlsx"'},
        )
    else:
        csv_data = frame.to_csv(index=False)
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{stem}.csv"'},
        )


@app.get("/datasets/{dataset_id}/cleaning")
def get_cleaning_plan(dataset_id: str) -> dict[str, Any]:
    if dataset_id not in frames:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return {"dataset_id": dataset_id, "issues": inspect_cleaning_issues(frames[dataset_id])}


def _cleaning_preview(dataset_id: str, request: CleaningRequest) -> tuple[pd.DataFrame, dict[str, Any]]:
    if dataset_id not in frames:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    source = frames[dataset_id]
    try:
        cleaned, changes = clean_frame(source, request.operations)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    preview = {
        "source_dataset_id": dataset_id,
        "operations": request.operations,
        "changes": changes,
        "before": profile_frame(source),
        "after": profile_frame(cleaned),
        "sample_before": json_records(source),
        "sample_after": json_records(cleaned),
    }
    return cleaned, preview


@app.post("/datasets/{dataset_id}/cleaning/preview")
def preview_cleaning(dataset_id: str, request: CleaningRequest) -> dict[str, Any]:
    _, preview = _cleaning_preview(dataset_id, request)
    return preview


@app.post("/datasets/{dataset_id}/cleaning/apply")
def apply_cleaning(dataset_id: str, request: CleaningRequest) -> dict[str, Any]:
    cleaned, preview = _cleaning_preview(dataset_id, request)
    source_record = datasets[dataset_id]
    operation_key = json.dumps(request.operations, separators=(",", ":"))
    derived_id = f"{dataset_id}-clean-{hashlib.sha256(operation_key.encode()).hexdigest()[:8]}"
    if derived_id in datasets:
        return {"dataset": {k: v for k, v in datasets[derived_id].items() if k != "storage"}, "preview": preview, "reused": True}

    stem = re.sub(r"[^A-Za-z0-9._-]", "_", Path(source_record["filename"]).stem)[:80] or "dataset"
    path = UPLOAD_DIR / f"{derived_id}-{stem}-cleaned.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    cleaned.to_csv(path, index=False)
    record = _register(
        derived_id,
        f"{source_record['name']} · cleaned",
        path,
        ".csv",
        derived_from=dataset_id,
        transformations=request.operations,
    )
    return {"dataset": {k: v for k, v in record.items() if k != "storage"}, "preview": preview, "reused": False}


@app.post("/sql/query", response_model=SqlQueryResponse)
def run_sql_query(request: SqlQueryRequest) -> SqlQueryResponse:
    """Execute a safe read-only SQL query against the dataset."""
    if request.dataset_id not in frames:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    try:
        cols, rows, dur_ms = execute_custom_sql(frames[request.dataset_id], request.query)
        return SqlQueryResponse(columns=cols, rows=rows, row_count=len(rows), duration_ms=dur_ms)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/analysis", response_model=AnalysisResponse)
def create_analysis(request: AnalysisRequest) -> AnalysisResponse:
    if request.dataset_id not in frames:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    result = run_analysis(request.dataset_id, frames[request.dataset_id], request.question)
    payload = result.model_dump(mode="json")
    runs[result.run_id] = payload

    # Persist run to SQLite/PostgreSQL
    try:
        with SessionLocal() as db:
            run_rec = AnalysisRunRecord(
                id=result.run_id,
                dataset_id=result.dataset_id,
                question=result.question,
                answer=result.answer,
                selected_tools=result.tools,
                findings=[f.model_dump() for f in result.findings],
                profile_summary=result.profile_summary,
                visualization=result.visualization,
                visualizations=result.visualizations,
                trace=[t.model_dump() for t in result.trace],
                latency_ms=result.latency_ms,
                token_usage=result.token_usage,
                estimated_cost_usd=result.estimated_cost_usd,
                model_name=result.model_name,
                validation=result.validation,
            )
            db.add(run_rec)
            db.commit()
    except Exception:
        pass

    # Save to disk run dir
    try:
        (RUN_DIR / f"{result.run_id}.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except Exception:
        pass

    return result


@app.get("/analysis/{run_id}")
def get_analysis(run_id: str) -> dict[str, Any]:
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Analysis run not found.")
    return runs[run_id]


@app.get("/analysis/{run_id}/trace")
def get_trace(run_id: str) -> list[dict[str, Any]]:
    return get_analysis(run_id)["trace"]


@app.get("/analysis/{run_id}/insights")
def get_insights(run_id: str) -> list[dict[str, Any]]:
    return get_analysis(run_id)["findings"]


@app.post("/reports/generate", response_class=PlainTextResponse)
def generate_report(run_id: str) -> str:
    run = get_analysis(run_id)
    lines = [
        "# NEXUS Executive Analysis",
        "",
        f"**Question:** {run['question']}",
        f"**Run:** `{run_id}`",
        f"**Dataset:** `{run['dataset_id']}`",
        "",
        "## Executive summary",
        "",
        run["answer"],
        "",
        "## Key findings",
    ]
    for index, finding in enumerate(run["findings"], 1):
        lines += [
            "",
            f"### {index}. {finding['title']}",
            finding["detail"],
            f"Confidence: {finding['confidence']}",
        ]
        lines += [f"- Evidence: {e}" for e in finding["evidence"]]
        if finding.get("caveat"):
            lines.append(f"- Caveat: {finding['caveat']}")

    model_label = run.get("model_name") or "Deterministic engine"
    tokens_label = f"{run['token_usage']:,}" if run.get("token_usage") else "unavailable (deterministic mode)"
    cost_label = f"${run['estimated_cost_usd']:.5f}" if run.get("estimated_cost_usd") else "unavailable"

    lines += [
        "",
        "## Method & Provenance",
        "",
        f"The analysis was orchestrated with {model_label} and deterministic tools (Pandas, SciPy, SQLite).",
        f"- Measured API latency: {run['latency_ms']:.2f} ms",
        f"- Token usage: {tokens_label}",
        f"- Estimated cost: {cost_label}",
        "",
    ]
    report_text = "\n".join(lines)

    # Persist report
    try:
        with SessionLocal() as db:
            rep = ReportRecord(id=str(uuid.uuid4()), run_id=run_id, format="markdown", content=report_text)
            db.add(rep)
            db.commit()
    except Exception:
        pass

    return report_text


@app.get("/evaluations")
def get_evaluations() -> dict[str, Any]:
    return {"cases": CASES, "last_run": None, "status": "not_run"}


@app.post("/evaluations/run")
def execute_evaluations() -> dict[str, Any]:
    started = time.perf_counter()
    dataset_id = next(iter(datasets))
    report = run_evaluation(frames[dataset_id])
    report["dataset_id"] = dataset_id
    report["run_id"] = str(uuid.uuid4())
    report["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
    return report


@app.get("/analysis/{run_id}/profile")
def analysis_profile(run_id: str) -> dict[str, Any]:
    run = get_analysis(run_id)
    return profile_frame(frames[run["dataset_id"]])
