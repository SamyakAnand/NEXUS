"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise, ArrowRight, ArrowUpRight, ChatCircleText, Check, CircleNotch, CloudArrowUp,
  Cpu, Database, Eye, FileText, Files, Gauge, Gear, Graph, MagnifyingGlass, ShieldCheck,
  Table, WarningCircle, X,
} from "@phosphor-icons/react";
import { ArgusShell } from "@/components/ArgusShell";
import { api, type Analysis, type APIHealth, type Dataset, type DatasetPreview, type EvaluationReport, type LineageGraph, type LocalSession } from "@/lib/api";

const GraphScene = dynamic(() => import("@/components/KnowledgeGraphScene").then(module => module.KnowledgeGraphScene), {
  ssr: false,
  loading: () => <div className="argus-loading"><span /><span /><span />Preparing the lineage view…</div>,
});

export type ProductPageKey = "overview" | "documents" | "search" | "graph" | "sessions" | "evaluation" | "models" | "settings";

const pageInfo: Record<ProductPageKey, { title: string; eyebrow: string }> = {
  overview: { title: "Overview", eyebrow: "WORKSPACE SIGNAL" },
  documents: { title: "Documents", eyebrow: "DATA LIBRARY" },
  search: { title: "Intelligence Search", eyebrow: "ANALYTICAL QUERY" },
  graph: { title: "Knowledge Graph", eyebrow: "SOURCE LINEAGE" },
  sessions: { title: "Research Sessions", eyebrow: "LOCAL HISTORY" },
  evaluation: { title: "Evaluation Lab", eyebrow: "QUALITY MEASUREMENT" },
  models: { title: "Model Observatory", eyebrow: "PROVIDER STATUS" },
  settings: { title: "Settings", eyebrow: "LOCAL CONFIGURATION" },
};

