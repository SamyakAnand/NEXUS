"use client";

import { useState } from "react";
import {
  FiCheck,
  FiCode,
  FiDatabase,
  FiGlobe,
  FiPlus,
  FiRefreshCw,
  FiServer,
  FiUploadCloud,
  FiX,
  FiZap,
} from "react-icons/fi";
import { api, type APIConnectPayload, type DBConnectPayload, type Dataset } from "@/lib/api";

interface ConnectSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSourceConnected: (dataset: Dataset) => void;
}

export function ConnectSourceModal({
  isOpen,
  onClose,
  onSourceConnected,
}: ConnectSourceModalProps) {
  const [sourceType, setSourceType] = useState<"api" | "db" | "file">("api");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [previewResult, setPreviewResult] = useState<any>(null);

  // REST API state
  const [apiName, setApiName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiMethod, setApiMethod] = useState<"GET" | "POST">("GET");
  const [authType, setAuthType] = useState<"none" | "bearer" | "api_key">("none");
  const [authToken, setAuthToken] = useState("");
  const [nestedPath, setNestedPath] = useState("");
  const [paginationType, setPaginationType] = useState<"none" | "page" | "offset_limit" | "cursor">("none");
  const [pageSize, setPageSize] = useState(100);
  const [maxRecords, setMaxRecords] = useState(2000);

  // Database state
  const [dbName, setDbName] = useState("");
  const [dbUrl, setDbUrl] = useState("");
  const [dbTable, setDbTable] = useState("");
  const [dbQuery, setDbQuery] = useState("");
  const [availableTables, setAvailableTables] = useState<string[]>([]);

  if (!isOpen) return null;

  const testApi = async () => {
    if (!apiUrl.trim()) {
      setErrorMsg("Please provide an API URL.");
      return;
    }
    setBusy(true);
    setErrorMsg("");
    setPreviewResult(null);

    const payload: APIConnectPayload = {
      name: apiName || "API Source",
      url: apiUrl,
      method: apiMethod,
      auth_type: authType,
      auth_token: authToken || undefined,
      nested_records_path: nestedPath || undefined,
      pagination_type: paginationType,
      page_size: pageSize,
      max_records: 10,
    };

    try {
      const res = await api.previewApi(payload);
      setPreviewResult(res);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to preview API.");
    } finally {
      setBusy(false);
    }
  };

  const connectApi = async () => {
    if (!apiUrl.trim() || !apiName.trim()) {
      setErrorMsg("Please specify both a source name and URL.");
      return;
    }
    setBusy(true);
    setErrorMsg("");

    const payload: APIConnectPayload = {
      name: apiName,
      url: apiUrl,
      method: apiMethod,
      auth_type: authType,
      auth_token: authToken || undefined,
      nested_records_path: nestedPath || undefined,
      pagination_type: paginationType,
      page_size: pageSize,
      max_records: maxRecords,
    };

    try {
      const ds = await api.connectApi(payload);
      onSourceConnected(ds);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to ingest API data.");
    } finally {
      setBusy(false);
    }
  };

  const testDb = async () => {
    if (!dbUrl.trim()) {
      setErrorMsg("Please provide a database connection string.");
      return;
    }
    setBusy(true);
    setErrorMsg("");

    const payload: DBConnectPayload = {
      name: dbName || "Database Source",
      connection_url: dbUrl,
      table_name: dbTable || undefined,
      query: dbQuery || undefined,
    };

    try {
      const res = await api.previewDb(payload);
      setAvailableTables(res.available_tables || []);
      setPreviewResult(res.preview);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to connect to database.");
    } finally {
      setBusy(false);
    }
  };

  const connectDb = async () => {
    if (!dbUrl.trim() || !dbName.trim()) {
      setErrorMsg("Please specify source name and connection string.");
      return;
    }
    setBusy(true);
    setErrorMsg("");

    const payload: DBConnectPayload = {
      name: dbName,
      connection_url: dbUrl,
      table_name: dbTable || undefined,
      query: dbQuery || undefined,
      max_records: maxRecords,
    };

    try {
      const ds = await api.connectDb(payload);
      onSourceConnected(ds);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to extract database records.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="explorer-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="explorer-modal-container connect-source-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="explorer-modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge">
              <FiPlus size={18} />
            </div>
            <div>
              <h3>Connect Enterprise Data Source</h3>
              <p>Source-agnostic ingestion with automatic schema matching &amp; profiling</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="modal-close-btn" aria-label="Close dialog">
            <FiX size={18} />
          </button>
        </div>

        {/* Source Type Selector */}
        <div className="source-type-pill-bar">
          <button
            type="button"
            className={`source-type-pill ${sourceType === "api" ? "active" : ""}`}
            onClick={() => {
              setSourceType("api");
              setPreviewResult(null);
            }}
          >
            <FiGlobe size={16} />
            <div>
              <strong>REST / GraphQL API</strong>
              <small>Custom auth, pagination &amp; nested path</small>
            </div>
          </button>
          <button
            type="button"
            className={`source-type-pill ${sourceType === "db" ? "active" : ""}`}
            onClick={() => {
              setSourceType("db");
              setPreviewResult(null);
            }}
          >
            <FiDatabase size={16} />
            <div>
              <strong>SQL Database</strong>
              <small>PostgreSQL, MySQL, SQLite, SQL Server</small>
            </div>
          </button>
        </div>

        {errorMsg && (
          <div className="source-error-banner">
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <div className="connect-form-body">
          {sourceType === "api" ? (
            <div className="api-config-fields">
              <div className="two-col-row">
                <div className="form-group">
                  <label>Dataset Display Name</label>
                  <input
                    type="text"
                    value={apiName}
                    onChange={(e) => setApiName(e.target.value)}
                    placeholder="e.g. Stripe Transactions API"
                    className="modal-input"
                  />
                </div>
                <div className="form-group method-group">
                  <label>HTTP Method</label>
                  <select
                    value={apiMethod}
                    onChange={(e) => setApiMethod(e.target.value as any)}
                    className="modal-select"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Endpoint URL</label>
                <input
                  type="url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.example.com/v1/sales"
                  className="modal-input"
                />
              </div>

              <div className="two-col-row">
                <div className="form-group">
                  <label>Authentication</label>
                  <select
                    value={authType}
                    onChange={(e) => setAuthType(e.target.value as any)}
                    className="modal-select"
                  >
                    <option value="none">Public / No Auth</option>
                    <option value="bearer">Bearer Token (Header)</option>
                    <option value="api_key">API Key (Header: x-api-key)</option>
                  </select>
                </div>
                {authType !== "none" && (
                  <div className="form-group">
                    <label>Token / Key</label>
                    <input
                      type="password"
                      value={authToken}
                      onChange={(e) => setAuthToken(e.target.value)}
                      placeholder="sk_live_..."
                      className="modal-input"
                    />
                  </div>
                )}
              </div>

              <div className="two-col-row">
                <div className="form-group">
                  <label>Nested Records JSON Path (Optional)</label>
                  <input
                    type="text"
                    value={nestedPath}
                    onChange={(e) => setNestedPath(e.target.value)}
                    placeholder="e.g. data.items (auto-detected if blank)"
                    className="modal-input"
                  />
                </div>
                <div className="form-group">
                  <label>Pagination Strategy</label>
                  <select
                    value={paginationType}
                    onChange={(e) => setPaginationType(e.target.value as any)}
                    className="modal-select"
                  >
                    <option value="none">Single Page</option>
                    <option value="page">Page-Based (?page=1)</option>
                    <option value="offset_limit">Offset / Limit (?offset=0&amp;limit=100)</option>
                    <option value="cursor">Cursor-Based</option>
                  </select>
                </div>
              </div>

              <div className="two-col-row">
                <div className="form-group">
                  <label>Max Records Ingest Limit</label>
                  <input
                    type="number"
                    value={maxRecords}
                    onChange={(e) => setMaxRecords(Number(e.target.value))}
                    className="modal-input"
                    max={25000}
                  />
                </div>
                <div className="action-buttons-wrap">
                  <button
                    type="button"
                    onClick={testApi}
                    disabled={busy || !apiUrl}
                    className="test-source-btn"
                  >
                    <FiRefreshCw size={14} className={busy ? "spin" : ""} />
                    <span>Test Connection &amp; Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={connectApi}
                    disabled={busy || !apiUrl || !apiName}
                    className="connect-source-btn"
                  >
                    <FiZap size={14} />
                    <span>Ingest API Dataset</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="db-config-fields">
              <div className="form-group">
                <label>Dataset Display Name</label>
                <input
                  type="text"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  placeholder="e.g. Production PostgreSQL Orders"
                  className="modal-input"
                />
              </div>

              <div className="form-group">
                <label>Database Connection URL</label>
                <input
                  type="text"
                  value={dbUrl}
                  onChange={(e) => setDbUrl(e.target.value)}
                  placeholder="postgresql://user:pass@host:5432/dbname or sqlite:///file.db"
                  className="modal-input"
                />
                <small className="field-hint">Supports PostgreSQL, MySQL, SQLite, and SQL Server connection strings.</small>
              </div>

              {availableTables.length > 0 && (
                <div className="form-group">
                  <label>Select Table</label>
                  <select
                    value={dbTable}
                    onChange={(e) => setDbTable(e.target.value)}
                    className="modal-select"
                  >
                    <option value="">-- Choose a table --</option>
                    {availableTables.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Or Custom SQL Extraction Query</label>
                <textarea
                  value={dbQuery}
                  onChange={(e) => setDbQuery(e.target.value)}
                  rows={3}
                  placeholder="SELECT order_id, customer_id, total, created_at FROM orders WHERE status = 'completed'"
                  className="modal-textarea"
                />
              </div>

              <div className="action-buttons-wrap">
                <button
                  type="button"
                  onClick={testDb}
                  disabled={busy || !dbUrl}
                  className="test-source-btn"
                >
                  <FiRefreshCw size={14} className={busy ? "spin" : ""} />
                  <span>Test DB &amp; List Tables</span>
                </button>
                <button
                  type="button"
                  onClick={connectDb}
                  disabled={busy || !dbUrl || !dbName || (!dbTable && !dbQuery)}
                  className="connect-source-btn"
                >
                  <FiZap size={14} />
                  <span>Extract &amp; Ingest Dataset</span>
                </button>
              </div>
            </div>
          )}

          {/* Live Preview Pane */}
          {previewResult && (
            <div className="source-preview-pane">
              <div className="preview-pane-header">
                <FiCheck size={14} className="preview-check" />
                <strong>Live Source Preview Verified</strong>
                <span>{previewResult.record_count} records detected</span>
              </div>
              <div className="preview-fields-pills">
                {previewResult.fields?.map((f: any) => (
                  <span key={f.name} className="preview-field-pill">
                    {f.name} <small>({f.dtype})</small>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
