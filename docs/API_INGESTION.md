# REST API Ingestion Specification

NEXUS ingests enterprise data directly from third-party REST and GraphQL APIs without requiring manual CSV exports or intermediate ETL steps.

---

## 1. Capabilities Overview

| Feature | Details |
| :--- | :--- |
| **HTTP Methods** | `GET`, `POST` with JSON or raw payloads |
| **Authentication** | Bearer Token, API Key in Header/Param, Basic Auth |
| **Pagination Modes** | Page Number, Offset/Limit, Cursor Token, Next URL |
| **Response Parsing** | Automatic nested array discovery & custom dot-notation paths |
| **Fault Tolerance** | Exponential backoff retry on HTTP 429 & 5xx, configurable timeouts |

---

## 2. Dynamic Pagination Schemes

### Page-Based Pagination
```text
Request 1: GET /api/v1/orders?page=1&per_page=100
Request 2: GET /api/v1/orders?page=2&per_page=100
Stop Condition: Returned records < requested per_page or max_pages reached.
```

### Offset / Limit Pagination
```text
Request 1: GET /api/v1/transactions?limit=100&offset=0
Request 2: GET /api/v1/transactions?limit=100&offset=100
Stop Condition: Returned records < limit or max_records reached.
```

### Cursor & Next URL Pagination
```text
Request 1: GET /api/v1/logs?limit=50
Response:  {"next_cursor": "cur_982ab1", "records": [...]}
Request 2: GET /api/v1/logs?limit=50&cursor=cur_982ab1
Stop Condition: next_cursor is null or unchanged.
```

---

## 3. Nested Response Intelligence

APIs rarely return flat arrays at the root. NEXUS automatically detects nested record collections by inspecting typical wrapper keys:
`data`, `results`, `items`, `records`, `rows`, `payload`, `elements`, `content`.

Users can also specify an exact dot-notation path, e.g.:
```text
response.payload.orders.items
```
NEXUS extracts the collection, normalizes nested objects into flat dot-notation columns (`customer.address.city` -> `customer_address_city`), and prepares it for instant statistical profiling and AI analysis.
