"use client";

import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownRight, ArrowRight, BracketsCurly, ChartBar, ChartLine, CheckCircle,
  CircleNotch, Database, GithubLogo, Graph, MagnifyingGlass, ShieldCheck,
  Sparkle, Table, TerminalWindow, WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { AnalysisChart } from "@/components/AnalysisChart";
import { api, type Analysis, type Dataset, type EvaluationReport } from "@/lib/api";

const DatasetUniverse = dynamic(() => import("@/components/DatasetUniverse").then(module => module.DatasetUniverse), { ssr: false, loading: () => <div className="landing-scene-loading">Preparing dataset map…</div> });

const workflow = [
  { icon: <MagnifyingGlass size={19} />, title: "Understand the question", description: "Match the request to the dataset schema and the right metric." },
  { icon: <BracketsCurly size={19} />, title: "Plan with evidence", description: "Choose only the tools that fit the analysis task." },
  { icon: <ChartBar size={19} />, title: "Compute deterministically", description: "Run Python and read-only SQL against the selected data." },
  { icon: <ShieldCheck size={19} />, title: "Validate the result", description: "Check calculations, trace the sources, surface caveats." },
];

const capabilities = [
  { icon: <Database size={18} />, title: "Schema-first ingestion", description: "CSV, XLSX and JSON profiling with missingness, cardinality and field types." },
  { icon: <TerminalWindow size={18} />, title: "Observable tool runs", description: "See selected tools, input summaries, outputs, validation and measured latency." },
  { icon: <ChartLine size={18} />, title: "Evidence-linked visuals", description: "Charts use computed aggregates and name the row source and method." },
];

