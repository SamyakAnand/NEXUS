"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown, ArrowRight, ArrowUpRight, BracketsCurly, ChartLine, CheckCircle,
  CircleNotch, Database, Eye, FileText, Graph, ImageSquare, MagnifyingGlass,
  ShieldCheck, Sparkle, Table, WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api, type Analysis, type Dataset } from "@/lib/api";

const InsightCore = dynamic(() => import("@/components/InsightCore").then(module => module.InsightCore), {
  ssr: false,
  loading: () => <div className="argus-core-loading"><span /><span /><span />Loading the product map…</div>,
});

const capabilities = [
  { icon: Database, title: "Structured data analysis", status: "Available", tone: "ready", detail: "Profile CSV, XLSX, and JSON datasets, then run deterministic analysis over their fields." },
  { icon: ShieldCheck, title: "Evidence-led findings", status: "Available", tone: "ready", detail: "Review computed findings, data quality caveats, and the analysis steps that produced them." },
  { icon: Table, title: "Table understanding", status: "Dataset prototype", tone: "partial", detail: "Tabular uploads are supported. Extracting tables from arbitrary PDFs or images is not implemented." },
  { icon: MagnifyingGlass, title: "Hybrid knowledge retrieval", status: "Not implemented", tone: "future", detail: "Semantic embeddings, BM25, rank fusion, and document-grounded answers are not available yet." },
  { icon: Graph, title: "Knowledge graph", status: "Lineage prototype", tone: "partial", detail: "The workspace can visualize local source and analysis lineage; document entity extraction is not implemented." },
  { icon: ChartLine, title: "Evaluation lab", status: "Fixture suite", tone: "partial", detail: "Current evaluations measure deterministic tool routing and small metadata fixtures, not RAG quality." },
];

const flow = [
  { n: "01", title: "Bring in data", detail: "Upload a supported dataset." },
  { n: "02", title: "Ask a question", detail: "Frame the analysis you need." },
  { n: "03", title: "Compute a result", detail: "Deterministic tools inspect the data." },
  { n: "04", title: "Review evidence", detail: "Inspect findings, caveats, and trace." },
];

