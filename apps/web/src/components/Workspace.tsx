"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Pulse, ArrowClockwise, ArrowDown, ArrowRight, ArrowsOutCardinal, ArrowsLeftRight,
  ChartBar, ChartLine, Check, CircleNotch, ClockCounterClockwise, CloudArrowUp, Database,
  DotsThree, FileText, Funnel, Gauge, Graph, Info, MagnifyingGlass, Plus, Question,
  ShieldCheck, Sparkle, Table, TerminalWindow, WarningCircle, X,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AnalysisChart } from "@/components/AnalysisChart";
import { api, type Analysis, type Dataset, type EvaluationReport, type TraceStep } from "@/lib/api";

const DatasetUniverse = dynamic(() => import("@/components/DatasetUniverse").then(module => module.DatasetUniverse), { ssr: false, loading: () => <div className="chart-empty"><span>Preparing 3D schema view…</span></div> });

type View = "analysis" | "datasets" | "history" | "reports" | "traces" | "evaluations";
type RightTab = "insights" | "evidence" | "data" | "notes";
type CenterTab = "universe" | "trend" | "segments" | "query";

const defaultQuestion = "Show the monthly revenue trend and compare regions.";
const viewLabels: Record<View, string> = { analysis: "Analysis", datasets: "Datasets", history: "Analysis history", reports: "Reports", traces: "Agent traces", evaluations: "Evaluations" };
const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());

