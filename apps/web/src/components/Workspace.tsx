"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Pulse, ArrowClockwise, ArrowDown, ArrowRight, ArrowsOutCardinal, ArrowsLeftRight,
  ChartBar, ChartLine, Check, CircleNotch, ClockCounterClockwise, CloudArrowUp, Database,
  DotsThree, FileText, Funnel, Gauge, Graph, Info, MagnifyingGlass, Play, Plus, Printer, Question,
  ShieldCheck, Sparkle, Table, TerminalWindow, WarningCircle, X, Eye, Globe,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AnalysisChart } from "@/components/AnalysisChart";
import { DataExplorerModal } from "@/components/DataExplorerModal";
import { ConnectSourceModal } from "@/components/ConnectSourceModal";
import { ArgusNav } from "@/components/ArgusShell";
import { api, type Analysis, type CleaningIssue, type CleaningOperation, type CleaningPreview, type Dataset, type DatasetOverview, type EvaluationReport, type SqlQueryResult, type SuggestedQuestion, type TraceStep } from "@/lib/api";

const DatasetUniverse = dynamic(() => import("@/components/DatasetUniverse").then(module => module.DatasetUniverse), { ssr: false, loading: () => <div className="chart-empty"><span>Preparing 3D schema view…</span></div> });

type View = "analysis" | "datasets" | "cleaning" | "history" | "reports" | "traces" | "evaluations";
type RightTab = "insights" | "evidence" | "data" | "notes";
type CenterTab = "overview" | "universe" | "trend" | "segments" | "clustering" | "query";

const viewLabels: Record<View, string> = { analysis: "Analysis", datasets: "Datasets", cleaning: "Data cleaning", history: "Analysis history", reports: "Reports", traces: "Agent traces", evaluations: "Evaluations" };
const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());

