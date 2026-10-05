"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { Analysis } from "@/lib/api";

const PALETTE = ["#1969d2", "#ff6257", "#54bda0", "#98baf7", "#f59e0b", "#8b5cf6", "#ec4899"];

export function AnalysisChart({ analysis, purpose }: { analysis: Analysis | null; purpose?: string }) {
  const chart = purpose ? analysis?.visualizations.find(item => item.purpose === purpose) : analysis?.visualization;
  if (!analysis || !chart?.data?.length) {
    return (
      <div className="chart-empty">
        <span>No chart yet</span>
        <small>Run a question with a numeric measure or statistical view to create a data-backed visualization.</small>
      </div>
    );
  }

  // Render Scatter Chart for clustering / 2D projection
  if (chart.kind === "scatter") {
    // Group scatter points by cluster if category_key exists
    const clusters: Record<string, Record<string, unknown>[]> = {};
    for (const point of chart.data) {
      const cat = (point[chart.category_key || "cluster"] as string) || "Default";
      if (!clusters[cat]) clusters[cat] = [];
      clusters[cat].push(point);
    }

    return (
      <div className="chart-wrap" role="img" aria-label={chart.title}>
        <div className="chart-title-row">
          <div>
            <strong>{chart.title}</strong>
            <span>Computed from {analysis.profile_summary.row_count.toLocaleString()} rows</span>
          </div>
          <span className="chart-badge">Live PCA / KMeans</span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 16, bottom: 12, left: 4 }}>
            <CartesianGrid stroke="#e6edf5" />
            <XAxis dataKey={chart.x_key} name="PCA Dimension 1" tick={{ fill: "#798ba1", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis dataKey={chart.y_key} name="PCA Dimension 2" tick={{ fill: "#798ba1", fontSize: 11 }} axisLine={false} tickLine={false} width={45} />
            <ZAxis range={[30, 40]} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#526782" }} />
            {Object.entries(clusters).map(([name, data], idx) => (
              <Scatter key={name} name={name} data={data} fill={PALETTE[idx % PALETTE.length]} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Render Area Chart for forecasting with confidence intervals
  if (chart.kind === "area") {
    return (
      <div className="chart-wrap" role="img" aria-label={chart.title}>
        <div className="chart-title-row">
          <div>
            <strong>{chart.title}</strong>
            <span>Computed with 95% confidence intervals</span>
          </div>
          <span className="chart-badge">Projection</span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chart.data} margin={{ top: 16, right: 12, bottom: 6, left: 4 }}>
            <defs>
              <linearGradient id="colorBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#98baf7" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#98baf7" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e6edf5" vertical={false} />
            <XAxis dataKey={chart.x_key} tick={{ fill: "#798ba1", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={{ fill: "#798ba1", fontSize: 11 }} axisLine={false} tickLine={false} width={58} tickFormatter={v => Number(v).toLocaleString(undefined, { notation: "compact" })} />
            <Tooltip formatter={v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#526782" }} />
            <Area type="monotone" dataKey="upper_bound" name="Upper 95% CI" stroke="#559cf1" strokeDasharray="3 3" fill="url(#colorBand)" />
            <Area type="monotone" dataKey="lower_bound" name="Lower 95% CI" stroke="#559cf1" strokeDasharray="3 3" fill="#ffffff" />
            <Line type="monotone" dataKey={chart.y_key} name="Historical & Trend" stroke="#1969d2" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Render Line Chart
  if (chart.kind === "line") {
    return (
      <div className="chart-wrap" role="img" aria-label={chart.title}>
        <div className="chart-title-row">
          <div>
            <strong>{chart.title}</strong>
            <span>Computed from {analysis.profile_summary.row_count.toLocaleString()} rows</span>
          </div>
          <span className="chart-badge">Live result</span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart.data} margin={{ top: 16, right: 12, bottom: 6, left: 4 }}>
            <CartesianGrid stroke="#e6edf5" vertical={false} />
            <XAxis dataKey={chart.x_key} tick={{ fill: "#798ba1", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={{ fill: "#798ba1", fontSize: 11 }} axisLine={false} tickLine={false} width={58} tickFormatter={v => Number(v).toLocaleString(undefined, { notation: "compact" })} />
            <Tooltip formatter={v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#526782" }} />
            {chart.series?.length ? (
              chart.series.map((series, index) => (
                <Line
                  key={series}
                  type="monotone"
                  dataKey={series}
                  name={series}
                  stroke={PALETTE[index % PALETTE.length]}
                  strokeWidth={2.2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))
            ) : (
              <Line type="monotone" dataKey={chart.y_key} stroke="#1969d2" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: "#1768d2" }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Render Bar Chart (default)
  return (
    <div className="chart-wrap" role="img" aria-label={chart.title}>
      <div className="chart-title-row">
        <div>
          <strong>{chart.title}</strong>
          <span>Computed from {analysis.profile_summary.row_count.toLocaleString()} rows</span>
        </div>
        <span className="chart-badge">Live result</span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chart.data} margin={{ top: 16, right: 12, bottom: 12, left: 4 }}>
          <CartesianGrid stroke="#e6edf5" vertical={false} />
          <XAxis dataKey={chart.x_key} tick={{ fill: "#71839b", fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={{ fill: "#798ba1", fontSize: 11 }} axisLine={false} tickLine={false} width={58} tickFormatter={v => Number(v).toLocaleString(undefined, { notation: "compact" })} />
          <Tooltip formatter={v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} />
          <Bar dataKey={chart.y_key} fill="#3888df" radius={[5, 5, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