export function Workspace() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [question, setQuestion] = useState(defaultQuestion);
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
      void runQuestion(defaultQuestion, preferred.id);
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
      setSelectedId(dataset.id); setQuestion("Profile this dataset and identify useful next questions.");
      setToast(`${dataset.name} is ready for analysis`);
      await runQuestion("Profile this dataset and identify useful next questions.", dataset.id);
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
      const link = document.createElement("a"); link.href = url; link.download = `nexus-report-${analysis.run_id.slice(0, 8)}.md`; link.click(); URL.revokeObjectURL(url);
      setToast("Executive report downloaded");
    } catch { setToast("Report generation failed"); }
  };

  const shareRun = async () => {
    if (!analysis) { setToast("Run an analysis first"); return; }
    try { await navigator.clipboard.writeText(`${window.location.origin}/?run=${analysis.run_id}`); setToast("Run link copied"); }
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

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => { window.location.href = "/"; }} aria-label="NEXUS home"><span className="brand-mark"><Graph weight="bold" /></span><span className="brand-name">NEXUS</span><span className="brand-divider" /><span className="brand-subtitle">Autonomous Data Analyst</span><span className="beta-pill">LOCAL</span></button>
      <div className="topbar-actions"><span className="runtime-indicator"><span className="status-dot" />Deterministic engine</span><button className="icon-button search-trigger" onClick={() => document.getElementById("question-input")?.focus()} aria-label="Search or ask"><MagnifyingGlass size={18} /></button><button className="share-button" onClick={() => void shareRun()}><ArrowsLeftRight size={17} /> <span>Share</span></button><button className="primary-button top-new" onClick={() => { setAnalysis(null); setQuestion(""); setView("analysis"); document.getElementById("question-input")?.focus(); }}><Plus size={18} weight="bold" /> New analysis</button></div>
    </header>

    <div className="workspace-grid">
      <aside className="left-sidebar">
        <div className="side-head"><strong>Datasets</strong><button className="subtle-icon" onClick={() => inputFile.current?.click()} aria-label="Add dataset"><Plus size={17} /></button></div>
        <label className="dataset-search"><MagnifyingGlass size={16} /><input aria-label="Search datasets" placeholder="Search datasets..." value={filter} onChange={e => setFilter(e.target.value)} /></label>
        <div className="dataset-list">
          {visibleDatasets.map(dataset => <button key={dataset.id} className={`dataset-item ${dataset.id === selectedId ? "selected" : ""}`} onClick={() => selectDataset(dataset.id)}>
            <span className="dataset-icon"><Database size={19} weight="duotone" /></span><span className="dataset-copy"><strong>{dataset.name}</strong><small>{dataset.profile.column_count} columns · {dataset.profile.row_count.toLocaleString()} rows</small></span><DotsThree size={19} className="dataset-menu-icon" />
          </button>)}
          {!visibleDatasets.length && <p className="empty-filter">No matching datasets</p>}
        </div>

        <div className="sidebar-section-title"><strong>Workspace</strong></div>
        <nav className="primary-nav" aria-label="Workspace navigation">
          <NavItem active={view === "analysis"} icon={<ChartLine size={18} />} label="New analysis" onClick={() => { setAnalysis(null); setQuestion(""); setView("analysis"); }} />
          <NavItem active={view === "datasets"} icon={<Table size={18} />} label="Datasets" onClick={() => changeView("datasets")} />
          <NavItem active={view === "history"} icon={<ClockCounterClockwise size={18} />} label="Analysis history" badge={String(history.length)} onClick={() => changeView("history")} />
          <NavItem active={view === "reports"} icon={<FileText size={18} />} label="Reports" onClick={() => changeView("reports")} />
          <NavItem active={view === "traces"} icon={<TerminalWindow size={18} />} label="Agent traces" onClick={() => changeView("traces")} />
          <NavItem active={view === "evaluations"} icon={<Gauge size={18} />} label="Evaluations" onClick={() => changeView("evaluations")} />
        </nav>

        <div className="sidebar-bottom"><button className="upload-card" onClick={() => inputFile.current?.click()}><span className="upload-icon"><CloudArrowUp size={19} /></span><span><strong>Add data</strong><small>CSV · XLSX · JSON</small></span><ArrowRight size={16} /></button><div className="privacy-note"><ShieldCheck size={16} /><span>Files are sent to the NEXUS API for processing</span></div></div>
        <input ref={inputFile} type="file" accept=".csv,.xlsx,.json" hidden onChange={uploadFile} />
      </aside>

      <section className="main-column">
        <div className="dataset-header"><div className="active-dataset-mark"><Database size={19} weight="duotone" /></div><button className="dataset-select" onClick={() => setView("datasets")}>{selected?.name ?? "Select a dataset"}<ArrowDown size={14} /></button><span className="dataset-meta">{selected ? `${selected.profile.column_count} fields · ${selected.profile.row_count.toLocaleString()} rows` : "Upload a CSV, XLSX, or JSON file"}</span><span className="header-spacer" /><button className="outline-button details-button" onClick={() => setRightTab("data")}><Info size={16} /> Details</button><button className="subtle-icon more-button" onClick={() => setShowTrace(value => !value)} aria-label="Toggle run trace"><DotsThree size={19} /></button></div>

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
          {analysis && <article className="answer-block"><div className="answer-heading"><div><small>ANALYSIS ANSWER</small><h1>{analysis.findings[0]?.title ?? "Dataset analysis"}</h1></div><Confidence value={analysis.findings[0]?.confidence ?? "low"} /></div><p>{analysis.answer}</p><div className="answer-footer"><span><Check size={14} /> {analysis.validation.passed ? "Evidence check passed" : "Needs review"}</span><span>Source: {selected?.filename ?? "selected dataset"}</span><button className="text-button" onClick={() => setRightTab("evidence")}>Inspect sources <ArrowRight size={14} /></button></div></article>}

          <section className="analysis-canvas-panel">
            <div className="canvas-tabs" role="tablist" aria-label="Analysis views">
              <Tab active={centerTab === "universe"} icon={<Graph size={15} />} label="Dataset universe" onClick={() => setCenterTab("universe")} />
              <Tab active={centerTab === "trend"} icon={<ChartLine size={15} />} label="Revenue trend" onClick={() => setCenterTab("trend")} />
              <Tab active={centerTab === "segments"} icon={<ChartBar size={15} />} label="Segment breakdown" onClick={() => setCenterTab("segments")} />
              <Tab active={centerTab === "query"} icon={<TerminalWindow size={15} />} label="Query details" onClick={() => setCenterTab("query")} />
              <span className="canvas-tab-spacer" /><button className="text-button catalog-button" onClick={() => setRightTab("data")}><ArrowsOutCardinal size={14} /> Schema details</button>
            </div>
            <div className="universe-meta-row"><div><strong>{centerTab === "universe" ? "Dataset universe" : centerTab === "trend" ? "Revenue trend" : centerTab === "segments" ? "Segment breakdown" : "Query details"}</strong><span>{selected ? `${selected.profile.column_count} fields · relationships shown from the selected file` : "Waiting for dataset"}</span></div><div className="legend"><span><i className="legend-dot numeric" />Numeric</span><span><i className="legend-dot categorical" />Category</span><span><i className="legend-dot temporal" />Time</span><span><i className="legend-dot issue" />Data quality</span></div></div>
            <div className="visual-area">
              {centerTab === "universe" && selected && <DatasetUniverse columns={selected.profile.columns} />}
              {centerTab === "trend" && <AnalysisChart analysis={analysis} purpose="trend" />}
              {centerTab === "segments" && <AnalysisChart analysis={analysis} purpose="segments" />}
              {centerTab === "query" && <QueryDetails analysis={analysis} />}
              {!selected && <EmptyState title="Add a dataset to begin" detail="Drop in a CSV, XLSX, or JSON file to map its schema and ask questions." action={() => inputFile.current?.click()} />}
            </div>
            {centerTab === "universe" && <div className="evidence-chart-strip"><AnalysisChart analysis={analysis} purpose="trend" /></div>}
          </section>

        </>}

        {view === "datasets" && <DatasetList datasets={datasets} onSelect={selectDataset} onUpload={() => inputFile.current?.click()} />}
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