export function ArgusProductPage({ page }: { page: ProductPageKey }) {
  const info = pageInfo[page];
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [health, setHealth] = useState<APIHealth | null>(null);
  const [lineage, setLineage] = useState<LineageGraph | null>(null);
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const loadDatasets = useCallback(async () => {
    const items = await api.datasets();
    setDatasets(items);
    setSelectedDatasetId(current => current || items.find(item => item.id === "demo-sales")?.id || items[0]?.id || "");
    return items;
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError("");
    const load = async () => {
      try {
        if (["overview", "documents", "search"].includes(page)) await loadDatasets();
        if (["overview", "models"].includes(page)) {
          try { const result = await api.health(); if (alive) setHealth(result); }
          catch { if (alive) setHealth(null); }
        }
        if (page === "graph") {
          try { const result = await api.lineage(); if (alive) setLineage(result); }
          catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : "The local lineage endpoint is unavailable."); }
        }
        if (page === "sessions") {
          try { const raw = localStorage.getItem("argus.sessions.v1"); if (alive) setSessions(raw ? JSON.parse(raw) as LocalSession[] : []); }
          catch { if (alive) setSessions([]); }
        }
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "The local API is unavailable. Start FastAPI to load live workspace data.");
      } finally { if (alive) setLoading(false); }
    };
    void load();
    return () => { alive = false; };
  }, [page, loadDatasets]);

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setUploadMessage(""); setError("");
    try {
      const item = await api.upload(file);
      setDatasets(current => [item, ...current.filter(existing => existing.id !== item.id)]);
      setUploadMessage(`${item.filename} was added to the local dataset library.`);
      setSelectedDatasetId(item.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { setBusy(false); event.target.value = ""; }
  };

  const openPreview = async (id: string) => {
    setPreview(null); setPreviewError("");
    try { setPreview(await api.previewData(id, 12, 0)); }
    catch (cause) { setPreviewError(cause instanceof Error ? cause.message : "Dataset preview is unavailable."); }
  };

  const runSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedDatasetId || query.trim().length < 3) return;
    setBusy(true); setError(""); setAnalysis(null);
    try {
      const result = await api.analyze(selectedDatasetId, query.trim());
      setAnalysis(result);
      saveSession(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Analysis could not be completed."); }
    finally { setBusy(false); }
  };

  const runEvaluation = async () => {
    setBusy(true); setError("");
    try { setEvaluation(await api.evaluate()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The evaluation endpoint is unavailable."); }
    finally { setBusy(false); }
  };

  const filteredDatasets = useMemo(() => datasets.filter(item => `${item.name} ${item.filename} ${item.format}`.toLowerCase().includes(filter.toLowerCase())), [datasets, filter]);
  const filteredSessions = useMemo(() => sessions.filter(item => `${item.question} ${item.answer}`.toLowerCase().includes(sessionFilter.toLowerCase())), [sessions, sessionFilter]);

  return <ArgusShell active={page === "overview" ? "/overview" : page === "documents" ? "/documents" : page === "search" ? "/search" : page === "graph" ? "/graph" : page === "sessions" ? "/sessions" : page === "evaluation" ? "/evaluation" : page === "models" ? "/models" : "/settings"} title={info.title} eyebrow={info.eyebrow}>
    {error && <div className="argus-error-banner" role="alert"><WarningCircle size={16} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div>}
    {page === "overview" && <OverviewPage datasets={datasets} health={health} loading={loading} error={error} />}
    {page === "documents" && <DocumentsPage datasets={filteredDatasets} total={datasets.length} filter={filter} onFilter={setFilter} onUpload={() => uploadRef.current?.click()} onPreview={id => void openPreview(id)} loading={loading} busy={busy} uploadMessage={uploadMessage} />}
    {page === "search" && <SearchPage datasets={datasets} loading={loading} selectedDatasetId={selectedDatasetId} setSelectedDatasetId={setSelectedDatasetId} query={query} setQuery={setQuery} analysis={analysis} busy={busy} onSubmit={event => void runSearch(event)} />}
    {page === "graph" && <GraphPage graph={lineage} loading={loading} error={error} />}
    {page === "sessions" && <SessionsPage sessions={filteredSessions} total={sessions.length} filter={sessionFilter} onFilter={setSessionFilter} loading={loading} />}
    {page === "evaluation" && <EvaluationPage report={evaluation} busy={busy} onRun={() => void runEvaluation()} />}
    {page === "models" && <ModelsPage health={health} loading={loading} />}
    {page === "settings" && <SettingsPage />}
    {(page === "documents" || page === "overview") && <input ref={uploadRef} className="sr-only" type="file" accept=".csv,.xlsx,.json" onChange={event => void upload(event)} aria-label="Upload CSV, XLSX or JSON dataset" />}
    {preview && <DatasetPreviewDialog preview={preview} onClose={() => setPreview(null)} />}
    {previewError && <div className="argus-toast" role="status">{previewError}<button onClick={() => setPreviewError("")} aria-label="Dismiss"><X size={14} /></button></div>}
  </ArgusShell>;
}

function saveSession(result: Analysis) {
  try {
    const current = JSON.parse(localStorage.getItem("argus.sessions.v1") || "[]") as LocalSession[];
    const item: LocalSession = { run_id: result.run_id, dataset_id: result.dataset_id, question: result.question, answer: result.answer, latency_ms: result.latency_ms, model_name: result.model_name, findings: result.findings, created_at: new Date().toISOString() };
    localStorage.setItem("argus.sessions.v1", JSON.stringify([item, ...current.filter(row => row.run_id !== item.run_id)].slice(0, 50)));
  } catch { /* Local history is an optional convenience; analysis remains successful. */ }
}

function OverviewPage({ datasets, health, loading, error }: { datasets: Dataset[]; health: APIHealth | null; loading: boolean; error: string }) {
  const rowCount = datasets.reduce((total, item) => total + item.profile.row_count, 0);
  const numericColumns = datasets.reduce((total, item) => total + item.profile.column_count, 0);
  const cards = [
    { label: "Local datasets", value: loading ? "—" : String(datasets.length), note: "Visible to this local API", icon: Database, state: "measured" },
    { label: "Rows available", value: loading ? "—" : rowCount.toLocaleString(), note: "Across loaded dataset profiles", icon: Table, state: "measured" },
    { label: "Retrieval quality", value: "Unavailable", note: "No semantic retrieval endpoint", icon: MagnifyingGlass, state: "unavailable" },
    { label: "p95 query latency", value: "Unavailable", note: "No latency aggregation endpoint", icon: Gauge, state: "unavailable" },
  ];
  return <div className="argus-page-stack">
    <section className="argus-welcome-card"><div><span className="argus-eyebrow">LOCAL WORKSPACE SNAPSHOT</span><h2>Find the signal.<br /><em>Keep the trail.</em></h2><p>ARGUS connects data analysis, lineage, and evidence review. The current build reads the local Nexus analytics API.</p><Link className="argus-button-primary" href="/workspace">Open knowledge workspace <ArrowRight size={15} /></Link></div><div className="argus-welcome-orbit" aria-hidden="true"><Eye size={68} weight="thin" /><span /><i /></div></section>
    <div className="argus-metric-grid">{cards.map(({ label, value, note, icon: Icon, state }) => <article className={`argus-metric-card ${state}`} key={label}><span className="argus-metric-icon"><Icon size={17} /></span><small>{label}</small><strong>{value}</strong><p>{note}</p></article>)}</div>
    <div className="argus-overview-grid"><section className="argus-panel"><div className="argus-panel-heading"><div><span className="argus-eyebrow">CURRENT INVENTORY</span><h2>Data sources</h2></div><Link href="/documents">Browse library <ArrowRight size={14} /></Link></div>{loading ? <LoadingState label="Reading dataset inventory…" /> : error ? <EmptyState icon={<WarningCircle size={18} />} title="API unavailable" detail="Dataset counts are not shown until the local API responds." /> : datasets.length ? datasets.slice(0, 5).map(item => <Link className="argus-source-row" href="/documents" key={item.id}><span><Database size={16} /></span><strong>{item.name}</strong><small>{item.profile.row_count.toLocaleString()} rows · {item.profile.column_count} fields</small><ArrowRight size={14} /></Link>) : <EmptyState icon={<Database size={18} />} title="No datasets yet" detail="Upload a supported dataset to begin." action={<Link href="/documents">Open documents <ArrowRight size={13} /></Link>} />}</section>
      <section className="argus-panel"><div className="argus-panel-heading"><div><span className="argus-eyebrow">SERVICE INDICATORS</span><h2>What is connected</h2></div><Link href="/models">Details <ArrowRight size={14} /></Link></div><StatusLine label="API process" value={health?.status === "ok" ? "Responding" : loading ? "Checking" : "Unavailable"} tone={health?.status === "ok" ? "good" : "muted"} /><StatusLine label="Database type" value={health?.database ?? "Not reported"} tone="muted" /><StatusLine label="Knowledge retrieval" value="Not implemented" tone="muted" /><StatusLine label="Authentication" value="Not configured" tone="warn" /><p className="argus-panel-note">This status reflects the local prototype. It does not indicate a production deployment.</p></section></div>
    <div className="argus-dashboard-foot"><span>{numericColumns ? `${numericColumns} fields across loaded datasets` : "Dataset field count unavailable"}</span><span>Indexed evidence, citation verification, job throughput, and inference expenditure are not available from the current API.</span></div>
  </div>;
}

function DocumentsPage({ datasets, total, filter, onFilter, onUpload, onPreview, loading, busy, uploadMessage }: { datasets: Dataset[]; total: number; filter: string; onFilter: (value: string) => void; onUpload: () => void; onPreview: (id: string) => void; loading: boolean; busy: boolean; uploadMessage: string }) {
  return <div className="argus-page-stack"><div className="argus-page-actions"><label className="argus-filter"><MagnifyingGlass size={15} /><input value={filter} onChange={event => onFilter(event.target.value)} placeholder="Filter datasets" aria-label="Filter datasets" /></label><button className="argus-button-primary" onClick={onUpload} disabled={busy}>{busy ? <CircleNotch className="spin" size={15} /> : <CloudArrowUp size={16} />}{busy ? "Uploading…" : "Upload dataset"}</button></div><div className="argus-prototype-note"><InfoIcon /><span><strong>Current scope:</strong> CSV, XLSX, and JSON datasets. PDF, image, OCR, and enterprise document indexing are not implemented in this build.</span></div>{uploadMessage && <div className="argus-success-banner" role="status"><Check size={15} />{uploadMessage}</div>}<section className="argus-panel argus-document-panel"><div className="argus-table-head"><span>{loading ? "Loading library" : `${total} local dataset${total === 1 ? "" : "s"}`}</span><span>FORMAT</span><span>ROWS</span><span>FIELDS</span><span /></div>{loading ? <LoadingState label="Reading datasets…" /> : datasets.length ? datasets.map(item => <article className="argus-document-row" key={item.id}><span className="argus-document-symbol"><FileText size={17} /></span><div><strong>{item.name}</strong><small>{item.filename} · {item.source} · {item.profile.missing_cells.toLocaleString()} missing cells</small></div><span className="argus-format-chip">{item.format.toUpperCase()}</span><span className="argus-row-number">{item.profile.row_count.toLocaleString()}</span><span className="argus-row-number">{item.profile.column_count}</span><button className="argus-icon-button" onClick={() => onPreview(item.id)} aria-label={`Preview ${item.name}`}><ArrowUpRight size={16} /></button></article>) : <EmptyState icon={<Files size={18} />} title="No matching datasets" detail="The library only lists data returned by the local API." />}</section></div>;
}

function SearchPage({ datasets, loading, selectedDatasetId, setSelectedDatasetId, query, setQuery, analysis, busy, onSubmit }: { datasets: Dataset[]; loading: boolean; selectedDatasetId: string; setSelectedDatasetId: (value: string) => void; query: string; setQuery: (value: string) => void; analysis: Analysis | null; busy: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  const selected = datasets.find(item => item.id === selectedDatasetId);
  return <div className="argus-search-page"><div className="argus-search-callout"><span className="argus-eyebrow">ANALYTICAL SEARCH · PROTOTYPE</span><p>This sends your question to the existing deterministic analysis API for one selected dataset. It does not search enterprise documents or use embeddings.</p></div><form className="argus-query-form" onSubmit={onSubmit}><label htmlFor="argus-query">Ask a question about a dataset</label><textarea id="argus-query" value={query} onChange={event => setQuery(event.target.value)} placeholder="For example: Which region had the highest total revenue?" rows={3} /><div className="argus-query-toolbar"><select value={selectedDatasetId} onChange={event => setSelectedDatasetId(event.target.value)} aria-label="Choose dataset" disabled={loading || datasets.length === 0}><option value="">{loading ? "Loading datasets…" : "Choose a dataset"}</option>{datasets.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><span>{selected ? `${selected.profile.row_count.toLocaleString()} rows · ${selected.profile.column_count} fields` : "No selected data"}</span><button className="argus-button-primary" disabled={busy || !selectedDatasetId || query.trim().length < 3}>{busy ? <CircleNotch className="spin" size={15} /> : <ArrowRight size={15} />}{busy ? "Analyzing…" : "Run analysis"}</button></div></form>{analysis ? <section className="argus-analysis-result"><div className="argus-result-heading"><span><ShieldCheck size={15} />ANALYSIS RESULT</span><small>{analysis.latency_ms.toFixed(1)} ms measured · {analysis.model_name ?? "deterministic"}</small></div><h2>{analysis.findings[0]?.title ?? "Dataset analysis"}</h2><p>{analysis.answer}</p><div className="argus-result-findings">{analysis.findings.map((finding, index) => <article key={`${finding.title}-${index}`}><strong>{finding.title}</strong><p>{finding.detail}</p><small>Evidence fields: {finding.evidence.join(" · ") || "No source fields returned"}</small>{finding.caveat && <em>{finding.caveat}</em>}</article>)}</div><Link href={`/workspace?run=${encodeURIComponent(analysis.run_id)}`}>Inspect full workspace trace <ArrowRight size={14} /></Link></section> : <div className="argus-search-empty"><span><MagnifyingGlass size={22} /></span><strong>{datasets.length ? "Your result will appear here" : "Connect to the local API"}</strong><p>{datasets.length ? "Run an analytical query to get calculated findings and source field references." : "No dataset data is shown until the API responds."}</p></div>}</div>;
}

function GraphPage({ graph, loading, error }: { graph: LineageGraph | null; loading: boolean; error: string }) {
  if (loading) return <LoadingState label="Loading source lineage…" />;
  if (error) return <EmptyState icon={<WarningCircle size={18} />} title="Lineage is unavailable" detail="The local source-lineage endpoint did not respond." />;
  if (!graph?.nodes.length) return <EmptyState icon={<Graph size={18} />} title="No lineage nodes returned" detail="Upload data or run an analysis to populate the local lineage prototype. It does not extract document entities." action={<Link href="/documents">Open datasets <ArrowRight size={13} /></Link>} />;
  return <div className="argus-page-stack"><div className="argus-prototype-note"><InfoIcon /><span><strong>Source lineage prototype.</strong> Nodes reflect data sources, datasets, cleaning, and analysis runs. Heuristic connections are not verified knowledge facts.</span></div><GraphScene graph={graph} /></div>;
}

function SessionsPage({ sessions, total, filter, onFilter, loading }: { sessions: LocalSession[]; total: number; filter: string; onFilter: (value: string) => void; loading: boolean }) {
  return <div className="argus-page-stack"><div className="argus-search-callout"><span className="argus-eyebrow">BROWSER-LOCAL HISTORY</span><p>Sessions are saved in this browser only. The API does not expose a tenant-scoped session listing endpoint yet.</p></div><label className="argus-filter"><MagnifyingGlass size={15} /><input value={filter} onChange={event => onFilter(event.target.value)} placeholder="Search local sessions" aria-label="Search local sessions" /></label><section className="argus-panel">{loading ? <LoadingState label="Reading local session history…" /> : sessions.length ? <>{sessions.map(item => <article className="argus-session-row" key={item.run_id}><span><ChatCircleText size={16} /></span><div><strong>{item.question}</strong><small>{new Date(item.created_at).toLocaleString()} · {item.latency_ms.toFixed(1)} ms · {item.findings.length} findings</small></div><Link href={`/workspace?run=${encodeURIComponent(item.run_id)}`} aria-label="Open analysis session"><ArrowUpRight size={16} /></Link></article>)}</> : <EmptyState icon={<ChatCircleText size={18} />} title={total ? "No matching sessions" : "No saved sessions in this browser"} detail="Run an analysis in the workspace; the completed result will be added to local browser history." action={<Link href="/workspace">Open workspace <ArrowRight size={13} /></Link>} />}</section></div>;
}

function EvaluationPage({ report, busy, onRun }: { report: EvaluationReport | null; busy: boolean; onRun: () => void }) {
  return <div className="argus-page-stack"><div className="argus-eval-intro"><div><span className="argus-eyebrow">CURRENT MEASUREMENT SCOPE</span><p>These results come from the API’s deterministic routing and metadata-ranking fixtures. They are not semantic RAG, faithfulness, citation-accuracy, or production reliability scores.</p></div><button className="argus-button-primary" onClick={onRun} disabled={busy}>{busy ? <CircleNotch className="spin" size={15} /> : <ArrowClockwise size={15} />}{busy ? "Running suite…" : "Run evaluation"}</button></div>{report ? <><div className="argus-metric-grid argus-eval-metrics">{Object.entries(report.metrics).filter(([key]) => !["cases_passed", "cases_total"].includes(key)).map(([key, value]) => <article className="argus-metric-card" key={key}><small>{key.replaceAll("_", " ")}</small><strong>{key.includes("recall") || key === "mrr" || key.includes("accuracy") || key.includes("rate") ? `${(value * 100).toFixed(1)}%` : value}</strong><p>Measured on current fixture suite</p></article>)}</div><section className="argus-panel"><div className="argus-panel-heading"><div><span className="argus-eyebrow">CASE RESULTS</span><h2>{report.metrics.cases_passed}/{report.metrics.cases_total} routing cases passed</h2></div><span className="argus-measured-badge"><i /> MEASURED RUN</span></div>{report.cases.map(item => <div className="argus-eval-case" key={item.id}><span className={item.pass ? "passed" : "failed"}>{item.pass ? <Check size={14} /> : <WarningCircle size={14} />}</span><div><strong>{item.question}</strong><small>Expected: {item.expected.join(" · ")}</small><small>Selected: {item.selected.join(" · ")}</small></div></div>)}</section><section className="argus-panel"><div className="argus-panel-heading"><div><span className="argus-eyebrow">RETRIEVAL FIXTURES</span><h2>Metadata ranking</h2></div></div><div className="argus-retrieval-table"><div><strong>Query</strong><strong>Recall@3</strong><strong>Precision@3</strong><strong>MRR</strong></div>{report.retrieval.map(item => <div key={item.query}><span>{item.query}</span><span>{item.recall_at_k.toFixed(2)}</span><span>{item.precision_at_k.toFixed(2)}</span><span>{item.reciprocal_rank.toFixed(2)}</span></div>)}</div>{report.limitations.map(item => <p className="argus-panel-note" key={item}>{item}</p>)}</section></> : <EmptyState icon={<Gauge size={18} />} title="No evaluation run yet" detail="Run the existing deterministic suite to display measured local results. Unavailable metrics will remain unavailable." />}</div>;
}

function ModelsPage({ health, loading }: { health: APIHealth | null; loading: boolean }) {
  const configured = Boolean(health?.model_provider && health.model_provider !== "deterministic_fallback");
  return <div className="argus-page-stack"><div className="argus-model-banner"><Cpu size={18} /><p>The health endpoint reports configuration only. It does not perform a generation request or verify rate limits, billing, modality support, or a successful inference.</p></div><section className="argus-model-card"><div className="argus-model-icon"><Cpu size={22} /></div><div className="argus-model-info"><span className="argus-eyebrow">LEGACY API PROVIDER CONFIG</span><h2>{loading ? "Checking local API…" : health?.model_provider || "No provider reported"}</h2><p>{health?.active_model || "Model identifier unavailable"}</p></div><span className={`argus-model-status ${configured ? "configured" : "unverified"}`}><i />{loading ? "Checking" : configured ? "Configured · inference unverified" : "Deterministic mode"}</span></section><div className="argus-model-details"><StatusLine label="Model identifier" value={health?.active_model ?? "Unavailable"} tone="muted" /><StatusLine label="Generation permission" value="Not verified in this UI" tone="warn" /><StatusLine label="Rate limits" value="Not reported by API" tone="muted" /><StatusLine label="Usage and cost" value="Not available" tone="muted" /><StatusLine label="Provider credentials" value="Never exposed to browser" tone="good" /></div><Link className="argus-secondary-link" href="/settings">Review current implementation limits <ArrowRight size={14} /></Link></div>;
}

function SettingsPage() {
  const settings = [
    ["Workspace mode", "Local prototype", "No identity provider is connected."],
    ["Data access", "Local API", "Uploaded files are sent to the configured FastAPI service."],
    ["Supported dataset uploads", "CSV · XLSX · JSON", "Other file types and document OCR are not offered in this UI."],
    ["Knowledge retrieval", "Unavailable", "Embeddings, BM25, RRF, and document citations are not implemented."],
    ["Model routing", "Configured state only", "The interface does not test provider inference or reveal credentials."],
  ];
  return <div className="argus-page-stack"><div className="argus-settings-intro"><span><Gear size={22} /></span><div><h2>Workspace configuration</h2><p>These values describe what the current frontend and API expose. This page cannot change deployment secrets or tenant policies.</p></div></div><section className="argus-panel">{settings.map(([label, value, note]) => <div className="argus-setting-row" key={label}><span><strong>{label}</strong><small>{note}</small></span><em>{value}</em></div>)}</section><div className="argus-warning-panel"><WarningCircle size={17} /><p><strong>Security boundary:</strong> authentication, authorization, and tenant isolation are not implemented in the current API. Do not use this prototype for sensitive or multi-tenant data.</p></div></div>;
}

function DatasetPreviewDialog({ preview, onClose }: { preview: DatasetPreview; onClose: () => void }) {
  return <div className="argus-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="argus-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="argus-preview-title"><header><div><span className="argus-eyebrow">DATASET PREVIEW</span><h2 id="argus-preview-title">{preview.name}</h2><small>{preview.total_rows.toLocaleString()} rows · {preview.columns.length} fields · first {preview.rows.length} rows</small></div><button className="argus-icon-button" onClick={onClose} aria-label="Close dataset preview"><X size={17} /></button></header><div className="argus-data-table-wrap"><table><thead><tr>{preview.columns.map(column => <th key={column.name}>{column.name}<small>{column.dtype}</small></th>)}</tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}>{preview.columns.map(column => <td key={column.name}>{row[column.name] == null ? <span className="argus-null">null</span> : String(row[column.name])}</td>)}</tr>)}</tbody></table></div></section></div>;
}

function StatusLine({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "muted" }) {
  return <div className="argus-status-line"><span>{label}</span><strong className={tone}><i />{value}</strong></div>;
}

function EmptyState({ icon, title, detail, action }: { icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="argus-empty-state"><span>{icon}</span><strong>{title}</strong><p>{detail}</p>{action}</div>;
}

function LoadingState({ label }: { label: string }) {
  return <div className="argus-loading"><CircleNotch className="spin" size={17} />{label}</div>;
}

function InfoIcon() { return <span className="argus-note-icon"><Eye size={16} /></span>; }
