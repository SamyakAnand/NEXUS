"""Semantic Modeling, Cross-Source Entity Matching & Lineage Engine for NEXUS.

Transforms disparate data sources (files, APIs, databases) into a cohesive
analytical layer with:
- Fuzzy entity identification & schema matching
- Automatic Fact vs. Dimension classification
- Federated join candidate inference
- Data conflict detection & reconciliation
- End-to-end lineage DAG tracking
"""

from __future__ import annotations

import difflib
import re
import uuid
from typing import Any, Dict, List, Literal, Optional, Set, Tuple

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field


class InferredJoin(BaseModel):
    source_a_id: str
    source_a_column: str
    source_b_id: str
    source_b_column: str
    relationship_type: Literal["one-to-one", "one-to-many", "many-to-one", "many-to-many"]
    confidence: float
    overlap_ratio: float
    sample_matching_keys: List[Any] = Field(default_factory=list)


class TableClassification(BaseModel):
    dataset_id: str
    dataset_name: str
    classification: Literal["fact", "dimension", "hybrid"]
    primary_keys: List[str]
    measures: List[str]
    attributes: List[str]
    temporal_keys: List[str]
    rationale: str


class ConflictDiscrepancy(BaseModel):
    entity_key: str
    column: str
    source_a_val: Any
    source_b_val: Any
    resolution_applied: str


class LineageNode(BaseModel):
    id: str
    type: Literal["source", "connector", "dataset", "cleaning", "model", "analysis", "visualization"]
    label: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class LineageEdge(BaseModel):
    source: str
    target: str
    label: Optional[str] = None


class LineageGraph(BaseModel):
    nodes: List[LineageNode]
    edges: List[LineageEdge]


COMMON_ID_PATTERNS = [
    re.compile(r"^(.*_)?id$", re.IGNORECASE),
    re.compile(r"^(.*_)?key$", re.IGNORECASE),
    re.compile(r"^(.*_)?code$", re.IGNORECASE),
    re.compile(r"^(.*_)?num(ber)?$", re.IGNORECASE),
    re.compile(r"^(.*_)?sku$", re.IGNORECASE),
]

SYNONYM_CLUSTERS = [
    {"cust_id", "customer_id", "client_id", "customer", "user_id", "account_id"},
    {"order_id", "transaction_id", "order_num", "invoice_id", "sale_id"},
    {"product_id", "item_id", "sku", "product_code", "part_number"},
    {"store_id", "location_id", "branch_id", "warehouse_id", "site_id"},
    {"employee_id", "staff_id", "rep_id", "agent_id"},
    {"date", "order_date", "timestamp", "created_at", "transaction_date"},
    {"email", "user_email", "customer_email", "mail"},
    {"phone", "phone_number", "mobile", "contact_number"},
]


