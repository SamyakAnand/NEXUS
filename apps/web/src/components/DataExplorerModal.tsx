"use client";

import { useState, useEffect, useMemo } from "react";
import {
  FiArrowRight,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiCompass,
  FiDatabase,
  FiHelpCircle,
  FiLayers,
  FiPlay,
  FiSearch,
  FiTrendingUp,
  FiX,
  FiZap,
} from "react-icons/fi";
import { api, type Dataset, type DatasetPreview, type SuggestedQuestion } from "@/lib/api";

interface DataExplorerModalProps {
  dataset: Dataset;
  isOpen: boolean;
  onClose: () => void;
  onSelectQuestion: (question: string, autoRun?: boolean) => void;
}

export function DataExplorerModal({
  dataset,
  isOpen,
  onClose,
  onSelectQuestion,
}: DataExplorerModalProps) {
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"table" | "questions" | "columns">("table");
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 15;

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api
      .previewData(dataset.id, 100, 0)
      .then((res) => {
        setPreview(res);
      })
      .catch((err) => {
        console.error("Failed to load dataset preview:", err);
      })
      .finally(() => setLoading(false));
  }, [dataset.id, isOpen]);

  // Client-side search across preview rows
  const filteredRows = useMemo(() => {
    if (!preview?.rows) return [];
    if (!searchQuery.trim()) return preview.rows;
    const q = searchQuery.toLowerCase();
    return preview.rows.filter((row) =>
      Object.values(row).some((val) => val !== null && String(val).toLowerCase().includes(q))
    );
  }, [preview?.rows, searchQuery]);

  const totalPages = Math.ceil(filteredRows.length / pageSize);
  const paginatedRows = useMemo(() => {
    const start = currentPage * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  if (!isOpen) return null;

  const suggestions: SuggestedQuestion[] =
    preview?.suggested_questions && preview.suggested_questions.length > 0
      ? preview.suggested_questions
      : dataset.profile.suggested_questions || [];

  return (
    <div className="explorer-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="explorer-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="explorer-modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge">
              <FiDatabase size={18} />
            </div>
            <div>
              <h3>{dataset.name}</h3>
              <p>
                {dataset.profile.row_count.toLocaleString()} rows · {dataset.profile.column_count} fields ·{" "}
                {dataset.format.toUpperCase()}
              </p>
            </div>
          </div>

          <div className="modal-actions-wrap">
            <button
              type="button"
              className="autonomous-briefing-btn"
              onClick={() => {
                const q = suggestions[0]?.question || "Provide an executive summary of key performance trends and distributions";
                onSelectQuestion(q, true);
                onClose();
              }}
            >
              <FiZap size={15} />
              <span>Autonomous AI Briefing</span>
            </button>
            <button type="button" onClick={onClose} className="modal-close-btn" aria-label="Close dialog">
              <FiX size={18} />
            </button>
          </div>
        </div>

        {/* Suggested Questions Banner */}
        <div className="suggested-questions-shelf">
          <div className="shelf-headline">
            <FiCompass size={14} className="compass-icon" />
            <span>Smart Question Suggestions for this Dataset:</span>
            <small>Click any question to ask NEXUS immediately</small>
          </div>
          <div className="question-chips-carousel">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                className="question-chip-card"
                onClick={() => {
                  onSelectQuestion(s.question, true);
                  onClose();
                }}
              >
                <div className="chip-badge-row">
                  <span className={`chip-badge badge-${s.category || "general"}`}>{s.badge}</span>
                  <FiArrowRight size={13} className="chip-arrow" />
                </div>
                <strong className="chip-question">{s.question}</strong>
                <p className="chip-explanation">{s.explanation}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Selector & Filter Bar */}
        <div className="explorer-controls-bar">
          <div className="tab-pill-group">
            <button
              type="button"
              className={`tab-pill ${activeTab === "table" ? "active" : ""}`}
              onClick={() => setActiveTab("table")}
            >
              <FiLayers size={14} />
              <span>Raw Data Preview ({filteredRows.length})</span>
            </button>
            <button
              type="button"
              className={`tab-pill ${activeTab === "columns" ? "active" : ""}`}
              onClick={() => setActiveTab("columns")}
            >
              <FiDatabase size={14} />
              <span>Schema Fields ({dataset.profile.column_count})</span>
            </button>
            <button
              type="button"
              className={`tab-pill ${activeTab === "questions" ? "active" : ""}`}
              onClick={() => setActiveTab("questions")}
            >
              <FiHelpCircle size={14} />
              <span>All Suggested Analyses ({suggestions.length})</span>
            </button>
          </div>

          {activeTab === "table" && (
            <div className="table-search-box">
              <FiSearch size={14} className="search-icon" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(0);
                }}
                placeholder="Search cell values…"
                className="table-search-input"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} className="clear-search">
                  <FiX size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="explorer-modal-content">
          {loading ? (
            <div className="explorer-loading-state">
              <div className="loading-spinner" />
              <p>Extracting high-fidelity table preview &amp; schema metrics…</p>
            </div>
          ) : activeTab === "table" ? (
            <div className="table-view-wrapper">
              <div className="scrollable-table-container">
                <table className="nexus-data-table">
                  <thead>
                    <tr>
                      <th className="index-th">#</th>
                      {preview?.columns.map((col) => (
                        <th key={col.name}>
                          <div className="th-content">
                            <span className="th-name">{col.name}</span>
                            <span className={`th-badge type-${col.semantic_type}`}>{col.semantic_type}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.length === 0 ? (
                      <tr>
                        <td colSpan={(preview?.columns.length || 0) + 1} className="no-rows-cell">
                          No matching records found for "{searchQuery}".
                        </td>
                      </tr>
                    ) : (
                      paginatedRows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          <td className="index-td">{currentPage * pageSize + rIdx + 1}</td>
                          {preview?.columns.map((col) => {
                            const val = row[col.name];
                            return (
                              <td key={col.name} className="data-td">
                                {val === null || val === undefined ? (
                                  <span className="null-tag">null</span>
                                ) : typeof val === "number" ? (
                                  val.toLocaleString()
                                ) : (
                                  String(val)
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              <div className="table-pagination-footer">
                <span>
                  Showing {filteredRows.length > 0 ? currentPage * pageSize + 1 : 0}–
                  {Math.min((currentPage + 1) * pageSize, filteredRows.length)} of {filteredRows.length} sample rows
                </span>
                <div className="pagination-buttons">
                  <button
                    type="button"
                    disabled={currentPage === 0}
                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    className="page-btn"
                  >
                    <FiChevronLeft size={14} /> Previous
                  </button>
                  <span className="page-indicator">
                    {totalPages > 0 ? currentPage + 1 : 1} / {Math.max(1, totalPages)}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                    className="page-btn"
                  >
                    Next <FiChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === "columns" ? (
            <div className="columns-cards-grid">
              {dataset.profile.columns.map((col) => (
                <div key={col.name} className="column-stat-card">
                  <div className="card-top-row">
                    <span className="col-name">{col.name}</span>
                    <span className={`col-pill type-${col.semantic_type}`}>{col.semantic_type}</span>
                  </div>
                  <div className="col-metrics-grid">
                    <div>
                      <small>Unique Values</small>
                      <strong>{col.unique.toLocaleString()}</strong>
                    </div>
                    <div>
                      <small>Missing</small>
                      <strong>
                        {col.missing.toLocaleString()} ({col.missing_pct}%)
                      </strong>
                    </div>
                    <div>
                      <small>Data Type</small>
                      <strong>{col.dtype}</strong>
                    </div>
                  </div>
                  {col.top_values && (
                    <div className="col-top-values">
                      <small>Top Occurrences:</small>
                      <div className="values-tag-row">
                        {Object.entries(col.top_values).map(([k, v]) => (
                          <span key={k} className="value-tag">
                            {k}: {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {col.summary && (
                    <div className="col-summary-stats">
                      <small>Distribution Stats:</small>
                      <div className="stats-row">
                        <span>Min: {col.summary.min}</span>
                        <span>Mean: {col.summary.mean}</span>
                        <span>Max: {col.summary.max}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="all-questions-list">
              {suggestions.map((s, idx) => (
                <div key={idx} className="question-list-item">
                  <div className="item-icon-box">
                    <FiTrendingUp size={16} />
                  </div>
                  <div className="item-content">
                    <div className="item-header-row">
                      <span className={`chip-badge badge-${s.category || "general"}`}>{s.badge}</span>
                      <h4>{s.question}</h4>
                    </div>
                    <p>{s.explanation}</p>
                  </div>
                  <button
                    type="button"
                    className="run-question-btn"
                    onClick={() => {
                      onSelectQuestion(s.question, true);
                      onClose();
                    }}
                  >
                    <FiPlay size={13} />
                    <span>Run Analysis</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