function QueryDetails({ analysis }: { analysis: Analysis | null }) {
  if (!analysis) return <div className="chart-empty"><span>Query details appear after analysis</span></div>;
  const sql = analysis.trace.find(step => step.name === "sql_query")?.output_summary.sql;
  return <div className="query-details"><div className="query-detail-block"><small>USER QUESTION</small><p>{analysis.question}</p></div><div className="query-detail-block"><small>TOOLS SELECTED</small><div className="tool-chip-list">{analysis.tools.map(tool => <span key={tool}>{titleCase(tool)}</span>)}</div></div><div className="query-detail-block"><small>READ-ONLY SQL</small><pre>{typeof sql === "string" ? sql : "No SQL aggregation was selected for this question."}</pre></div><div className="query-detail-block"><small>VALIDATION</small><p>{analysis.validation.passed ? "Passed" : "Needs review"}: {analysis.validation.checked.join(" · ")}</p></div></div>;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action: () => void }) {
  return <div className="empty-state"><CloudArrowUp size={28} /><strong>{title}</strong><span>{detail}</span><button className="outline-button" onClick={action}><Plus size={15} /> Add dataset</button></div>;
}

function DatasetList({ datasets, onSelect, onUpload }: { datasets: Dataset[]; onSelect: (id: string) => void; onUpload: () => void }) {
  return <section className="secondary-page"><div className="secondary-title"><div><small>YOUR WORKSPACE</small><h1>Datasets</h1><p>Inspect the profile and choose a dataset to ask a question.</p></div><button className="primary-button" onClick={onUpload}><Plus size={16} /> Add dataset</button></div>{datasets.map(dataset => <button className="dataset-card" key={dataset.id} onClick={() => onSelect(dataset.id)}><span className="dataset-icon large"><Database size={21} /></span><span><strong>{dataset.name}</strong><small>{dataset.filename} · {dataset.format.toUpperCase()}</small></span><span className="dataset-card-stat"><b>{dataset.profile.row_count.toLocaleString()}</b><small>rows</small></span><span className="dataset-card-stat"><b>{dataset.profile.column_count}</b><small>fields</small></span><ArrowRight size={17} /></button>)}</section>;
}

