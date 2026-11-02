"""Enterprise Multi-Source Connectors for NEXUS.

Source-agnostic connector architecture supporting:
- Multi-format files: CSV, TSV, XLSX, JSON, JSONL, Parquet, XML
- REST APIs: Custom auth, headers, query params, nested payload detection,
  pagination (page, offset/limit, cursor), rate limiting with exponential backoff
- SQL Databases: PostgreSQL, MySQL, SQLite, SQL Server
"""

from __future__ import annotations

import io
import json
import re
import time
import xml.etree.ElementTree as ET
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Literal, Optional, Tuple, Union

import numpy as np
import pandas as pd
import httpx
from pydantic import BaseModel, Field


class SourceSchemaField(BaseModel):
    name: str
    dtype: str
    sample_values: List[Any] = Field(default_factory=list)
    nullable: bool = True


class SourcePreview(BaseModel):
    source_type: str
    record_count: int
    fields: List[SourceSchemaField]
    sample_records: List[Dict[str, Any]]
    detected_metadata: Dict[str, Any] = Field(default_factory=dict)


class BaseConnector(ABC):
    """Abstract base class for all NEXUS data source connectors."""

    @abstractmethod
    def test_connection(self) -> Tuple[bool, str]:
        """Verify connectivity to the source."""
        pass

    @abstractmethod
    def preview(self, limit: int = 10) -> SourcePreview:
        """Fetch sample records and schema without loading entire dataset."""
        pass

    @abstractmethod
    def ingest(self, max_records: Optional[int] = None) -> pd.DataFrame:
        """Ingest source data into a normalized pandas DataFrame."""
        pass


class FileConnector(BaseConnector):
    """Source connector for local or uploaded files across various formats."""

    def __init__(self, file_content: bytes, filename: str):
        self.content = file_content
        self.filename = filename
        self.extension = self._detect_extension(filename)

    @staticmethod
    def _detect_extension(filename: str) -> str:
        lower = filename.lower()
        if lower.endswith(".csv"):
            return "csv"
        if lower.endswith(".tsv") or lower.endswith(".tab"):
            return "tsv"
        if lower.endswith(".xlsx") or lower.endswith(".xls"):
            return "xlsx"
        if lower.endswith(".jsonl") or lower.endswith(".ndjson"):
            return "jsonl"
        if lower.endswith(".json"):
            return "json"
        if lower.endswith(".parquet") or lower.endswith(".pq"):
            return "parquet"
        if lower.endswith(".xml"):
            return "xml"
        return "csv"

    def test_connection(self) -> Tuple[bool, str]:
        if not self.content:
            return False, "File is empty (0 bytes)."
        return True, f"File loaded ({len(self.content)} bytes, format: {self.extension.upper()})"

    def _read_dataframe(self, nrows: Optional[int] = None) -> pd.DataFrame:
        stream = io.BytesIO(self.content)

        if self.extension == "csv":
            # Auto-detect encoding & delimiter
            try:
                df = pd.read_csv(stream, nrows=nrows, encoding="utf-8")
            except UnicodeDecodeError:
                stream.seek(0)
                df = pd.read_csv(stream, nrows=nrows, encoding="latin1")
            return df

        elif self.extension == "tsv":
            try:
                df = pd.read_csv(stream, sep="\t", nrows=nrows, encoding="utf-8")
            except UnicodeDecodeError:
                stream.seek(0)
                df = pd.read_csv(stream, sep="\t", nrows=nrows, encoding="latin1")
            return df

        elif self.extension == "xlsx":
            return pd.read_excel(stream, nrows=nrows)

        elif self.extension == "parquet":
            df = pd.read_parquet(stream)
            if nrows is not None and len(df) > nrows:
                df = df.iloc[:nrows]
            return df

        elif self.extension == "jsonl":
            stream.seek(0)
            lines = [json.loads(line) for line in stream.getvalue().decode("utf-8", errors="ignore").splitlines() if line.strip()]
            if nrows:
                lines = lines[:nrows]
            return pd.json_normalize(lines)

        elif self.extension == "json":
            raw = json.loads(self.content.decode("utf-8", errors="ignore"))
            # Auto-detect records array in JSON structure
            records = self._extract_json_records(raw)
            if nrows and len(records) > nrows:
                records = records[:nrows]
            return pd.json_normalize(records)

        elif self.extension == "xml":
            root = ET.fromstring(self.content.decode("utf-8", errors="ignore"))
            # Treat direct children or grand-children as rows
            children = list(root)
            rows = []
            for child in (children[:nrows] if nrows else children):
                row = {}
                for attr, val in child.attrib.items():
                    row[f"@{attr}"] = val
                for elem in child:
                    row[elem.tag] = elem.text
                if not row and child.text:
                    row["value"] = child.text
                rows.append(row)
            return pd.DataFrame(rows)

        else:
            # Fallback to CSV
            return pd.read_csv(stream, nrows=nrows)

    @staticmethod
    def _extract_json_records(data: Any) -> List[Dict[str, Any]]:
        if isinstance(data, list):
            if data and isinstance(data[0], dict):
                return data
            return [{"value": item} for item in data]
        if isinstance(data, dict):
            # Check common container keys
            for key in ["data", "results", "items", "records", "rows", "payload", "elements", "content"]:
                if key in data:
                    res = FileConnector._extract_json_records(data[key])
                    if res and (len(res) > 1 or (len(res) == 1 and res != [data[key]])):
                        return res
            # Check any nested dict value that might be a list of records
            for v in data.values():
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    return v
                elif isinstance(v, dict):
                    sub = FileConnector._extract_json_records(v)
                    if sub and (len(sub) > 1 or (len(sub) == 1 and sub != [v])):
                        return sub
            return [data]
        return [{"value": data}]

    def preview(self, limit: int = 10) -> SourcePreview:
        df = self._read_dataframe(nrows=limit)
        fields = [
            SourceSchemaField(
                name=col,
                dtype=str(df[col].dtype),
                sample_values=df[col].dropna().head(3).tolist(),
                nullable=bool(df[col].isnull().any()),
            )
            for col in df.columns
        ]
        return SourcePreview(
            source_type=f"file/{self.extension}",
            record_count=len(df),
            fields=fields,
            sample_records=df.head(limit).replace({np.nan: None}).to_dict(orient="records"),
            detected_metadata={"filename": self.filename, "format": self.extension, "bytes": len(self.content)},
        )

    def ingest(self, max_records: Optional[int] = None) -> pd.DataFrame:
        return self._read_dataframe(nrows=max_records)