function Reveal({ children, className = "", ...props }: { children: React.ReactNode; className?: string; "aria-label"?: string }) {
  const reduceMotion = useReducedMotion();
  return <motion.div {...props} className={className} initial={reduceMotion ? false : { opacity: 0, y: 22, filter: "blur(5px)" }} whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

export function Landing() {
  const reduceMotion = useReducedMotion();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [demoAnalysis, setDemoAnalysis] = useState<Analysis | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationReport | null>(null);
  const [evaluationBusy, setEvaluationBusy] = useState(false);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    api.datasets().then(items => {
      const sample = items.find(item => item.id === "demo-sales") ?? items[0];
      if (!sample) { setApiAvailable(false); return; }
      setDataset(sample); setApiAvailable(true);
      return api.analyze(sample.id, "Show the monthly revenue trend and compare regions.").then(setDemoAnalysis);
    }).catch(() => setApiAvailable(false));
  }, []);

  const runEvaluation = async () => {
    setEvaluationBusy(true);
    try { setEvaluation(await api.evaluate()); }
    catch { setApiAvailable(false); }
    finally { setEvaluationBusy(false); }
  };

  return <main className="landing-page">
    <motion.header className="landing-header" initial={reduceMotion ? false : { opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}>
      <a className="landing-brand" href="/" aria-label="NEXUS home"><Graph size={24} weight="bold" /><strong>NEXUS</strong><span className="landing-brand-rule" /><small>Autonomous Data Intelligence</small></a>
      <nav className="landing-nav" aria-label="Main navigation"><a href="#workflow">How it works</a><a href="#architecture">Architecture</a><a href="#profile">About Samyak</a></nav>
      <a className="landing-launch" href="/workspace">Launch analyst <ArrowRight size={16} /></a>
    </motion.header>

    <motion.section className="landing-hero" initial={reduceMotion ? false : "hidden"} animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.13, delayChildren: reduceMotion ? 0 : 0.12 } } }}>
      <motion.div className="hero-copy" variants={{ hidden: { opacity: 0, y: 24, filter: "blur(7px)" }, visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1] } } }}>
        <div className="eyebrow"><span className="eyebrow-dot" />CREATED BY SAMYAK ANAND</div>
        <h1>Building AI<br /><span>that earns trust.</span></h1>
        <p>AI engineering through grounded computation, applied machine learning, and evidence-backed product experiences. Meet NEXUS, my flagship project.</p>
        <div className="hero-actions"><a href="/workspace" className="landing-primary">Launch Analyst <ArrowRight size={16} /></a><a href="#architecture" className="landing-secondary">View Architecture <ArrowDownRight size={16} /></a></div>
        <div className="hero-proof"><span><CheckCircle size={15} />Deterministic analysis</span><span><CheckCircle size={15} />Source-linked findings</span></div>
      </motion.div>
      <motion.div className="hero-visual-column" variants={{ hidden: { opacity: 0, y: 30, rotateX: 5, scale: 0.97 }, visible: { opacity: 1, y: 0, rotateX: 0, scale: 1, transition: { duration: 1, ease: [0.22, 1, 0.36, 1] } } }}>
        <div className="hero-visual-head"><span className="hero-scene-title"><span className="live-pulse" />Dataset universe</span><span className="schematic-label">{dataset ? `${dataset.profile.row_count.toLocaleString()} rows · ${dataset.profile.column_count} fields` : apiAvailable === false ? "API offline" : "Loading dataset profile"}</span></div>
        <div className="landing-scene">{dataset ? <DatasetUniverse columns={dataset.profile.columns} /> : <div className="landing-scene-loading"><CircleNotch className="spin" size={18} />{apiAvailable === false ? "Start the API to explore the live schema map." : "Preparing the live schema map…"}</div>}</div>
        <div className="hero-visual-foot"><span><i className="legend-dot numeric" />Numeric</span><span><i className="legend-dot categorical" />Categorical</span><span><i className="legend-dot temporal" />Temporal</span><span className="hero-foot-note">A map of the loaded schema, not a decorative model.</span></div>
      </motion.div>
      <motion.span className="hero-index" variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { delay: 0.8 } } }}>N / 01</motion.span>
    </motion.section>

    <motion.section className="signal-strip" aria-label="Demo capabilities" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : 0.7, duration: reduceMotion ? 0 : 0.8 }}><span>CSV · XLSX · JSON</span><i /><span>Python &amp; SQL tools</span><i /><span>Evidence-first answers</span><i /><span>Evaluation included</span></motion.section>

    <section className="landing-section workflow-section" id="workflow">
      <Reveal className="section-heading"><div><small>FROM QUESTION TO EVIDENCE</small><h2>A measured path<br />from data to decision.</h2></div><p>NEXUS inspects the schema, plans a focused analysis, runs only useful tools, and keeps each finding connected to its calculation.</p></Reveal>
      <div className="workflow-grid">{workflow.map((step, index) => <Reveal className={`workflow-step ${activeStep === index ? "selected" : ""}`} key={step.title}><button onClick={() => setActiveStep(index)} aria-pressed={activeStep === index}><span className="workflow-icon">{step.icon}</span><span className="workflow-number">0{index + 1}</span><strong>{step.title}</strong><p>{step.description}</p><span className="workflow-arrow"><ArrowRight size={15} /></span></button></Reveal>)}</div>
      <div className="workflow-detail" aria-live="polite"><span>STEP 0{activeStep + 1}</span><strong>{workflow[activeStep].title}</strong><p>{workflow[activeStep].description}</p></div>
    </section>

    <section className="universe-story" id="universe">
      <Reveal className="universe-story-visual"><div className="story-visual-label"><Graph size={16} />SCHEMA, MADE VISIBLE</div>{dataset ? <div className="schema-preview"><div className="schema-preview-head"><span>FIELD</span><span>TYPE</span><span>UNIQUE</span></div>{dataset.profile.columns.slice(0, 8).map(column => <div className="schema-preview-row" key={column.name}><span><i className={`legend-dot ${column.semantic_type}`} />{column.name}</span><small>{column.semantic_type}</small><small>{column.unique.toLocaleString()}</small></div>)}<div className="schema-preview-foot">{dataset.profile.columns.length > 8 ? `+${dataset.profile.columns.length - 8} more fields · ` : ""}{dataset.profile.missing_cells.toLocaleString()} missing cells across the file</div></div> : <div className="landing-scene-loading">Connect the API to inspect the live schema.</div>}</Reveal>
      <Reveal className="universe-story-copy"><small>THE DATASET UNIVERSE</small><h2>See the shape<br />of your data.</h2><p>Field nodes are sized by distinct values and grouped by semantic type. A selected field reveals its profile; missingness is marked for review. The ordinary chart remains the evidence for the business question.</p><div className="story-facts">{dataset ? <><div><strong>{dataset.profile.row_count.toLocaleString()}</strong><span>rows inspected</span></div><div><strong>{dataset.profile.column_count}</strong><span>fields mapped</span></div><div><strong>{dataset.profile.missing_cells.toLocaleString()}</strong><span>missing cells</span></div></> : <div><strong>Waiting for API</strong><span>Live profile unavailable</span></div>}</div><a href="/workspace" className="inline-link">Explore the analysis workspace <ArrowRight size={15} /></a></Reveal>
    </section>

    <section className="landing-section live-demo-section" id="demo">
      <Reveal className="section-heading"><div><small>LIVE ANALYSIS</small><h2>Computed values.<br />Inspectable evidence.</h2></div><p>The sample view is run against NEXUS's deterministic synthetic retail dataset. Charts and findings come from the current API response; when the API is offline, no sample results are fabricated.</p></Reveal>
      <Reveal className="live-demo-grid"><article className="live-answer"><div className="live-answer-top"><span><Sparkle size={15} />DEMO QUESTION</span><span className="demo-status">{demoAnalysis ? "Computed" : apiAvailable === false ? "API offline" : "Running"}</span></div><h3>Show the monthly revenue trend and compare regions.</h3>{demoAnalysis ? <><div className="demo-finding"><small>FINDING</small><strong>{demoAnalysis.findings[0]?.title}</strong><p>{demoAnalysis.answer}</p></div><div className="demo-evidence"><CheckCircle size={15} /><span>{demoAnalysis.validation.passed ? "Evidence check passed" : "Needs review"}</span><span>·</span><span>{demoAnalysis.profile_summary.row_count.toLocaleString()} rows</span><span>·</span><span>{demoAnalysis.latency_ms.toFixed(1)} ms measured</span></div></> : <div className="demo-offline"><WarningCircle size={17} />{apiAvailable === false ? "Run FastAPI to load an actual analysis response." : "Waiting for the analysis response…"}</div>}<a className="inline-link" href="/workspace">Ask a follow-up question <ArrowRight size={15} /></a></article><div className="live-chart-panel"><AnalysisChart analysis={demoAnalysis} /></div></Reveal>
    </section>

    <section className="landing-section capabilities-section" id="capabilities">
      <Reveal className="section-heading"><div><small>BUILT FOR ANALYSIS</small><h2>Trust the work<br />behind the answer.</h2></div><p>Engineering details are part of the product: compact inputs, deterministic computation, validation, and an inspectable run trace.</p></Reveal>
      <div className="capability-list">{capabilities.map((item, index) => <Reveal className="capability-row" key={item.title}><span className="capability-index">0{index + 1}</span><span className="capability-icon">{item.icon}</span><strong>{item.title}</strong><p>{item.description}</p><ArrowRight size={16} /></Reveal>)}</div>
    </section>

    <section className="evaluation-section" id="evaluation">
      <Reveal className="evaluation-intro"><small>AI QUALITY CONSOLE</small><h2>Evaluate the system,<br />not the screenshot.</h2><p>Run routing and retrieval fixtures locally. Metrics are computed from test cases; token use and model cost remain unavailable without a configured provider.</p><button className="landing-secondary" onClick={() => void runEvaluation()} disabled={evaluationBusy}>{evaluationBusy ? <CircleNotch className="spin" size={16} /> : <ArrowRight size={16} />}{evaluationBusy ? "Running suite…" : "Run evaluation"}</button></Reveal>
      <Reveal className="evaluation-console"><div className="console-top"><span><span className="status-dot" />EVALUATION RUN</span><span>{evaluation ? `${evaluation.metrics.cases_passed}/${evaluation.metrics.cases_total} cases passed` : "No run yet"}</span></div>{evaluation ? <><div className="console-metrics">{["tool_selection_accuracy", "tool_success_rate", "recall_at_k", "precision_at_k", "mrr"].map(key => <div key={key}><strong>{Math.round(Number(evaluation.metrics[key] ?? 0) * 100)}%</strong><small>{key.replaceAll("_", " ")}</small></div>)}</div><div className="console-cases">{evaluation.cases.map(item => <div key={item.id}><span className={item.pass ? "case-pass" : "case-fail"}>{item.pass ? <CheckCircle size={14} /> : <WarningCircle size={14} />}</span><span>{item.question}</span><small>{item.pass ? "PASS" : "FAIL"}</small></div>)}</div><p className="console-caveat">Retrieval fixtures measure column metadata ranking; they do not claim vector-search quality.</p></> : <div className="console-placeholder"><div className="placeholder-rule" /><div className="placeholder-rule short" /><div className="placeholder-rule" /><small>Run the suite to populate measured results.</small></div>}</Reveal>
    </section>

    <section className="landing-section architecture-section" id="architecture">
      <Reveal className="section-heading"><div><small>ENGINEERING ARCHITECTURE</small><h2>Small context.<br />Grounded computation.</h2></div><p>Raw rows stay in the analysis process. The planner sees schema and compact summaries, and the answer cites the computations that support it.</p></Reveal>
      <Reveal className="architecture-flow" aria-label="NEXUS system architecture"><div><small>01 · EXPERIENCE</small><strong>Next.js workspace</strong><span>Upload · question · evidence</span></div><ArrowRight /><div><small>02 · ORCHESTRATE</small><strong>LangGraph workflow</strong><span>Profile → plan → branch</span></div><ArrowRight /><div><small>03 · COMPUTE</small><strong>Python · Pandas · SQL</strong><span>Statistics · anomalies · charts</span></div><ArrowRight /><div><small>04 · VALIDATE</small><strong>Evidence &amp; trace</strong><span>Checks · caveats · report</span></div></Reveal>
      <Reveal className="stack-row"><span>Next.js 16</span><span>React Three Fiber</span><span>FastAPI</span><span>LangGraph</span><span>Pandas</span><span>PostgreSQL + pgvector schema</span></Reveal>
    </section>

    <section className="profile-section" id="profile">
      <Reveal className="creator-card"><div className="creator-orbit" aria-hidden="true"><span className="orbit-core"><Graph size={36} weight="bold" /></span><i /><i /><i /></div><div className="creator-copy"><small>AN INDEPENDENT PROJECT BY SAMYAK ANAND</small><h2>Built around a simple belief:<br /><span>AI should show its work.</span></h2><p>I created NEXUS to make data analysis more transparent. It profiles data, chooses relevant computations, and keeps findings tied to evidence—so you can inspect how an answer was reached.</p><div className="creator-signature"><span className="creator-line" /><strong>Samyak Anand</strong><span>Creator · NEXUS</span></div><a href="/workspace" className="inline-link">Step inside the project <ArrowRight size={15} /></a></div><span className="creator-index">N / CREATOR</span></Reveal>
    </section>

    <footer className="landing-footer"><div className="footer-main"><a className="landing-brand" href="/workspace"><Graph size={22} weight="bold" /><strong>NEXUS</strong></a><p>Created by Samyak Anand<br />Autonomous Data Intelligence</p><a href="/workspace" className="landing-primary">Launch Analyst <ArrowRight size={15} /></a></div><div className="footer-bottom"><span>Local prototype · deterministic analysis mode</span><span className="repo-note"><GithubLogo size={15} /> GitHub repository not connected</span><span>LLM, PostgreSQL persistence, and vector retrieval are not enabled in this local build.</span></div></footer>
  </main>;
}
