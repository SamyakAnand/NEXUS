# Connector Architecture & Plugin Specification

NEXUS uses a modular connector architecture designed for zero friction extensibility. Every data source implements a unified contract defined by the `BaseConnector` abstract base class.

---

## 1. The Core Connector Interface

```python
from abc import ABC, abstractmethod
from typing import Tuple, Optional
import pandas as pd

class BaseConnector(ABC):
    """Abstract contract implemented by all NEXUS source connectors."""

    @abstractmethod
    def test_connection(self) -> Tuple[bool, str]:
        """Verify connectivity, network health, and credentials."""
        pass

    @abstractmethod
    def preview(self, limit: int = 10) -> SourcePreview:
        """Fetch sample records and schema without full data extraction."""
        pass

    @abstractmethod
    def ingest(self, max_records: Optional[int] = None) -> pd.DataFrame:
        """Stream and normalize source records into a unified DataFrame."""
        pass
```

---

## 2. Supported Connectors

### 1. `FileConnector`
- **Supported Formats**: CSV, TSV, XLSX, XLS, JSON, JSONL, Parquet, XML.
- **Auto-Detection**: Delimiters, UTF-8 vs Latin-1 encodings, Excel sheet selection, nested JSON path detection.
- **Engine**: Apache Arrow (`pyarrow`) for parquet, `pandas` and `openpyxl` for spreadsheets, `xml.etree` for XML document trees.

### 2. `RESTAPIConnector`
- **Transport**: `httpx` with persistent client connection pooling.
- **Authentication**: Bearer tokens, API keys, HTTP Basic auth, custom headers.
- **Pagination**: Offset/limit, page-based, cursor-based, next-page URLs.
- **Resilience**: Jittered exponential backoff for HTTP 429 (Rate Limit Exceeded) and 5xx server errors.

### 3. `SQLDatabaseConnector`
- **Supported Engines**: PostgreSQL, MySQL, SQLite, Microsoft SQL Server.
- **Execution**: Parameterized SQL queries or direct table extracts with automatic schema inspection and pooling via SQLAlchemy 2.0.

---

## 3. Creating a Custom Connector

To add a new connector (e.g., Snowflake, BigQuery, MongoDB, GraphQL):

1. Subclass `BaseConnector` in `nexus_api.connectors`.
2. Implement `test_connection()`, `preview()`, and `ingest()`.
3. Register the connector type in the factory dispatcher in `nexus_api.main`.