function HistoryList({ items, onSelect }: { items: Analysis[]; onSelect: (analysis: Analysis) => void }) {
  return <section className="secondary-page"><div className="secondary-title"><div><small>RECENT WORK</small><h1>Analysis history</h1><p>Runs saved in this local session.</p></div><ClockCounterClockwise size={24} /></div>{items.length ? items.map(item => <button className="history-card" key={item.run_id} onClick={() => onSelect(item)}><span className="history-icon"><ChartLine size={18} /></span><span><strong>{item.question}</strong><small>{item.run_id.slice(0, 8)} · {item.tools.length} tools · {item.latency_ms.toFixed(1)} ms</small></span><span className="history-result">{item.findings.length} findings</span><ArrowRight size={16} /></button>) : <EmptyState title="No analyses yet" detail="Your completed local runs will appear here." action={() => {}} />}</section>;
}

function TracePage({ items }: { items: Analysis[] }) {
  return <section className="secondary-page"><div className="secondary-title"><div><small>OBSERVABILITY</small><h1>Agent traces</h1><p>Tool selection, execution summaries, validation, and measured latency.</p></div><Pulse size={24} /></div>{items.length ? items.map(item => <div className="trace-run-card" key={item.run_id}><div className="trace-run-head"><strong>{item.question}</strong><span>{item.latency_ms.toFixed(1)} ms</span></div>{item.trace.map((step, index) => <TraceRow key={`${item.run_id}-${index}`} step={step} index={index} />)}</div>) : <div className="inline-empty">Run an analysis to create a trace.</div>}</section>;
}

function ReportPage({ analysis, onGenerate }: { analysis: Analysis | null; onGenerate: () => void }) {
  return <section className="secondary-page"><div className="secondary-title"><div><small>EXPORT</small><h1>Executive reports</h1><p>Create a Markdown summary with methodology, evidence, and caveats.</p></div><FileText size={24} /></div>{analysis ? <div className="report-preview"><div className="report-preview-head"><span className="report-icon"><FileText size={20} /></span><div><strong>NEXUS Executive Analysis</strong><small>{analysis.question}</small></div><span className="confidence high">Ready</span></div><p>{analysis.answer}</p><div className="report-meta"><span>{analysis.findings.length} findings</span><span>{analysis.trace.length} trace steps</span><span>{analysis.latency_ms.toFixed(1)} ms measured</span></div><button className="primary-button" onClick={onGenerate}><ArrowDown size={16} /> Download Markdown</button></div> : <div className="inline-empty">Run an analysis before generating an executive report.</div>}</section>;
}

function EvaluationPage({ report, onRun, busy }: { report: EvaluationReport | null; onRun: () => void; busy: boolean }) {
  return <section className="secondary-page"><div className="secondary-title"><div><small>MODEL QUALITY</small><h1>Evaluation console</h1><p>Deterministic routing and retrieval fixtures. No model token metrics configured.</p></div><button className="outline-button" onClick={onRun} disabled={busy}>{busy ? <CircleNotch className="spin" size={16} /> : <ArrowClockwise size={16} />} Run suite</button></div>{report ? <><div className="metric-grid">{Object.entries(report.metrics).filter(([key]) => key !== "cases_passed" && key !== "cases_total").map(([key, value]) => <div className="metric-card" key={key}><strong>{typeof value === "number" && value <= 1 ? `${(value * 100).toFixed(0)}%` : value}</strong><small>{titleCase(key)}</small></div>)}</div><h2 className="subsection-heading">Tool selection cases</h2>{report.cases.map(test => <div className="evaluation-row" key={test.id}><span className={test.pass ? "evaluation-pass" : "evaluation-fail"}>{test.pass ? <Check size={14} /> : <WarningCircle size={14} />}</span><strong>{test.question}</strong><small>{test.selected.map(titleCase).join(" · ")}</small></div>)}<h2 className="subsection-heading">Retrieval metrics</h2><div className="retrieval-table"><div><span>Query</span><span>Recall@3</span><span>Precision@3</span><span>MRR</span></div>{report.retrieval.map(row => <div key={row.query}><span>{row.query}</span><span>{row.recall_at_k.toFixed(2)}</span><span>{row.precision_at_k.toFixed(2)}</span><span>{row.reciprocal_rank.toFixed(2)}</span></div>)}</div><ul className="eval-limitations">{report.limitations.map(item => <li key={item}>{item}</li>)}</ul></> : <div className="inline-empty">Run the evaluation suite to see measured routing and retrieval results.</div>}</section>;
}
