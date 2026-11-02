# Schema Drift Detection & Reconciliation

In production, source schemas change without notice: columns are renamed, fields are deprecated, new metrics appear, and data types evolve. NEXUS provides automated drift tracking and conflict resolution.

---

## 1. Drift Types Detected

| Drift Type | Severity | Description | NEXUS Action |
| :--- | :--- | :--- | :--- |
| **New Column** | Low | New attribute in API payload or file upload | Auto-registered into schema & profile |
| **Dropped Column** | Medium | Previously present column missing | Flagged with warning in lineage |
| **Type Evolution** | High | Integer column becomes string / float | Coerced to compatible highest-order type |
| **Cardinality Surge** | Low | Low cardinality column becomes high cardinality | Re-classified from categorical to text |

---

## 2. Multi-Source Conflict Resolution

When two sources contain duplicate records for the same entity with conflicting values (e.g. CRM API says customer state is `CA`, Billing DB says `NY`), NEXUS applies configurable reconciliation policies:

1. **`source_priority`**: Favors authoritative system of record (e.g. PostgreSQL DB > CRM API > Flat CSV).
2. **`latest_timestamp`**: Prefers the record with the most recent transaction or update timestamp.
3. **`non_null_coalesce`**: Fills missing attributes from secondary sources without overwriting populated values.

Discrepancies are logged in an audit matrix via `POST /sources/reconcile`.