class APIPaginationConfig(BaseModel):
    type: Literal["none", "page", "offset_limit", "cursor", "next_url"] = "none"
    page_param: str = "page"
    limit_param: str = "limit"
    page_size: int = 100
    cursor_param: str = "cursor"
    next_url_path: Optional[str] = "next"
    max_pages: int = 20
    max_records: int = 10000


class RESTAPIConnector(BaseConnector):
    """High-resilience REST API connector with auth, pagination, rate limiting, and nested response path extraction."""

    def __init__(
        self,
        url: str,
        method: Literal["GET", "POST"] = "GET",
        headers: Optional[Dict[str, str]] = None,
        auth_type: Literal["none", "bearer", "api_key", "basic"] = "none",
        auth_token: Optional[str] = None,
        auth_header: str = "Authorization",
        params: Optional[Dict[str, str]] = None,
        body: Optional[Union[Dict[str, Any], str]] = None,
        nested_records_path: Optional[str] = None,
        pagination: Optional[APIPaginationConfig] = None,
        rate_limit_delay_seconds: float = 0.1,
        timeout_seconds: float = 30.0,
    ):
        self.url = url
        self.method = method
        self.headers = headers or {}
        self.auth_type = auth_type
        self.auth_token = auth_token
        self.auth_header = auth_header
        self.params = params or {}
        self.body = body
        self.nested_records_path = nested_records_path
        self.pagination = pagination or APIPaginationConfig()
        self.rate_limit_delay = rate_limit_delay_seconds
        self.timeout = timeout_seconds

        # Configure auth headers
        if self.auth_token:
            if self.auth_type == "bearer":
                self.headers["Authorization"] = f"Bearer {self.auth_token}"
            elif self.auth_type == "api_key":
                self.headers[self.auth_header] = self.auth_token

    def _extract_nested_path(self, data: Any, path: Optional[str]) -> Any:
        if not path:
            return data
        parts = path.strip(".").split(".")
        current = data
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            elif isinstance(current, list) and part.isdigit():
                idx = int(part)
                if 0 <= idx < len(current):
                    current = current[idx]
                else:
                    return None
            else:
                return None
        return current

    def _auto_discover_records(self, payload: Any) -> Tuple[List[Dict[str, Any]], str]:
        """Automatically find the array of records inside any arbitrary JSON structure."""
        if self.nested_records_path:
            extracted = self._extract_nested_path(payload, self.nested_records_path)
            records = FileConnector._extract_json_records(extracted)
            return records, self.nested_records_path

        if isinstance(payload, list):
            return FileConnector._extract_json_records(payload), "root"

        if isinstance(payload, dict):
            # Check popular top-level candidates
            candidates = ["data", "results", "items", "records", "rows", "payload", "elements", "content"]
            for cand in candidates:
                if cand in payload and isinstance(payload[cand], list):
                    return FileConnector._extract_json_records(payload[cand]), cand

            # Check secondary nested e.g. response.items or data.results
            for k, v in payload.items():
                if isinstance(v, dict):
                    for subk, subv in v.items():
                        if isinstance(subv, list):
                            return FileConnector._extract_json_records(subv), f"{k}.{subk}"

            # Fallback to single record or dict values
            for k, v in payload.items():
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    return v, k

            return [payload], "root"

        return [{"value": payload}], "value"

    def _fetch_page(self, client: httpx.Client, url: str, query_params: Dict[str, Any]) -> Any:
        """Executes a single API call with automatic exponential backoff on HTTP 429/503."""
        max_retries = 3
        backoff = 1.0

        for attempt in range(max_retries):
            try:
                if self.method == "POST":
                    req_json = self.body if isinstance(self.body, dict) else None
                    req_content = self.body.encode("utf-8") if isinstance(self.body, str) else None
                    resp = client.post(
                        url,
                        headers=self.headers,
                        params=query_params,
                        json=req_json,
                        content=req_content,
                        timeout=self.timeout,
                    )
                else:
                    resp = client.get(
                        url,
                        headers=self.headers,
                        params=query_params,
                        timeout=self.timeout,
                    )

                if resp.status_code == 429 or (resp.status_code >= 500 and resp.status_code != 501):
                    time.sleep(backoff)
                    backoff *= 2
                    continue

                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError as exc:
                if attempt == max_retries - 1:
                    raise exc
                time.sleep(backoff)
                backoff *= 2
            except httpx.RequestError as exc:
                if attempt == max_retries - 1:
                    raise exc
                time.sleep(backoff)
                backoff *= 2

        raise RuntimeError(f"Failed to fetch {url} after {max_retries} attempts")

    def test_connection(self) -> Tuple[bool, str]:
        try:
            with httpx.Client(follow_redirects=True) as client:
                query = dict(self.params)
                if self.pagination.type == "page":
                    query[self.pagination.page_param] = 1
                elif self.pagination.type == "offset_limit":
                    query[self.pagination.limit_param] = 5
                payload = self._fetch_page(client, self.url, query)
                records, path = self._auto_discover_records(payload)
                return True, f"Connected successfully. Detected {len(records)} records at '{path}'."
        except Exception as exc:
            return False, f"Connection failed: {str(exc)}"

    def preview(self, limit: int = 10) -> SourcePreview:
        with httpx.Client(follow_redirects=True) as client:
            query = dict(self.params)
            if self.pagination.type == "page":
                query[self.pagination.page_param] = 1
            elif self.pagination.type == "offset_limit":
                query[self.pagination.limit_param] = limit
            payload = self._fetch_page(client, self.url, query)
            records, detected_path = self._auto_discover_records(payload)

            df = pd.json_normalize(records[:limit])
            fields = [
                SourceSchemaField(
                    name=col,
                    dtype=str(df[col].dtype),
                    sample_values=df[col].dropna().head(3).tolist(),
                    nullable=bool(df[col].isnull().any()),
                )
                for col in df.columns
            ]
            return SourcePreview(
                source_type="api/rest",
                record_count=len(records),
                fields=fields,
                sample_records=df.head(limit).replace({np.nan: None}).to_dict(orient="records"),
                detected_metadata={
                    "url": self.url,
                    "method": self.method,
                    "detected_path": detected_path,
                    "pagination": self.pagination.type,
                },
            )

    def ingest(self, max_records: Optional[int] = None) -> pd.DataFrame:
        target_max_records = max_records or self.pagination.max_records
        all_records: List[Dict[str, Any]] = []

        with httpx.Client(follow_redirects=True) as client:
            current_page = 1
            current_offset = 0
            current_url = self.url
            current_cursor = None

            for page_idx in range(self.pagination.max_pages):
                query = dict(self.params)

                if self.pagination.type == "page":
                    query[self.pagination.page_param] = current_page
                elif self.pagination.type == "offset_limit":
                    query[self.pagination.limit_param] = self.pagination.page_size
                    query[self.pagination.page_param] = current_offset
                elif self.pagination.type == "cursor" and current_cursor:
                    query[self.pagination.cursor_param] = current_cursor

                payload = self._fetch_page(client, current_url, query)
                records, _ = self._auto_discover_records(payload)

                if not records:
                    break

                all_records.extend(records)

                if len(all_records) >= target_max_records:
                    all_records = all_records[:target_max_records]
                    break

                # Prepare next iteration
                if self.pagination.type == "none":
                    break
                elif self.pagination.type == "page":
                    if len(records) < self.pagination.page_size:
                        break
                    current_page += 1
                elif self.pagination.type == "offset_limit":
                    if len(records) < self.pagination.page_size:
                        break
                    current_offset += len(records)
                elif self.pagination.type == "next_url":
                    next_url = self._extract_nested_path(payload, self.pagination.next_url_path)
                    if not next_url or not isinstance(next_url, str):
                        break
                    current_url = next_url
                elif self.pagination.type == "cursor":
                    next_cursor = self._extract_nested_path(payload, self.pagination.cursor_param)
                    if not next_cursor or next_cursor == current_cursor:
                        break
                    current_cursor = str(next_cursor)

                if self.rate_limit_delay > 0:
                    time.sleep(self.rate_limit_delay)

        if not all_records:
            return pd.DataFrame()

        return pd.json_normalize(all_records)


