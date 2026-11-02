from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator

# Determine DB URL: prefer DATABASE_URL if provided, else fallback to SQLite
DATA_DIR = Path(os.getenv("NEXUS_DATA_DIR", "/tmp/nexus-data" if os.getenv("VERCEL") else "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_SQLITE_URL = f"sqlite:///{DATA_DIR.resolve()}/nexus.db"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL)

# Normalize postgresql+psycopg if dialect prefix is needed
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://") and "+psycopg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)


class JSONType(TypeDecorator):
    """Platform-independent JSON type using Text storage for SQLite and JSON/native for others."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> str | None:
        if value is None:
            return None
        return json.dumps(value)

    def process_result_value(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, (dict, list)):
            return value
        try:
            return json.loads(value)
        except Exception:
            return value


class Base(DeclarativeBase):
    pass


class DatasetRecord(Base):
    __tablename__ = "datasets"

    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    filename = Column(String(255), nullable=False)
    format = Column(String(32), nullable=False)
    source = Column(String(64), nullable=False, default="upload")
    storage_path = Column(Text, nullable=False)
    row_count = Column(Integer, nullable=False, default=0)
    column_count = Column(Integer, nullable=False, default=0)
    profile = Column(JSONType, nullable=False, default=dict)
    derived_from = Column(String(64), nullable=True)
    transformations = Column(JSONType, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "filename": self.filename,
            "format": self.format,
            "source": self.source,
            "profile": self.profile or {},
            "storage": self.storage_path,
            **({"derived_from": self.derived_from} if self.derived_from else {}),
            **({"transformations": self.transformations} if self.transformations else {}),
        }


class AnalysisRunRecord(Base):
    __tablename__ = "analysis_runs"

    id = Column(String(64), primary_key=True)
    dataset_id = Column(String(64), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    selected_tools = Column(JSONType, nullable=False, default=list)
    findings = Column(JSONType, nullable=False, default=list)
    profile_summary = Column(JSONType, nullable=False, default=dict)
    visualization = Column(JSONType, nullable=True)
    visualizations = Column(JSONType, nullable=False, default=list)
    trace = Column(JSONType, nullable=False, default=list)
    latency_ms = Column(Float, nullable=False, default=0.0)
    token_usage = Column(Integer, nullable=True)
    estimated_cost_usd = Column(Float, nullable=True)
    model_name = Column(String(128), nullable=True)
    validation = Column(JSONType, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.id,
            "dataset_id": self.dataset_id,
            "question": self.question,
            "answer": self.answer,
            "tools": self.selected_tools or [],
            "findings": self.findings or [],
            "profile_summary": self.profile_summary or {},
            "visualization": self.visualization,
            "visualizations": self.visualizations or [],
            "trace": self.trace or [],
            "latency_ms": self.latency_ms,
            "token_usage": self.token_usage,
            "estimated_cost_usd": self.estimated_cost_usd,
            "model_name": self.model_name,
            "validation": self.validation or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ReportRecord(Base):
    __tablename__ = "reports"

    id = Column(String(64), primary_key=True)
    run_id = Column(String(64), ForeignKey("analysis_runs.id", ondelete="CASCADE"), nullable=False)
    format = Column(String(32), nullable=False, default="markdown")
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class InquiryRecord(Base):
    __tablename__ = "inquiries"

    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


# Engine setup with fallback
def _get_engine():
    try:
        if DATABASE_URL.startswith("sqlite"):
            return create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
        return create_engine(DATABASE_URL, pool_pre_ping=True)
    except Exception as exc:
        # Fallback to local SQLite if connection to Postgres fails
        return create_engine(DEFAULT_SQLITE_URL, connect_args={"check_same_thread": False})


engine = _get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Initialize database tables."""
    global engine, SessionLocal
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        # If external database fails, fallback to SQLite
        engine = create_engine(DEFAULT_SQLITE_URL, connect_args={"check_same_thread": False})
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