class CrossSourceMatcher:
    """Finds cross-source join relationships between disparate tables."""

    @staticmethod
    def _normalize_name(name: str) -> str:
        return re.sub(r"[^a-z0-9]", "", name.lower())

    @classmethod
    def _are_synonyms(cls, name_a: str, name_b: str) -> bool:
        norm_a = cls._normalize_name(name_a)
        norm_b = cls._normalize_name(name_b)
        if norm_a == norm_b:
            return True

        for cluster in SYNONYM_CLUSTERS:
            cluster_norms = {cls._normalize_name(x) for x in cluster}
            if norm_a in cluster_norms and norm_b in cluster_norms:
                return True

        similarity = difflib.SequenceMatcher(None, norm_a, norm_b).ratio()
        return similarity > 0.82

    @classmethod
    def find_relationships(
        cls,
        datasets: Dict[str, pd.DataFrame],
        dataset_meta: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> List[InferredJoin]:
        inferred: List[InferredJoin] = []
        dataset_ids = list(datasets.keys())

        for i in range(len(dataset_ids)):
            for j in range(i + 1, len(dataset_ids)):
                id_a = dataset_ids[i]
                id_b = dataset_ids[j]
                df_a = datasets[id_a]
                df_b = datasets[id_b]

                for col_a in df_a.columns:
                    for col_b in df_b.columns:
                        is_match = cls._are_synonyms(col_a, col_b)
                        if not is_match:
                            continue

                        # Inspect values for actual overlap
                        series_a = df_a[col_a].dropna().astype(str).unique()
                        series_b = df_b[col_b].dropna().astype(str).unique()

                        if len(series_a) == 0 or len(series_b) == 0:
                            continue

                        set_a = set(series_a[:1000])
                        set_b = set(series_b[:1000])
                        intersection = set_a.intersection(set_b)
                        overlap_ratio = len(intersection) / max(min(len(set_a), len(set_b)), 1)

                        if overlap_ratio < 0.05 and not (cls._normalize_name(col_a) == cls._normalize_name(col_b)):
                            continue

                        # Determine cardinality
                        is_unique_a = df_a[col_a].nunique() == len(df_a)
                        is_unique_b = df_b[col_b].nunique() == len(df_b)

                        if is_unique_a and is_unique_b:
                            rel = "one-to-one"
                        elif is_unique_a and not is_unique_b:
                            rel = "one-to-many"
                        elif not is_unique_a and is_unique_b:
                            rel = "many-to-one"
                        else:
                            rel = "many-to-many"

                        confidence = round(0.5 + (0.5 * overlap_ratio), 2)
                        inferred.append(
                            InferredJoin(
                                source_a_id=id_a,
                                source_a_column=col_a,
                                source_b_id=id_b,
                                source_b_column=col_b,
                                relationship_type=rel,
                                confidence=confidence,
                                overlap_ratio=round(overlap_ratio, 3),
                                sample_matching_keys=list(intersection)[:5],
                            )
                        )

        # Sort by confidence descending
        inferred.sort(key=lambda x: x.confidence, reverse=True)
        return inferred


class SemanticModelEngine:
    """Classifies tables into Fact / Dimension entities and manages federated joins."""

    @staticmethod
    def classify_dataset(dataset_id: str, name: str, df: pd.DataFrame) -> TableClassification:
        total_rows = len(df)
        measures: List[str] = []
        attributes: List[str] = []
        temporal_keys: List[str] = []
        primary_keys: List[str] = []

        for col in df.columns:
            series = df[col]
            dtype_str = str(series.dtype)

            # Check temporal
            if "date" in col.lower() or "time" in col.lower() or pd.api.types.is_datetime64_any_dtype(series):
                temporal_keys.append(col)
                continue

            # Check primary key candidates
            if total_rows > 0 and series.nunique() == total_rows and any(p.search(col) for p in COMMON_ID_PATTERNS):
                primary_keys.append(col)
                continue

            # Numeric measures vs categorical attributes
            if pd.api.types.is_numeric_dtype(series):
                # If high distinct ratio and integer, might be an ID
                if any(p.search(col) for p in COMMON_ID_PATTERNS):
                    attributes.append(col)
                else:
                    measures.append(col)
            else:
                attributes.append(col)

        # Classification heuristics
        if len(measures) >= 2 and (len(temporal_keys) >= 1 or total_rows > 500):
            classification = "fact"
            rationale = f"Contains {len(measures)} numeric measure metrics, temporal timestamp fields, and transactional records."
        elif len(primary_keys) >= 1 and len(measures) <= 1:
            classification = "dimension"
            rationale = f"Contains primary key '{primary_keys[0]}' with {len(attributes)} descriptive dimensional attributes."
        else:
            classification = "hybrid"
            rationale = "Contains balanced mix of transactional measures and descriptive attributes."

        return TableClassification(
            dataset_id=dataset_id,
            dataset_name=name,
            classification=classification,
            primary_keys=primary_keys,
            measures=measures,
            attributes=attributes,
            temporal_keys=temporal_keys,
            rationale=rationale,
        )

    @classmethod
    def federated_join(
        cls,
        df_left: pd.DataFrame,
        left_key: str,
        df_right: pd.DataFrame,
        right_key: str,
        how: Literal["inner", "left", "right", "outer"] = "inner",
        prefix_right: str = "",
    ) -> pd.DataFrame:
        """Executes a clean, type-normalized cross-source join."""
        left = df_left.copy()
        right = df_right.copy()

        # Coerce join keys to string representation to bridge type disparities between sources
        left["_join_key"] = left[left_key].astype(str).str.strip()
        right["_join_key"] = right[right_key].astype(str).str.strip()

        if prefix_right:
            right = right.rename(columns={c: f"{prefix_right}_{c}" for c in right.columns if c != "_join_key"})

        joined = pd.merge(left, right, on="_join_key", how=how)
        joined.drop(columns=["_join_key"], inplace=True, errors="ignore")
        return joined


class ConflictResolver:
    """Discovers and reconciles conflicting records between multiple sources."""

    @classmethod
    def detect_conflicts(
        cls,
        df_a: pd.DataFrame,
        df_b: pd.DataFrame,
        join_key: str,
        compare_columns: Optional[List[str]] = None,
        max_discrepancies: int = 50,
    ) -> List[ConflictDiscrepancy]:
        discrepancies: List[ConflictDiscrepancy] = []

        if join_key not in df_a.columns or join_key not in df_b.columns:
            return discrepancies

        common_cols = compare_columns or [c for c in df_a.columns if c in df_b.columns and c != join_key]

        df_a_keyed = df_a.dropna(subset=[join_key]).set_index(join_key)
        df_b_keyed = df_b.dropna(subset=[join_key]).set_index(join_key)

        common_keys = df_a_keyed.index.intersection(df_b_keyed.index)

        for key in common_keys[:500]:
            row_a = df_a_keyed.loc[key]
            row_b = df_b_keyed.loc[key]

            # In case of duplicates in one table, take first
            if isinstance(row_a, pd.DataFrame):
                row_a = row_a.iloc[0]
            if isinstance(row_b, pd.DataFrame):
                row_b = row_b.iloc[0]

            for col in common_cols:
                val_a = row_a[col]
                val_b = row_b[col]

                if pd.isna(val_a) and pd.isna(val_b):
                    continue

                if str(val_a).strip() != str(val_b).strip():
                    discrepancies.append(
                        ConflictDiscrepancy(
                            entity_key=str(key),
                            column=col,
                            source_a_val=val_a if not pd.isna(val_a) else None,
                            source_b_val=val_b if not pd.isna(val_b) else None,
                            resolution_applied="source_a_priority",
                        )
                    )
                    if len(discrepancies) >= max_discrepancies:
                        return discrepancies

        return discrepancies


class LineageTracker:
    """Constructs an auditable DAG tracing data from raw sources to analytical results."""

    @staticmethod
    def build_lineage(
        datasets: Dict[str, Any],
        runs: Dict[str, Any],
        active_joins: Optional[List[InferredJoin]] = None,
    ) -> LineageGraph:
        nodes: List[LineageNode] = []
        edges: List[LineageEdge] = []
        seen_nodes: Set[str] = set()

        for d_id, d_data in datasets.items():
            source_type = d_data.get("format", "csv").upper()
            src_node_id = f"src_{d_id}"

            # Connector Node
            if src_node_id not in seen_nodes:
                nodes.append(
                    LineageNode(
                        id=src_node_id,
                        type="source",
                        label=f"{source_type} Source",
                        metadata={"filename": d_data.get("filename", d_id)},
                    )
                )
                seen_nodes.add(src_node_id)

            # Dataset Table Node
            ds_node_id = f"ds_{d_id}"
            if ds_node_id not in seen_nodes:
                nodes.append(
                    LineageNode(
                        id=ds_node_id,
                        type="dataset",
                        label=d_data.get("name", d_id),
                        metadata={
                            "rows": d_data.get("profile", {}).get("row_count", 0),
                            "cols": d_data.get("profile", {}).get("column_count", 0),
                        },
                    )
                )
                edges.append(LineageEdge(source=src_node_id, target=ds_node_id, label="ingest & profile"))
                seen_nodes.add(ds_node_id)

            # Derived / Cleaning step
            if d_data.get("derived_from"):
                parent_id = f"ds_{d_data['derived_from']}"
                clean_node_id = f"clean_{d_id}"
                if clean_node_id not in seen_nodes:
                    nodes.append(
                        LineageNode(
                            id=clean_node_id,
                            type="cleaning",
                            label="Data Cleaning Engine",
                            metadata={"operations": d_data.get("transformations", [])},
                        )
                    )
                    seen_nodes.add(clean_node_id)
                    edges.append(LineageEdge(source=parent_id, target=clean_node_id, label="clean"))
                    edges.append(LineageEdge(source=clean_node_id, target=ds_node_id, label="normalized output"))

        # Add active joins / semantic model nodes
        if active_joins:
            for idx, j in enumerate(active_joins):
                join_node_id = f"join_{idx}"
                nodes.append(
                    LineageNode(
                        id=join_node_id,
                        type="model",
                        label=f"Semantic Join ({j.relationship_type})",
                        metadata={"key_left": j.source_a_column, "key_right": j.source_b_column, "conf": j.confidence},
                    )
                )
                edges.append(LineageEdge(source=f"ds_{j.source_a_id}", target=join_node_id, label=j.source_a_column))
                edges.append(LineageEdge(source=f"ds_{j.source_b_id}", target=join_node_id, label=j.source_b_column))

        # Add analysis runs
        for r_id, r_data in list(runs.items())[-5:]:
            run_node_id = f"run_{r_id[:8]}"
            ds_target = f"ds_{r_data.get('dataset_id', '')}"
            nodes.append(
                LineageNode(
                    id=run_node_id,
                    type="analysis",
                    label=f"Q: {r_data.get('question', '')[:32]}…",
                    metadata={"tools": r_data.get("tools", []), "passed": r_data.get("validation", {}).get("passed", True)},
                )
            )
            edges.append(LineageEdge(source=ds_target, target=run_node_id, label="autonomous analysis"))

        return LineageGraph(nodes=nodes, edges=edges)