export function Workspace() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [question, setQuestion] = useState("");
  const [view, setView] = useState<View>("analysis");
  const [rightTab, setRightTab] = useState<RightTab>("insights");
  const [centerTab, setCenterTab] = useState<CenterTab>("trend");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState("");
  const [showTrace, setShowTrace] = useState(true);
  const [evalReport, setEvalReport] = useState<EvaluationReport | null>(null);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [workingStage, setWorkingStage] = useState(0);
  const inputFile = useRef<HTMLInputElement>(null);
  const bootstrapped = useRef(false);
  const selected = datasets.find(dataset => dataset.id === selectedId) ?? null;
  const visibleDatasets = datasets.filter(dataset => dataset.name.toLowerCase().includes(filter.toLowerCase()));

  const runQuestion = useCallback(async (text: string, datasetId = selectedId) => {
    if (!datasetId || text.trim().length < 3) return;
    setBusy(true); setError(""); setView("analysis"); setQuestion(text); setWorkingStage(0);
    try {
      const result = await api.analyze(datasetId, text.trim());
      setAnalysis(result); setHistory(previous => [result, ...previous.filter(item => item.run_id !== result.run_id)]);
      try {
        const saved = JSON.parse(localStorage.getItem("argus.sessions.v1") || "[]") as { run_id: string }[];
        const item = { run_id: result.run_id, dataset_id: result.dataset_id, question: result.question, answer: result.answer, latency_ms: result.latency_ms, model_name: result.model_name, findings: result.findings, created_at: new Date().toISOString() };
        localStorage.setItem("argus.sessions.v1", JSON.stringify([item, ...saved.filter(session => session.run_id !== result.run_id)].slice(0, 50)));
      } catch { /* Browser history is optional; the analysis result remains available. */ }
      if (result.overview) {
        setCenterTab("overview");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis could not be completed.");
    } finally { setBusy(false); }
  }, [selectedId]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    api.datasets().then(items => {
      setDatasets(items);
      if (!items.length) return;
      const requestedRun = new URLSearchParams(window.location.search).get("run");
      if (requestedRun) {
        api.analysis(requestedRun).then(result => {
          setAnalysis(result); setHistory([result]); setQuestion(result.question); setSelectedId(result.dataset_id);
          if (!items.some(item => item.id === result.dataset_id)) setError("This run exists, but its dataset is not available in this local workspace.");
        }).catch(() => setError("This run link could not be restored in the current local workspace."));
        return;
      }
      const preferred = items.find(item => item.id === "demo-sales") ?? items[0];
      setSelectedId(preferred.id);
    }).catch(cause => setError(cause instanceof Error ? cause.message : "API unavailable. Start the FastAPI service on port 8000."));
  // The first read is intentionally a one-time demo bootstrap.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setWorkingStage(stage => Math.min(stage + 1, 4)), 460);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedId) void runQuestion(question);
  };

  const uploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setError("");
    try {
      const dataset = await api.upload(file);
      setDatasets(previous => [dataset, ...previous.filter(item => item.id !== dataset.id)]);
      setSelectedId(dataset.id); setAnalysis(null); setQuestion(""); setView("analysis");
      setToast(`${dataset.name} is ready for analysis`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { setBusy(false); event.target.value = ""; }
  };

  const selectDataset = (id: string) => {
    setSelectedId(id); setAnalysis(null); setCenterTab("trend"); setView("analysis");
  };

  const createReport = async () => {
    if (!analysis) { setToast("Run an analysis before generating a report"); return; }
    try {
      const report = await api.report(analysis.run_id);
      const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `argus-report-${analysis.run_id.slice(0, 8)}.md`; link.click(); URL.revokeObjectURL(url);
      setToast("Executive report downloaded");
    } catch { setToast("Report generation failed"); }
  };

  const shareRun = async () => {
    if (!analysis) { setToast("Run an analysis first"); return; }
      try { await navigator.clipboard.writeText(`${window.location.origin}/workspace?run=${analysis.run_id}`); setToast("Run link copied"); }
    catch { setToast(`Run ID: ${analysis.run_id}`); }
  };

  const runEvaluation = async () => {
    setBusy(true);
    try { setEvalReport(await api.evaluate()); setView("evaluations"); }
    catch { setError("Evaluation service is unavailable."); }
    finally { setBusy(false); }
  };

  const changeView = (next: View) => {
    if (next === "evaluations") void runEvaluation();
    else setView(next);
  };

  return <main className="app-shell argus-workspace-shell">
    <header className="topbar">
      <a className="brand" href="/" aria-label="ARGUS AI home"><span className="brand-mark"><Eye weight="duotone" /></span><span className="brand-name">ARGUS</span><span className="brand-ai">AI</span><span className="brand-divider" /><span className="brand-subtitle">Knowledge Intelligence</span><span className="beta-pill">LOCAL</span></a>
      <div className="topbar-actions"><span className="runtime-indicator"><span className="status-dot" />Local analysis API</span><button className="icon-button search-trigger" onClick={() => document.getElementById("question-input")?.focus()} aria-label="Focus the analysis question"><MagnifyingGlass size={18} /></button><button className="share-button" onClick={() => void shareRun()}><ArrowsLeftRight size={17} /> <span>Share</span></button><button className="primary-button top-new" onClick={() => { setAnalysis(null); setQuestion(""); setView("analysis"); document.getElementById("question-input")?.focus(); }}><Plus size={18} weight="bold" /> New analysis</button></div>
    </header>

    <div className="workspace-grid">
      <aside className="left-sidebar">
        <div className="side-head"><strong>Intelligence</strong><span className="argus-sidebar-local">LOCAL</span></div>
        <ArgusNav active="/workspace" />
        <div className="sidebar-section-title"><strong>Datasets</strong><button className="subtle-icon" onClick={() => inputFile.current?.click()} aria-label="Add dataset"><Plus size={15} /></button></div>
        <label className="dataset-search"><MagnifyingGlass size={16} /><input aria-label="Search datasets" placeholder="Search datasets..." value={filter} onChange={e => setFilter(e.target.value)} /></label>
        <div className="dataset-list">
          {visibleDatasets.map(dataset => <button key={dataset.id} className={`dataset-item ${dataset.id === selectedId ? "selected" : ""}`} onClick={() => selectDataset(dataset.id)}>
            <span className="dataset-icon"><Database size={19} weight="duotone" /></span><span className="dataset-copy"><strong>{dataset.name}</strong><small>{dataset.profile.column_count} columns · {dataset.profile.row_count.toLocaleString()} rows</small></span><DotsThree size={19} className="dataset-menu-icon" />
          </button>)}
          {!visibleDatasets.length && <p className="empty-filter">No matching datasets</p>}
        </div>

        <div className="sidebar-section-title"><strong>Research tools</strong></div>
        <nav className="primary-nav" aria-label="Workspace navigation">
          <NavItem active={view === "analysis"} icon={<ChartLine size={18} />} label="New analysis" onClick={() => { setAnalysis(null); setQuestion(""); setView("analysis"); }} />
          <NavItem active={view === "datasets"} icon={<Table size={18} />} label="Dataset details" onClick={() => changeView("datasets")} />
          <NavItem active={view === "cleaning"} icon={<Funnel size={18} />} label="Data cleaning" onClick={() => changeView("cleaning")} />
          <NavItem active={view === "history"} icon={<ClockCounterClockwise size={18} />} label="Analysis history" badge={String(history.length)} onClick={() => changeView("history")} />
          <NavItem active={view === "reports"} icon={<FileText size={18} />} label="Reports" onClick={() => changeView("reports")} />
          <NavItem active={view === "traces"} icon={<TerminalWindow size={18} />} label="Agent traces" onClick={() => changeView("traces")} />
          <NavItem active={view === "evaluations"} icon={<Gauge size={18} />} label="Evaluations" onClick={() => changeView("evaluations")} />
        </nav>

        <div className="sidebar-bottom"><button className="upload-card" onClick={() => inputFile.current?.click()}><span className="upload-icon"><CloudArrowUp size={19} /></span><span><strong>Add data</strong><small>CSV · XLSX · JSON</small></span><ArrowRight size={16} /></button><div className="privacy-note"><ShieldCheck size={16} /><span>Files are sent to the local ARGUS API</span></div></div>
        <input ref={inputFile} type="file" accept=".csv,.xlsx,.json" hidden onChange={uploadFile} />
      </aside>

      <section className="main-column">
        <div className="dataset-header">
          <div className="active-dataset-mark"><Database size={19} weight="duotone" /></div>
          <button className="dataset-select" onClick={() => setView("datasets")}>{selected?.name ?? "Select a dataset"}<ArrowDown size={14} /></button>
          <span className="dataset-meta">{selected ? `${selected.profile.column_count} fields · ${selected.profile.row_count.toLocaleString()} rows` : "Upload a CSV, XLSX, or JSON file"}</span>
          <span className="header-spacer" />
          {selected && (
            <div style={{ display: "flex", gap: "6px", marginRight: "6px" }} className="btn-no-print">
              <button
                type="button"
                className="outline-button"
                onClick={() => void runQuestion("Give me an overview of this data.")}
                title="Generate automated dataset overview"
              >
                <Sparkle size={13} /> Overview
              </button>
              <a href={`/api/datasets/${encodeURIComponent(selected.id)}/export?format=csv`} download className="outline-button" title="Export as CSV"><ArrowDown size={13} /> CSV</a>
              <a href={`/api/datasets/${encodeURIComponent(selected.id)}/export?format=xlsx`} download className="outline-button" title="Export as Excel"><ArrowDown size={13} /> Excel</a>
            </div>
          )}
          <button className="outline-button details-button btn-no-print" onClick={() => setRightTab("data")}><Info size={16} /> Details</button>
          <button className="subtle-icon more-button btn-no-print" onClick={() => setShowTrace(value => !value)} aria-label="Toggle run trace"><DotsThree size={19} /></button>
        </div>

        {view === "analysis" && <>
          <form className="question-form" onSubmit={submitQuestion}>
            <label htmlFor="question-input" className="sr-only">Ask a question about this dataset</label>
            <textarea id="question-input" rows={2} placeholder="Ask a question about this dataset…" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (selectedId && !busy) void runQuestion(question); } }} />
            <div className="composer-footer"><div className="composer-context"><span className="context-chip"><Database size={14} />{selected?.name ?? "No dataset"}</span><span className="context-note">Schema-first · raw rows stay local</span></div><button className="submit-button" type="submit" disabled={busy || !selectedId || question.trim().length < 3} aria-label="Run analysis">{busy ? <CircleNotch className="spin" size={18} /> : <ArrowRight size={19} weight="bold" />}</button></div>
          </form>

          <div className="analysis-stage" aria-label="Agent workflow">
            {["Understand question", "Explore data", "Analyze", "Validate", "Explain"].map((label, index) => {
              const completed = analysis && !busy ? index < 5 : busy && index < workingStage;
              const active = busy && index === workingStage;
              return <div className={`stage-item ${completed ? "complete" : ""} ${active ? "active" : ""}`} key={label}><span className="stage-marker">{completed ? <Check size={12} weight="bold" /> : index + 1}</span><span className="stage-label">{label}</span>{index < 4 && <span className="stage-connector" />}</div>;
            })}
          </div>

          <div className="finding-summary"><div className="summary-badge"><Sparkle size={15} weight="fill" /> Evidence-backed analysis</div><span>{analysis ? `${analysis.findings.length} finding${analysis.findings.length === 1 ? "" : "s"} · ${analysis.validation.passed ? "validated" : "review needed"}` : "Ask a question to see findings and evidence."}</span><span className="summary-spacer" /><button className="text-button" onClick={() => setRightTab("evidence")}>View evidence <ArrowRight size={14} /></button></div>
          {analysis && (
            <article className="answer-block">
              <div className="answer-heading">
                <div>
                  <small>ANALYSIS ANSWER</small>
                  <h1>{analysis.findings[0]?.title ?? "Dataset analysis"}</h1>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {analysis.degraded_mode && (
                    <span style={{ fontSize: "10px", padding: "2px 8px", background: "#fef3c7", color: "#92400e", borderRadius: "12px", border: "1px solid #fde68a", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <ShieldCheck size={12} /> Deterministic Fallback
                    </span>
                  )}
                  <Confidence value={analysis.findings[0]?.confidence ?? "low"} />
                </div>
              </div>
              <p>{analysis.answer}</p>
              {analysis.data_quality_warnings && analysis.data_quality_warnings.length > 0 && (
                <div style={{ margin: "10px 0", padding: "8px 12px", background: "#fffbeb", border: "1px solid #fef3c7", borderRadius: "6px", fontSize: "11px", color: "#92400e" }}>
                  <strong>Data Quality Notice:</strong>
                  <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                    {analysis.data_quality_warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              {analysis.suggested_followups && analysis.suggested_followups.length > 0 && (
                <div style={{ margin: "10px 0", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", color: "#62768f", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Sparkle size={13} weight="fill" /> Suggested follow-ups:
                  </span>
                  {analysis.suggested_followups.map((followup, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => void runQuestion(followup)}
                      style={{ cursor: "pointer", background: "#f0f6ff", color: "#1969d2", border: "1px solid #c8ddf7", borderRadius: "12px", padding: "3px 10px", fontSize: "11px" }}
                    >
                      {followup}
                    </button>
                  ))}
                </div>
              )}
              <div className="answer-footer">
                <span><Check size={14} /> {analysis.validation.passed ? "Evidence check passed" : "Needs review"}</span>
                <span>Source: {selected?.filename ?? "selected dataset"}</span>
                <button className="text-button" onClick={() => setRightTab("evidence")}>Inspect sources <ArrowRight size={14} /></button>
              </div>
            </article>
          )}

          <section className="analysis-canvas-panel">
            <div className="canvas-tabs" role="tablist" aria-label="Analysis views">
              <Tab active={centerTab === "overview"} icon={<Sparkle size={15} />} label="Overview" onClick={() => setCenterTab("overview")} />
              <Tab active={centerTab === "universe"} icon={<Graph size={15} />} label="Dataset universe" onClick={() => setCenterTab("universe")} />
              <Tab active={centerTab === "trend"} icon={<ChartLine size={15} />} label="Trend & Forecast" onClick={() => setCenterTab("trend")} />
              <Tab active={centerTab === "segments"} icon={<ChartBar size={15} />} label="Segment breakdown" onClick={() => setCenterTab("segments")} />
              <Tab active={centerTab === "clustering"} icon={<Sparkle size={15} />} label="Clusters & PCA" onClick={() => setCenterTab("clustering")} />
              <Tab active={centerTab === "query"} icon={<TerminalWindow size={15} />} label="SQL Console" onClick={() => setCenterTab("query")} />
              <span className="canvas-tab-spacer" /><button className="text-button catalog-button" onClick={() => setRightTab("data")}><ArrowsOutCardinal size={14} /> Schema details</button>
            </div>
            <div className="universe-meta-row"><div><strong>{centerTab === "overview" ? "Dataset Overview & Statistical Profile" : centerTab === "universe" ? "Dataset universe" : centerTab === "trend" ? "Trend & Forecast" : centerTab === "segments" ? "Segment breakdown" : centerTab === "clustering" ? "Clusters & PCA Map" : "Interactive SQL Console"}</strong><span>{selected ? `${selected.profile.column_count} fields · relationships shown from the selected file` : "Waiting for dataset"}</span></div><div className="legend"><span><i className="legend-dot numeric" />Numeric</span><span><i className="legend-dot categorical" />Category</span><span><i className="legend-dot temporal" />Time</span><span><i className="legend-dot issue" />Data quality</span></div></div>
            <div className="visual-area">
              {centerTab === "overview" && <OverviewDashboard analysis={analysis} dataset={selected} onRunQuestion={q => void runQuestion(q)} />}
              {centerTab === "universe" && selected && <DatasetUniverse columns={selected.profile.columns} />}
              {centerTab === "trend" && <AnalysisChart analysis={analysis} purpose="trend" />}
              {centerTab === "segments" && <AnalysisChart analysis={analysis} purpose="segments" />}
              {centerTab === "clustering" && <AnalysisChart analysis={analysis} purpose="clustering" />}
              {centerTab === "query" && <SqlConsole dataset={selected} analysis={analysis} />}
              {!selected && <EmptyState title="Add a dataset to begin" detail="Drop in a CSV, XLSX, or JSON file to map its schema and ask questions." action={() => inputFile.current?.click()} />}
            </div>
            {centerTab === "universe" && <div className="evidence-chart-strip"><AnalysisChart analysis={analysis} purpose="trend" /></div>}
          </section>
        </>}

        {view === "datasets" && <DatasetList datasets={datasets} onSelect={selectDataset} onUpload={() => inputFile.current?.click()} />}
        {view === "cleaning" && <CleaningPage dataset={selected} onApplied={dataset => { setDatasets(previous => [dataset, ...previous.filter(item => item.id !== dataset.id)]); setSelectedId(dataset.id); setToast("Cleaned copy created · source dataset preserved"); }} />}
        {view === "history" && <HistoryList items={history} onSelect={item => { setAnalysis(item); setSelectedId(item.dataset_id); setQuestion(item.question); setView("analysis"); }} />}
        {view === "traces" && <TracePage items={history} />}
        {view === "reports" && <ReportPage analysis={analysis} onGenerate={() => void createReport()} />}
        {view === "evaluations" && <EvaluationPage report={evalReport} onRun={() => void runEvaluation()} busy={busy} />}
        {error && <div className="error-banner"><WarningCircle size={17} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
      </section>

      <aside className="right-panel">
        <div className="right-tabs" role="tablist" aria-label="Analysis detail panels">
          {(["insights", "evidence", "data", "notes"] as RightTab[]).map(tab => <button role="tab" aria-selected={rightTab === tab} className={rightTab === tab ? "active" : ""} key={tab} onClick={() => setRightTab(tab)}>{tab === "data" ? "Data" : titleCase(tab)}{tab === "evidence" && analysis ? <span className="tab-count">{analysis.findings.reduce((n, finding) => n + finding.evidence.length, 0)}</span> : null}</button>)}
        </div>
        <div className="right-panel-body">
          {rightTab === "insights" && <InsightPanel analysis={analysis} busy={busy} />}
          {rightTab === "evidence" && <EvidencePanel analysis={analysis} dataset={selected} />}
          {rightTab === "data" && <DataPanel dataset={selected} />}
          {rightTab === "notes" && <NotesPanel analysis={analysis} />}
        </div>
      </aside>

      <section className={`trace-drawer ${showTrace ? "open" : "closed"}`} aria-label="Agent tool runs">
        <div className="trace-header"><button className="trace-toggle" onClick={() => setShowTrace(value => !value)}><ArrowDown size={15} className={showTrace ? "" : "rotated"} /><strong>Tool runs</strong><span className="trace-count">{analysis ? `${analysis.trace.length} steps` : busy ? "Running" : "Ready"}</span></button><div className="trace-actions"><span className="trace-mode"><span className="status-dot" />Live run trace</span><button onClick={() => setShowTrace(value => !value)} aria-label="Collapse trace"><X size={15} /></button></div></div>
        {showTrace && <div className="trace-list">{busy ? <WorkingTrace stage={workingStage} /> : analysis?.trace.map((step, index) => <TraceRow key={`${analysis.run_id}-${index}`} step={step} index={index} />) ?? <div className="trace-placeholder"><Pulse size={15} /> Run an analysis to inspect tool inputs, outputs, and validation.</div>}</div>}
      </section>
    </div>

    <AnimatePresence>{toast && <motion.div className="toast" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>{toast}</motion.div>}</AnimatePresence>
  </main>;
}

function NavItem({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: string; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span>{badge && <small>{badge}</small>}</button>;
}

function Tab({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button role="tab" aria-selected={active} className={`canvas-tab ${active ? "active" : ""}`} onClick={onClick}>{icon}{label}</button>;
}

function Confidence({ value }: { value: "high" | "medium" | "low" }) {
  return <span className={`confidence ${value}`}>{value} confidence</span>;
}

function InsightPanel({ analysis, busy }: { analysis: Analysis | null; busy: boolean }) {
  if (busy) return <div className="right-empty"><CircleNotch className="spin" size={22} /><strong>Analysis in progress</strong><span>Inspecting fields and selecting deterministic tools.</span></div>;
  if (!analysis) return <div className="right-empty"><Sparkle size={22} /><strong>Key findings</strong><span>Run an analysis to see evidence-backed findings.</span></div>;
  return <><div className="panel-heading"><h2>Key findings</h2><span>{analysis.findings.length} result{analysis.findings.length === 1 ? "" : "s"}</span></div><ol className="finding-list">{analysis.findings.map((finding, index) => <li className="finding-item" key={`${finding.title}-${index}`}><span className="finding-number">{index + 1}</span><div className="finding-content"><div className="finding-title-row"><strong>{finding.title}</strong><Confidence value={finding.confidence} /></div><p>{finding.detail}</p><div className="source-chip"><ChartBar size={13} />{finding.evidence.length} evidence point{finding.evidence.length === 1 ? "" : "s"}<span>·</span>{analysis.dataset_id}</div>{finding.caveat && <p className="finding-caveat"><Info size={13} />{finding.caveat}</p>}</div></li>)}</ol><div className="panel-footnote"><ShieldCheck size={14} /> Claims are linked to calculations and source columns.</div></>;
}

function EvidencePanel({ analysis, dataset }: { analysis: Analysis | null; dataset: Dataset | null }) {
  if (!analysis) return <div className="right-empty"><Info size={22} /><strong>Evidence ledger</strong><span>Run an analysis to view evidence, provenance, and validation.</span></div>;
  return <><div className="panel-heading"><h2>Evidence ledger</h2><span>{analysis.validation.passed ? "Validated" : "Review"}</span></div><div className={`validation-card ${analysis.validation.passed ? "pass" : "warn"}`}>{analysis.validation.passed ? <ShieldCheck size={17} /> : <WarningCircle size={17} />}<div><strong>{analysis.validation.passed ? "Evidence check passed" : "Needs review"}</strong><small>Every visible finding maps to a computed result.</small></div></div>{analysis.findings.map((finding, index) => <section className="evidence-section" key={finding.title}><span className="evidence-section-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{finding.title}</strong>{finding.evidence.map((evidence, i) => <p key={i}>{evidence}</p>)}<span className="evidence-source"><Table size={13} />{dataset?.filename ?? analysis.dataset_id}</span></div></section>)}<div className="method-card"><strong>Methodology</strong><p>{analysis.tools.map(titleCase).join(" → ")}</p><small>Measured run latency: {analysis.latency_ms.toLocaleString()} ms · no LLM token or cost data configured.</small></div></>;
}

function DataPanel({ dataset }: { dataset: Dataset | null }) {
  if (!dataset) return <div className="right-empty"><Database size={22} /><strong>No selected dataset</strong><span>Add a file or choose a dataset to inspect its schema.</span></div>;
  return <><div className="panel-heading"><h2>Source data</h2><span>{dataset.profile.column_count} columns</span></div><p className="panel-intro">Schema and quality profile computed from <strong>{dataset.filename}</strong>.</p><div className="quality-grid"><div><strong>{dataset.profile.row_count.toLocaleString()}</strong><small>Rows</small></div><div><strong>{dataset.profile.missing_cells.toLocaleString()}</strong><small>Missing cells</small></div><div><strong>{dataset.profile.duplicate_rows.toLocaleString()}</strong><small>Duplicate rows</small></div></div><div className="schema-table"><div className="schema-table-header"><span>Column</span><span>Type · unique</span></div>{dataset.profile.columns.map(column => <div className="schema-table-row" key={column.name}><span><i className={`legend-dot ${column.semantic_type}`} />{column.name}</span><small>{column.semantic_type} · {column.unique.toLocaleString()}</small></div>)}</div></>;
}

function NotesPanel({ analysis }: { analysis: Analysis | null }) {
  return <><div className="panel-heading"><h2>Analysis notes</h2><span>Session</span></div>{analysis ? <div className="notes-content"><p>{analysis.question}</p><div className="notes-answer">{analysis.answer}</div><small>Notes are generated from the current run. Persistent annotations require a database-backed account.</small></div> : <div className="right-empty"><FileText size={22} /><strong>No notes yet</strong><span>Run an analysis to keep its question and summary visible here.</span></div>}</>;
}

function TraceRow({ step, index }: { step: TraceStep; index: number }) {
  const [open, setOpen] = useState(false);
  return <div className={`trace-row ${step.status}`}><span className="trace-index">{step.status === "completed" ? <Check size={12} weight="bold" /> : step.status === "warning" ? <WarningCircle size={13} /> : index + 1}</span><span className="trace-step-name">{titleCase(step.name)}</span><span className="trace-step-summary">{step.summary}</span><span className="trace-duration">{step.duration_ms.toFixed(1)} ms</span><button className="trace-expand" onClick={() => setOpen(value => !value)} aria-label={`Show ${step.name} details`}>{open ? <X size={13} /> : <ArrowRight size={13} />}</button>{open && <pre className="trace-detail">{JSON.stringify({ input: step.input_summary, output: step.output_summary }, null, 2)}</pre>}</div>;
}

function WorkingTrace({ stage }: { stage: number }) {
  const names = ["Inspect schema", "Plan analysis", "Run selected tools", "Validate evidence", "Write findings"];
  return <>{names.map((name, index) => <div className={`working-row ${index <= stage ? "current" : ""}`} key={name}><span className="trace-index">{index < stage ? <Check size={12} /> : index === stage ? <CircleNotch className="spin" size={13} /> : index + 1}</span><span>{name}</span><span>{index < stage ? "complete" : index === stage ? "working" : "queued"}</span></div>)}</>;
}

function SqlConsole({ dataset, analysis }: { dataset: Dataset | null; analysis: Analysis | null }) {
  const [query, setQuery] = useState("SELECT * FROM dataset LIMIT 15;");
  const [result, setResult] = useState<SqlQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const defaultSql = analysis?.trace.find(s => s.name === "sql_query")?.output_summary.sql;
    if (typeof defaultSql === "string") {
      setQuery(defaultSql);
    }
  }, [analysis]);

  const execute = async () => {
    if (!dataset) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.querySql(dataset.id, query);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query execution failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sql-console-wrap">
      <div className="sql-toolbar">
        <div className="sql-templates">
          <span style={{ fontSize: "10px", color: "#6e849d", fontWeight: 600 }}>Templates:</span>
          <button className="sql-template-chip" type="button" onClick={() => setQuery("SELECT * FROM dataset LIMIT 10")}>Top 10 rows</button>
          <button className="sql-template-chip" type="button" onClick={() => setQuery("SELECT COUNT(*) as row_count FROM dataset")}>Count rows</button>
          {dataset?.profile.categorical_columns?.[0] && (
            <button className="sql-template-chip" type="button" onClick={() => setQuery(`SELECT "${dataset.profile.categorical_columns[0]}", COUNT(*) as count FROM dataset GROUP BY "${dataset.profile.categorical_columns[0]}" ORDER BY count DESC LIMIT 10`)}>
              Group by {dataset.profile.categorical_columns[0]}
            </button>
          )}
        </div>
      </div>
      <div className="sql-editor-container">
        <textarea
          className="sql-editor"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Enter read-only SELECT query against 'dataset' table..."
          rows={3}
        />
        <div className="sql-run-bar">
          <span>Target table: <strong>dataset</strong> ({dataset?.profile.row_count.toLocaleString() ?? 0} rows)</span>
          <button className="primary-button" type="button" disabled={loading || !dataset} onClick={() => void execute()} style={{ height: "26px", fontSize: "10px" }}>
            {loading ? <CircleNotch className="spin" size={14} /> : <Play size={14} weight="fill" />} Run Query
          </button>
        </div>
      </div>
      {error && <div className="sql-error"><WarningCircle size={14} /> {error}</div>}
      {result && (
        <div className="sql-result-container">
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "#f8fbfe", borderBottom: "1px solid #e1ebf5", fontSize: "10px", color: "#506b88" }}>
            <span>{result.row_count} rows returned</span>
            <span>Execution time: {result.duration_ms} ms</span>
          </div>
          <table className="sql-table">
            <thead>
              <tr>{result.columns.map(col => <th key={col}>{col}</th>)}</tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  {result.columns.map(col => <td key={col}>{row[col] != null ? String(row[col]) : <em style={{ color: "#a0aec0" }}>NULL</em>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!result && !error && (
        <div className="sql-empty">
          Click <strong>Run Query</strong> or select a template to query data with SQLite in real time.
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action: () => void }) {
  return <div className="empty-state"><CloudArrowUp size={28} /><strong>{title}</strong><span>{detail}</span><button className="outline-button" onClick={action}><Plus size={15} /> Add dataset</button></div>;
}

function DatasetList({ datasets, onSelect, onUpload }: { datasets: Dataset[]; onSelect: (id: string) => void; onUpload: () => void }) {
  return <section className="secondary-page"><div className="secondary-title"><div><small>YOUR WORKSPACE</small><h1>Datasets</h1><p>Inspect the profile and choose a dataset to ask a question.</p></div><button className="primary-button" onClick={onUpload}><Plus size={16} /> Add dataset</button></div>{datasets.map(dataset => <button className="dataset-card" key={dataset.id} onClick={() => onSelect(dataset.id)}><span className="dataset-icon large"><Database size={21} /></span><span><strong>{dataset.name}</strong><small>{dataset.filename} · {dataset.format.toUpperCase()}</small></span><span className="dataset-card-stat"><b>{dataset.profile.row_count.toLocaleString()}</b><small>rows</small></span><span className="dataset-card-stat"><b>{dataset.profile.column_count}</b><small>fields</small></span><ArrowRight size={17} /></button>)}</section>;
}

function CleaningPage({ dataset, onApplied }: { dataset: Dataset | null; onApplied: (dataset: Dataset) => void }) {
  const [issues, setIssues] = useState<CleaningIssue[]>([]);
  const [operations, setOperations] = useState<CleaningOperation[]>([]);
  const [preview, setPreview] = useState<CleaningPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setIssues([]); setOperations([]); setPreview(null); setError("");
    if (!dataset) return () => { active = false; };
    setLoading(true);
    api.cleaningPlan(dataset.id).then(result => { if (active) setIssues(result.issues); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not inspect data quality."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [dataset?.id]);

  const toggleOperation = (operation: CleaningOperation) => {
    setOperations(current => current.includes(operation) ? current.filter(item => item !== operation) : [...current, operation]);
    setPreview(null);
  };

  const createPreview = async () => {
    if (!dataset || !operations.length) return;
    setWorking(true); setError("");
    try { setPreview(await api.previewCleaning(dataset.id, operations)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Preview could not be created."); }
    finally { setWorking(false); }
  };

  const applyOperations = async () => {
    if (!dataset || !preview) return;
    setWorking(true); setError("");
    try { const result = await api.applyCleaning(dataset.id, preview.operations); onApplied(result.dataset); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The cleaned copy could not be saved."); }
    finally { setWorking(false); }
  };

  const sampleColumns = preview ? Array.from(new Set(preview.sample_after.flatMap(row => Object.keys(row)))).slice(0, 6) : [];

  return <section className="secondary-page cleaning-page">
    <div className="secondary-title"><div><small>DATA QUALITY · REVIEW BEFORE APPLYING</small><h1>Data Cleaning Copilot</h1><p>Inspect measured issues, choose the changes, and preview their effect before creating a cleaned copy.</p></div><Funnel size={25} /></div>
    {!dataset ? <div className="inline-empty">Select or upload a dataset to inspect its quality.</div> : <>
      <div className="cleaning-source"><Database size={17} /><div><strong>{dataset.name}</strong><small>{dataset.profile.row_count.toLocaleString()} rows · {dataset.profile.column_count} columns · Original stays unchanged</small></div>{dataset.derived_from && <span className="cleaning-derived-tag">Derived copy</span>}</div>
      {loading ? <div className="inline-empty"><CircleNotch className="spin" size={17} /> Scanning for supported cleaning opportunities…</div> : <>
        <div className="cleaning-section-heading"><div><h2>Detected issues</h2><span>{issues.length ? `${issues.length} reviewable suggestions` : "No supported changes suggested"}</span></div><span className="cleaning-disclaimer">No edits are applied automatically</span></div>
        {issues.length ? <div className="cleaning-issue-list">{issues.map(issue => <CleaningIssueCard key={issue.operation} issue={issue} selected={operations.includes(issue.operation)} onToggle={() => toggleOperation(issue.operation)} />)}</div> : <div className="cleaning-empty"><Check size={18} /><div><strong>No supported cleanup suggestions</strong><p>The scanner checks missing-value markers, outer whitespace, and exact duplicate rows. Other data-quality issues may still need review.</p></div></div>}
        {!!error && <div className="cleaning-error" role="alert"><WarningCircle size={16} />{error}</div>}
        <div className="cleaning-actions"><span>{operations.length ? `${operations.length} operation${operations.length === 1 ? "" : "s"} selected` : "Select one or more suggestions to continue"}</span><button className="primary-button" type="button" disabled={!operations.length || working} onClick={() => void createPreview()}>{working ? <CircleNotch className="spin" size={16} /> : <MagnifyingGlass size={16} />}{working ? " Working…" : " Preview selected"}</button></div>
        {preview && <section className="cleaning-preview"><div className="cleaning-preview-head"><div><small>REVIEW THE RESULT</small><h2>Preview before you apply</h2></div><span>{preview.operations.length} selected operation{preview.operations.length === 1 ? "" : "s"}</span></div>
          <div className="cleaning-compare"><QualitySnapshot label="Before" profile={preview.before} /><ArrowRight size={17} /><QualitySnapshot label="After preview" profile={preview.after} /></div>
          <div className="cleaning-change-list">
            {preview.changes.missing_values_normalized > 0 && <span>{preview.changes.missing_values_normalized.toLocaleString()} missing markers normalized</span>}
            {preview.changes.text_values_trimmed > 0 && <span>{preview.changes.text_values_trimmed.toLocaleString()} text values trimmed</span>}
            {preview.changes.rows_removed > 0 && <span>{preview.changes.rows_removed.toLocaleString()} exact duplicate rows removed</span>}
            {!!preview.changes.outliers_clipped && <span>{preview.changes.outliers_clipped.toLocaleString()} outliers clipped</span>}
            {!!preview.changes.values_imputed && <span>{preview.changes.values_imputed.toLocaleString()} values imputed</span>}
            {!!preview.changes.columns_dropped && <span>{preview.changes.columns_dropped.toLocaleString()} columns dropped</span>}
          </div>
          <div className="cleaning-sample"><strong>First rows in the preview</strong><div className="cleaning-table-scroll"><table><thead><tr>{sampleColumns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{preview.sample_after.map((row, index) => <tr key={index}>{sampleColumns.map(column => <td key={column}>{row[column] == null ? <span className="missing-value">Missing</span> : String(row[column])}</td>)}</tr>)}</tbody></table></div>{sampleColumns.length < preview.after.column_count && <small>Showing {sampleColumns.length} of {preview.after.column_count} columns · first 5 rows</small>}</div>
          <div className="cleaning-apply-row"><span>The uploaded source remains available as its own dataset.</span><button className="primary-button" type="button" disabled={working} onClick={() => void applyOperations()}>{working ? <CircleNotch className="spin" size={16} /> : <Check size={16} />}{working ? " Saving copy…" : " Apply to new copy"}</button></div>
        </section>}
      </>}
    </>}
  </section>;
}

function CleaningIssueCard({ issue, selected, onToggle }: { issue: CleaningIssue; selected: boolean; onToggle: () => void }) {
  return <button type="button" className={`cleaning-issue ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onToggle}>
    <span className={`cleaning-issue-check ${selected ? "checked" : ""}`}>{selected ? <Check size={13} weight="bold" /> : null}</span>
    <span className="cleaning-issue-main"><span className="cleaning-issue-top"><strong>{issue.title}</strong><span className={`cleaning-confidence ${issue.confidence}`}>{issue.confidence} confidence</span></span><small>{issue.description}</small><span className="cleaning-columns">{issue.columns.slice(0, 5).join(" · ")}{issue.columns.length > 5 ? ` · +${issue.columns.length - 5} columns` : ""}</span><span className="cleaning-recommendation">{issue.recommendation}</span></span>
    <span className="cleaning-issue-count"><strong>{issue.count.toLocaleString()}</strong><small>affected</small></span>
  </button>;
}

function QualitySnapshot({ label, profile }: { label: string; profile: Dataset["profile"] }) {
  return <div className="quality-snapshot"><small>{label}</small><strong>{profile.row_count.toLocaleString()} <em>rows</em></strong><span>{profile.missing_cells.toLocaleString()} missing cells</span><span>{profile.duplicate_rows.toLocaleString()} exact duplicates</span></div>;
}

function HistoryList({ items, onSelect }: { items: Analysis[]; onSelect: (analysis: Analysis) => void }) {
  return <section className="secondary-page"><div className="secondary-title"><div><small>RECENT WORK</small><h1>Analysis history</h1><p>Runs saved in this local session.</p></div><ClockCounterClockwise size={24} /></div>{items.length ? items.map(item => <button className="history-card" key={item.run_id} onClick={() => onSelect(item)}><span className="history-icon"><ChartLine size={18} /></span><span><strong>{item.question}</strong><small>{item.run_id.slice(0, 8)} · {item.tools.length} tools · {item.latency_ms.toFixed(1)} ms</small></span><span className="history-result">{item.findings.length} findings</span><ArrowRight size={16} /></button>) : <EmptyState title="No analyses yet" detail="Your completed local runs will appear here." action={() => {}} />}</section>;
}

function TracePage({ items }: { items: Analysis[] }) {
  return <section className="secondary-page"><div className="secondary-title"><div><small>OBSERVABILITY</small><h1>Agent traces</h1><p>Tool selection, execution summaries, validation, and measured latency.</p></div><Pulse size={24} /></div>{items.length ? items.map(item => <div className="trace-run-card" key={item.run_id}><div className="trace-run-head"><strong>{item.question}</strong><span>{item.latency_ms.toFixed(1)} ms</span></div>{item.trace.map((step, index) => <TraceRow key={`${item.run_id}-${index}`} step={step} index={index} />)}</div>) : <div className="inline-empty">Run an analysis to create a trace.</div>}</section>;
}

function ReportPage({ analysis, onGenerate }: { analysis: Analysis | null; onGenerate: () => void }) {
  return <section className="secondary-page"><div className="secondary-title"><div><small>EXPORT</small><h1>Executive reports</h1><p>Create a Markdown summary with methodology, evidence, and caveats.</p></div><FileText size={24} /></div>{analysis ? <div className="report-preview"><div className="report-preview-head"><span className="report-icon"><FileText size={20} /></span><div><strong>ARGUS Analysis Report</strong><small>{analysis.question}</small></div><span className="confidence high">Ready</span></div><p>{analysis.answer}</p><div className="report-meta"><span>{analysis.findings.length} findings</span><span>{analysis.trace.length} trace steps</span><span>{analysis.latency_ms.toFixed(1)} ms measured</span><span>Model: {analysis.model_name || "Deterministic"}</span></div><div style={{ display: "flex", gap: "10px", marginTop: "14px" }} className="btn-no-print"><button className="primary-button" onClick={onGenerate}><ArrowDown size={16} /> Download Markdown</button><button className="outline-button" onClick={() => window.print()}><Printer size={16} /> Print / Save PDF</button></div></div> : <div className="inline-empty">Run an analysis before generating an executive report.</div>}</section>;
}

function EvaluationPage({ report, onRun, busy }: { report: EvaluationReport | null; onRun: () => void; busy: boolean }) {
  return <section className="secondary-page"><div className="secondary-title"><div><small>MODEL QUALITY</small><h1>Evaluation console</h1><p>Deterministic routing and retrieval fixtures. No model token metrics configured.</p></div><button className="outline-button" onClick={onRun} disabled={busy}>{busy ? <CircleNotch className="spin" size={16} /> : <ArrowClockwise size={16} />} Run suite</button></div>{report ? <><div className="metric-grid">{Object.entries(report.metrics).filter(([key]) => key !== "cases_passed" && key !== "cases_total").map(([key, value]) => <div className="metric-card" key={key}><strong>{typeof value === "number" && value <= 1 ? `${(value * 100).toFixed(0)}%` : value}</strong><small>{titleCase(key)}</small></div>)}</div><h2 className="subsection-heading">Tool selection cases</h2>{report.cases.map(test => <div className="evaluation-row" key={test.id}><span className={test.pass ? "evaluation-pass" : "evaluation-fail"}>{test.pass ? <Check size={14} /> : <WarningCircle size={14} />}</span><strong>{test.question}</strong><small>{test.selected.map(titleCase).join(" · ")}</small></div>)}<h2 className="subsection-heading">Retrieval metrics</h2><div className="retrieval-table"><div><span>Query</span><span>Recall@3</span><span>Precision@3</span><span>MRR</span></div>{report.retrieval.map(row => <div key={row.query}><span>{row.query}</span><span>{row.recall_at_k.toFixed(2)}</span><span>{row.precision_at_k.toFixed(2)}</span><span>{row.reciprocal_rank.toFixed(2)}</span></div>)}</div><ul className="eval-limitations">{report.limitations.map(item => <li key={item}>{item}</li>)}</ul></> : <div className="inline-empty">Run the evaluation suite to see measured routing and retrieval results.</div>}</section>;
}

function OverviewDashboard({
  analysis,
  dataset,
  onRunQuestion,
}: {
  analysis: Analysis | null;
  dataset: Dataset | null;
  onRunQuestion: (q: string) => void;
}) {
  const [activeVisIndex, setActiveVisIndex] = useState(0);
  const overview = analysis?.overview;

  if (!dataset) {
    return (
      <div className="chart-empty">
        <span>No dataset selected</span>
        <small>Select or upload a dataset to view its profile and analytics overview.</small>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="chart-empty" style={{ padding: "32px 16px" }}>
        <Sparkle size={32} weight="duotone" color="#1969d2" />
        <strong style={{ marginTop: "12px", fontSize: "14px" }}>Automated Dataset Overview</strong>
        <p style={{ maxWidth: "420px", color: "#62768f", fontSize: "12px", textAlign: "center", margin: "8px 0 16px" }}>
          Generate a deterministic statistical profile, data quality health check, distribution histograms, and multi-chart summaries for {dataset.name}.
        </p>
        <button
          className="primary-button"
          type="button"
          onClick={() => onRunQuestion("Give me an overview of this data.")}
        >
          <Sparkle size={15} weight="bold" /> Run Dataset Overview
        </button>
      </div>
    );
  }

  const qr = overview.quality;
  const visualizations = analysis?.visualizations || [];
  const currentVis = visualizations[activeVisIndex] || visualizations[0];

  return (
    <div className="overview-dashboard" style={{ padding: "16px", overflowY: "auto", maxHeight: "100%", width: "100%" }}>
      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px", marginBottom: "16px" }}>
        <div style={{ background: "#f8fbfe", border: "1px solid #e1ebf5", borderRadius: "8px", padding: "12px" }}>
          <div style={{ fontSize: "11px", color: "#62768f" }}>Total Rows</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#152943", marginTop: "2px" }}>{overview.row_count.toLocaleString()}</div>
        </div>
        <div style={{ background: "#f8fbfe", border: "1px solid #e1ebf5", borderRadius: "8px", padding: "12px" }}>
          <div style={{ fontSize: "11px", color: "#62768f" }}>Columns</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#152943", marginTop: "2px" }}>{overview.column_count}</div>
        </div>
        <div style={{ background: "#f8fbfe", border: "1px solid #e1ebf5", borderRadius: "8px", padding: "12px" }}>
          <div style={{ fontSize: "11px", color: "#62768f" }}>Completeness</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: qr.completeness_score >= 90 ? "#16a34a" : qr.completeness_score >= 70 ? "#ca8a04" : "#dc2626", marginTop: "2px" }}>
            {qr.completeness_score.toFixed(1)}%
          </div>
        </div>
        <div style={{ background: "#f8fbfe", border: "1px solid #e1ebf5", borderRadius: "8px", padding: "12px" }}>
          <div style={{ fontSize: "11px", color: "#62768f" }}>Duplicate Rows</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: qr.duplicate_rows === 0 ? "#16a34a" : "#dc2626", marginTop: "2px" }}>
            {qr.duplicate_rows} <small style={{ fontSize: "11px", fontWeight: 400, color: "#62768f" }}>({qr.duplicate_pct.toFixed(1)}%)</small>
          </div>
        </div>
        <div style={{ background: "#f8fbfe", border: "1px solid #e1ebf5", borderRadius: "8px", padding: "12px" }}>
          <div style={{ fontSize: "11px", color: "#62768f" }}>Missing Cells</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: qr.missing_cells === 0 ? "#16a34a" : "#dc2626", marginTop: "2px" }}>
            {qr.missing_cells} <small style={{ fontSize: "11px", fontWeight: 400, color: "#62768f" }}>({qr.missing_cells_pct.toFixed(1)}%)</small>
          </div>
        </div>
      </div>

      {/* Visualizations Carousel / Selector */}
      {visualizations.length > 0 && (
        <div style={{ border: "1px solid #e1ebf5", borderRadius: "8px", padding: "12px", marginBottom: "16px", background: "#ffffff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
            <strong style={{ fontSize: "12px", color: "#152943" }}>Visual Overview & Distributions ({visualizations.length} views)</strong>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {visualizations.map((vis, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveVisIndex(i)}
                  style={{
                    fontSize: "11px",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    border: i === activeVisIndex ? "1px solid #1969d2" : "1px solid #e1ebf5",
                    background: i === activeVisIndex ? "#edf5ff" : "#ffffff",
                    color: i === activeVisIndex ? "#1969d2" : "#62768f",
                    cursor: "pointer",
                    fontWeight: i === activeVisIndex ? 600 : 400,
                  }}
                >
                  {vis.title.split(" - ")[0] || vis.title}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: "260px" }}>
            <AnalysisChart analysis={{ ...analysis!, visualization: currentVis }} />
          </div>
        </div>
      )}

      {/* Top Correlations */}
      {overview.correlations && overview.correlations.length > 0 && (
        <div style={{ border: "1px solid #e1ebf5", borderRadius: "8px", padding: "12px", marginBottom: "16px", background: "#ffffff" }}>
          <strong style={{ fontSize: "12px", color: "#152943", display: "block", marginBottom: "8px" }}>Linear Correlation Matrix (Pearson |r| ≥ 0.2)</strong>
          <table className="sql-table" style={{ width: "100%", fontSize: "11px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Feature A</th>
                <th style={{ textAlign: "left" }}>Feature B</th>
                <th style={{ textAlign: "right" }}>Pearson r</th>
                <th style={{ textAlign: "right" }}>Relationship</th>
              </tr>
            </thead>
            <tbody>
              {overview.correlations.map((pair, idx) => (
                <tr key={idx}>
                  <td>{pair.column_a}</td>
                  <td>{pair.column_b}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{pair.correlation.toFixed(3)}</td>
                  <td style={{ textAlign: "right", color: pair.correlation > 0 ? "#16a34a" : "#dc2626" }}>
                    {pair.correlation > 0.7 ? "Strong Positive" : pair.correlation > 0.3 ? "Moderate Positive" : pair.correlation < -0.7 ? "Strong Negative" : pair.correlation < -0.3 ? "Moderate Negative" : "Weak"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Column Statistical Profiles Table */}
      <div style={{ border: "1px solid #e1ebf5", borderRadius: "8px", padding: "12px", background: "#ffffff" }}>
        <strong style={{ fontSize: "12px", color: "#152943", display: "block", marginBottom: "8px" }}>Detailed Column Profiling</strong>
        <div style={{ overflowX: "auto" }}>
          <table className="sql-table" style={{ width: "100%", fontSize: "11px" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Column</th>
                <th>Type</th>
                <th>Semantic</th>
                <th style={{ textAlign: "right" }}>Missing %</th>
                <th style={{ textAlign: "right" }}>Unique</th>
                <th style={{ textAlign: "right" }}>Min</th>
                <th style={{ textAlign: "right" }}>Median</th>
                <th style={{ textAlign: "right" }}>Mean</th>
                <th style={{ textAlign: "right" }}>Max</th>
                <th style={{ textAlign: "center" }}>Flags</th>
              </tr>
            </thead>
            <tbody>
              {overview.columns.map((col) => (
                <tr key={col.name}>
                  <td style={{ fontWeight: 600 }}>{col.name}</td>
                  <td>{col.dtype}</td>
                  <td><span className={`legend-dot ${col.semantic_type}`} style={{ display: "inline-block", marginRight: "4px" }} />{col.semantic_type}</td>
                  <td style={{ textAlign: "right", color: col.missing_pct > 0 ? "#dc2626" : "inherit" }}>{col.missing_pct.toFixed(1)}%</td>
                  <td style={{ textAlign: "right" }}>{col.unique.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{col.summary?.min != null ? Number(col.summary.min).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}</td>
                  <td style={{ textAlign: "right" }}>{col.summary?.median != null ? Number(col.summary.median).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}</td>
                  <td style={{ textAlign: "right" }}>{col.summary?.mean != null ? Number(col.summary.mean).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}</td>
                  <td style={{ textAlign: "right" }}>{col.summary?.max != null ? Number(col.summary.max).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}</td>
                  <td style={{ textAlign: "center" }}>
                    {col.is_constant && <span style={{ color: "#d97706", fontSize: "10px", marginRight: "4px" }}>Constant</span>}
                    {col.has_outliers && <span style={{ color: "#dc2626", fontSize: "10px" }}>Outliers</span>}
                    {!col.is_constant && !col.has_outliers && <span style={{ color: "#16a34a", fontSize: "10px" }}>OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