class SQLDatabaseConnector(BaseConnector):
    """Database connector for PostgreSQL, MySQL, SQLite, and SQL Server."""

    def __init__(self, connection_url: str, query: Optional[str] = None, table_name: Optional[str] = None):
        from sqlalchemy import create_engine, inspect

        self.connection_url = connection_url
        self.query = query
        self.table_name = table_name
        self.engine = create_engine(connection_url, pool_pre_ping=True)

    def test_connection(self) -> Tuple[bool, str]:
        from sqlalchemy import text, inspect

        try:
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            inspector = inspect(self.engine)
            tables = inspector.get_table_names()
            return True, f"Connected successfully. Found {len(tables)} tables: {', '.join(tables[:5])}"
        except Exception as exc:
            return False, f"Database connection failed: {str(exc)}"

    def list_tables(self) -> List[str]:
        from sqlalchemy import inspect
        inspector = inspect(self.engine)
        return inspector.get_table_names()

    def preview(self, limit: int = 10) -> SourcePreview:
        sql = self.query or f"SELECT * FROM {self.table_name} LIMIT {limit}"
        df = pd.read_sql_query(sql, con=self.engine)
        fields = [
            SourceSchemaField(
                name=col,
                dtype=str(df[col].dtype),
                sample_values=df[col].dropna().head(3).tolist(),
                nullable=bool(df[col].isnull().any()),
            )
            for col in df.columns
        ]
        return SourcePreview(
            source_type="database/sql",
            record_count=len(df),
            fields=fields,
            sample_records=df.head(limit).replace({np.nan: None}).to_dict(orient="records"),
            detected_metadata={"table": self.table_name, "query": self.query},
        )

    def ingest(self, max_records: Optional[int] = None) -> pd.DataFrame:
        sql = self.query or f"SELECT * FROM {self.table_name}"
        if max_records and "limit" not in sql.lower():
            sql += f" LIMIT {max_records}"
        return pd.read_sql_query(sql, con=self.engine)
