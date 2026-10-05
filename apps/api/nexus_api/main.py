from __future__ import annotations

import hashlib
import json
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from .analysis import run_analysis
from .demo import ensure_demo_file
from .evaluation import CASES, run_evaluation
from .profiling import profile_frame
from .schemas import AnalysisRequest, AnalysisResponse

DATA_DIR = Path(os.getenv("NEXUS_DATA_DIR", "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
RUN_DIR = DATA_DIR / "runs"
MANIFEST = DATA_DIR / "datasets.json"
RUN_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "15")) * 1024 * 1024

app = FastAPI(title="NEXUS Analyst API", version="0.1.0", description="Evidence-led deterministic data analysis API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], allow_credentials=True, allow_methods=["GET", "POST"], allow_headers=["*"])

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


def _register(dataset_id: str, name: str, path: Path, suffix: str) -> dict[str, Any]:
    frame = _read_frame(path, suffix)
    if frame.empty or frame.shape[1] == 0:
        raise HTTPException(status_code=422, detail="The uploaded dataset has no readable rows or columns.")
    if frame.shape[1] > 250:
        raise HTTPException(status_code=422, detail="Datasets are limited to 250 columns in this prototype.")
    profile = profile_frame(frame)
    record = {"id": dataset_id, "name": name, "filename": path.name, "format": suffix.removeprefix("."), "profile": profile, "source": "upload" if not name.startswith("Demo") else "demo", "storage": str(path)}
    datasets[dataset_id] = record
    frames[dataset_id] = frame
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(list(datasets.values()), indent=2), encoding="utf-8")
    return record


def _restore() -> None:
    try:
        saved = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        saved = []
    for record in saved:
        source = Path(record.get("storage", ""))
        if source.exists():
            try:
                _register(record["id"], record["name"], source, "." + record["format"])
            except Exception:
                continue
    demo_path = ensure_demo_file(DATA_DIR / "demo_sales.csv")
    if "demo-sales" not in datasets:
        _register("demo-sales", "Retail Operations · demo", demo_path, ".csv")
    for path in RUN_DIR.glob("*.json"):
        try:
            item = json.loads(path.read_text(encoding="utf-8"))
            runs[item["run_id"]] = item
        except (OSError, json.JSONDecodeError, KeyError):
            continue


_restore()


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "datasets": len(datasets), "capabilities": ["csv", "xlsx", "json", "profiling", "pandas", "read_only_sql", "isolation_forest", "reports", "evaluation"], "model_provider": "not_configured", "langgraph_runtime": "optional_dependency"}


@app.post("/datasets/upload")
async def upload_dataset(file: UploadFile = File(...)) -> dict[str, Any]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".csv", ".xlsx", ".json"}:
        raise HTTPException(status_code=415, detail="Supported formats are CSV, XLSX, and JSON.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if not content or len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Upload must be between 1 byte and {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
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


@app.post("/analysis", response_model=AnalysisResponse)
def create_analysis(request: AnalysisRequest) -> AnalysisResponse:
    if request.dataset_id not in frames:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    result = run_analysis(request.dataset_id, frames[request.dataset_id], request.question)
    payload = result.model_dump(mode="json")
    runs[result.run_id] = payload
    (RUN_DIR / f"{result.run_id}.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
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
    lines = ["# NEXUS Executive Analysis", "", f"**Question:** {run['question']}", f"**Run:** `{run_id}`", f"**Dataset:** `{run['dataset_id']}`", "", "## Executive summary", "", run["answer"], "", "## Key findings"]
    for index, finding in enumerate(run["findings"], 1):
        lines += [f"", f"### {index}. {finding['title']}", finding["detail"], f"Confidence: {finding['confidence']}"]
        lines += [f"- Evidence: {e}" for e in finding["evidence"]]
        if finding.get("caveat"):
            lines.append(f"- Caveat: {finding['caveat']}")
    lines += ["", "## Method", "", "The analysis was computed from the selected dataset using deterministic tools. See the run trace for selected tools and validation.", "", f"Measured API latency: {run['latency_ms']:.2f} ms", "Token usage and API cost: unavailable (no model provider configured).", ""]
    return "\n".join(lines)


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
