"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Analysis } from "@/lib/api";

export function AnalysisChart({ analysis, purpose }: { analysis: Analysis | null; purpose?: string }) {
  const chart = purpose ? analysis?.visualizations.find(item => item.purpose === purpose) : analysis?.visualization;
  if (!analysis || !chart?.data?.length) return <div className="chart-empty"><span>No chart yet</span><small>Run a question with a numeric measure to create a data-backed visualization.</small></div>;
  return <div className="chart-wrap" role="img" aria-label={`${chart.title}, generated from ${analysis.profile_summary.row_count.toLocaleString()} rows`}>
    <div className="chart-title-row"><div><strong>{chart.title}</strong><span>Computed from {analysis.profile_summary.row_count.toLocaleString()} rows</span></div><span className="chart-badge">Live result</span></div>
    <ResponsiveContainer width="100%" height="100%">
      {chart.kind === "line" ? <LineChart data={chart.data} margin={{ top: 16, right: 12, bottom: 6, left: 4 }}><CartesianGrid stroke="#e6edf5" vertical={false} /><XAxis dataKey={chart.x_key} tick={{ fill: "#798ba1", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} /><YAxis tick={{ fill: "#798ba1", fontSize: 11 }} axisLine={false} tickLine={false} width={58} tickFormatter={v => Number(v).toLocaleString(undefined, { notation: "compact" })} /><Tooltip formatter={v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} /><Legend wrapperStyle={{ fontSize: 11, color: "#526782" }} />{chart.series?.length ? chart.series.map((series, index) => <Line key={series} type="monotone" dataKey={series} name={series} stroke={["#14366f", "#ff6257", "#559cf1", "#98baf7", "#54bda0"][index % 5]} strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />) : <Line type="monotone" dataKey={chart.y_key} stroke="#1969d2" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: "#1768d2" }} />}</LineChart>
        : <BarChart data={chart.data} margin={{ top: 16, right: 12, bottom: 12, left: 4 }}><CartesianGrid stroke="#e6edf5" vertical={false} /><XAxis dataKey={chart.x_key} tick={{ fill: "#71839b", fontSize: 11 }} axisLine={false} tickLine={false} interval={0} /><YAxis tick={{ fill: "#798ba1", fontSize: 11 }} axisLine={false} tickLine={false} width={58} tickFormatter={v => Number(v).toLocaleString(undefined, { notation: "compact" })} /><Tooltip formatter={v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} /><Bar dataKey={chart.y_key} fill="#3888df" radius={[5, 5, 0, 0]} maxBarSize={56} /></BarChart>}
    </ResponsiveContainer>
  </div>;
}