export function Landing() {
  const reduceMotion = useReducedMotion();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [apiState, setApiState] = useState<"checking" | "available" | "unavailable">("checking");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [activeCapability, setActiveCapability] = useState(0);

  useEffect(() => {
    let current = true;
    api.dataset("demo-sales").then(value => {
      if (!current) return;
      setDataset(value); setApiState("available");
    }).catch(() => { if (current) setApiState("unavailable"); });
    return () => { current = false; };
  }, []);

  const runSample = async () => {
    setRunning(true); setError(""); setAnalysis(null);
    try {
      const sample = dataset ?? await api.dataset("demo-sales");
      setDataset(sample);
      const result = await api.analyze(sample.id, "Which regions had the highest and lowest total revenue?");
      setAnalysis(result); setApiState("available");
    } catch (cause) {
      setApiState("unavailable");
      setError(cause instanceof Error ? cause.message : "The sample analysis could not be completed.");
    } finally { setRunning(false); }
  };

  const Reveal = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <motion.div
    className={className}
    initial={reduceMotion ? false : { opacity: 0, y: 18 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.15 }}
    transition={{ duration: reduceMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
  >{children}</motion.div>;

  return <main className="argus-landing">
    <header className="argus-landing-header">
      <Link className="argus-public-brand" href="/" aria-label="ARGUS AI home"><span><Eye size={20} weight="duotone" /></span><strong>ARGUS</strong><small>AI</small></Link>
      <nav aria-label="Landing navigation"><a href="#capabilities">Platform</a><a href="#how-it-works">How it works</a><a href="#workspace-preview">Workspace</a></nav>
      <Link className="argus-header-link" href="/overview">Open platform <ArrowUpRight size={15} /></Link>
    </header>

    <section className="argus-hero">
      <div className="argus-hero-copy">
        <div className="argus-overline"><span />MULTIMODAL KNOWLEDGE INTELLIGENCE</div>
        <h1>Your data has answers.<br /><em>ARGUS finds the evidence.</em></h1>
        <p>Turn complex information into intelligence you can inspect. Start with the data-analysis workspace today; expand toward multimodal retrieval with evidence at its core.</p>
        <div className="argus-hero-actions"><Link className="argus-button-primary" href="/workspace">Explore intelligence <ArrowRight size={16} /></Link><a className="argus-button-quiet" href="#how-it-works">See how it works <ArrowDown size={15} /></a></div>
        <div className="argus-hero-status"><span className={`argus-api-state ${apiState}`}><i />{apiState === "available" ? "Local analysis API connected" : apiState === "unavailable" ? "Local analysis API unavailable" : "Checking local API"}</span><span>Prototype · no authentication</span></div>
      </div>
      <div className="argus-hero-scene-wrap"><InsightCore /><div className="argus-scene-index">A / 01 <span>OBSERVE · CONNECT · VERIFY</span></div></div>
      <span className="argus-hero-watermark" aria-hidden="true">A</span>
    </section>

    <div className="argus-signal-line"><span>ARGUS AI</span><i />SEE BEYOND DATA. DISCOVER THE TRUTH.<i /><span>BUILT AROUND TRACEABLE WORK</span></div>

    <section className="argus-section argus-flow-section" id="how-it-works">
      <Reveal className="argus-section-intro"><div><span className="argus-eyebrow">FROM INPUT TO INSIGHT</span><h2>Intelligence should<br />show its work.</h2></div><p>The current workspace turns supported tabular data into measured, reviewable analysis. The product direction extends that discipline to documents, images, and enterprise knowledge.</p></Reveal>
      <div className="argus-flow-grid">{flow.map((step, index) => <Reveal className={`argus-flow-card ${index === 3 ? "highlight" : ""}`} key={step.n}><span>{step.n}</span><strong>{step.title}</strong><p>{step.detail}</p>{index < flow.length - 1 && <ArrowRight size={15} />}</Reveal>)}</div>
    </section>

    <section className="argus-capabilities-section" id="capabilities">
      <div className="argus-section argus-capabilities-inner">
        <Reveal className="argus-section-intro"><div><span className="argus-eyebrow">A SYSTEM, NOT A CHAT WINDOW</span><h2>Every connection<br />has a source.</h2></div><p>Explore what ARGUS does today and what remains a design target. Availability labels reflect this local prototype, not a production deployment.</p></Reveal>
        <div className="argus-capability-layout">
          <div className="argus-capability-list" role="tablist" aria-label="ARGUS capability details">{capabilities.map(({ icon: Icon, title, status, tone }, index) => <button type="button" role="tab" aria-selected={activeCapability === index} className={activeCapability === index ? "active" : ""} key={title} onClick={() => setActiveCapability(index)}><span className="argus-cap-icon"><Icon size={18} /></span><span><strong>{title}</strong><small className={`argus-feature-status ${tone}`}>{status}</small></span><ArrowRight size={15} /></button>)}</div>
          <Reveal className="argus-capability-detail"><span className="argus-detail-icon">{(() => { const Icon = capabilities[activeCapability].icon; return <Icon size={22} />; })()}</span><span className={`argus-feature-status ${capabilities[activeCapability].tone}`}>{capabilities[activeCapability].status}</span><h3>{capabilities[activeCapability].title}</h3><p>{capabilities[activeCapability].detail}</p><Link href={activeCapability < 2 ? "/workspace" : activeCapability === 4 ? "/graph" : "/evaluation"}>Explore current experience <ArrowRight size={14} /></Link></Reveal>
        </div>
      </div>
    </section>

    <section className="argus-section argus-demo-section" id="workspace-preview">
      <Reveal className="argus-section-intro"><div><span className="argus-eyebrow">A WORKING PRODUCT PREVIEW</span><h2>Run a fresh analysis.<br />Inspect what it used.</h2></div><p>This sample uses the included synthetic retail dataset. The answer only appears after the API returns a new analysis.</p></Reveal>
      <div className="argus-demo-layout">
        <article className="argus-demo-card"><div className="argus-card-topline"><span><Sparkle size={14} /> SYNTHETIC DATASET</span><span className={`argus-demo-pill ${analysis ? "ready" : ""}`}><i />{analysis ? "Fresh result" : apiState === "unavailable" ? "API unavailable" : "Ready to run"}</span></div><small className="argus-demo-label">SAMPLE QUESTION</small><h3>Which regions had the highest and lowest total revenue?</h3>{analysis ? <div className="argus-demo-result"><span>RUN {analysis.run_id.slice(0, 8)} · {analysis.latency_ms.toFixed(1)} MS MEASURED</span><strong>{analysis.findings[0]?.title ?? "Analysis complete"}</strong><p>{analysis.answer}</p><div><CheckCircle size={14} />{analysis.validation.passed ? "Evidence check passed" : "Review needed"} · {analysis.profile_summary.row_count.toLocaleString()} rows</div></div> : <div className={`argus-demo-empty ${error ? "has-error" : ""}`}>{running ? <CircleNotch className="spin" size={17} /> : error ? <WarningCircle size={17} /> : <Database size={17} />}<span>{error || (running ? "Calculating a fresh result…" : "No saved result is shown here. Run the sample to request a new one.")}</span></div>}<button className="argus-button-primary" type="button" onClick={() => void runSample()} disabled={running || apiState === "unavailable"}>{running ? "Running…" : analysis ? "Run again" : "Run sample analysis"}<ArrowRight size={15} /></button></article>
        <div className="argus-demo-workspace" aria-label="Preview of the actual analysis workspace"><div className="argus-preview-chrome"><span /><span /><span /><small>ARGUS / KNOWLEDGE WORKSPACE</small></div><div className="argus-preview-grid"><div className="argus-preview-side"><span>DATASETS</span><strong><Database size={13} />{dataset?.name ?? (apiState === "unavailable" ? "No API connection" : "Loading sample…")}</strong><i /><i /><i /></div><div className="argus-preview-main"><div><span>ANALYSIS</span><small>{dataset ? `${dataset.profile.row_count.toLocaleString()} rows · ${dataset.profile.column_count} fields` : "Live profile unavailable"}</small></div><div className="argus-preview-question"><MagnifyingGlass size={13} />Ask a question about this dataset</div><div className="argus-preview-bars"><i /><i /><i /><i /><i /><i /><i /><i /></div><div className="argus-preview-evidence"><ShieldCheck size={14} /><span>Findings, source fields, and run trace</span></div></div></div><div className="argus-preview-foot"><span>WORKSPACE PREVIEW</span><small>Actual analysis UI opens from the button.</small></div></div>
      </div>
    </section>

    <section className="argus-closing"><div><span className="argus-eyebrow">THE ARGUS PRINCIPLE</span><h2>Do more than find information.<br /><em>Reveal the evidence behind it.</em></h2><p>Start with the working knowledge workspace and inspect the current prototype’s boundaries.</p><Link className="argus-button-primary" href="/overview">Enter ARGUS AI <ArrowRight size={16} /></Link></div><div className="argus-closing-mark"><Eye size={86} weight="thin" /><span>OBSERVE<br />TRACE<br />VERIFY</span></div></section>

    <footer className="argus-footer"><Link className="argus-public-brand" href="/"><span><Eye size={18} weight="duotone" /></span><strong>ARGUS</strong><small>AI</small></Link><p>Enterprise Multimodal Knowledge Intelligence Platform<br /><span>Current build: local analytics prototype</span></p><Link href="/settings">System status <ArrowUpRight size={14} /></Link></footer>
  </main>;
}
