# Cross-Source Schema Matching & Entity Resolution

When multiple sources are connected (e.g. Sales CSV + CRM API + Billing Database), NEXUS autonomously discovers how entities relate without requiring manual schema mapping.

---

## 1. Matching Algorithm

The `CrossSourceMatcher` applies a multi-stage heuristic pipeline:

### 1. Lexical & Synonym Clustering
Column names are normalized (`customer_id` -> `customerid`, `cust_id` -> `custid`) and matched against curated semantic synonym clusters:
- Customers: `[customer_id, cust_id, client_id, user_id, account_id]`
- Orders: `[order_id, transaction_id, invoice_id, sale_id]`
- Products: `[product_id, item_id, sku, product_code]`
- Timestamps: `[date, order_date, timestamp, created_at]`

Fuzzy string similarity (Gestalt Pattern Matching) is applied for unmatched identifiers with a threshold of `> 0.82`.

### 2. Value-Distribution Overlap
Candidate matching columns are tested against their actual distinct value sets. NEXUS computes the Jaccard overlap ratio between distinct keys:
$$\text{Overlap Ratio} = \frac{|A \cap B|}{\min(|A|, |B|)}$$
If the overlap ratio exceeds 5%, the candidate is confirmed as a join key.

### 3. Cardinality Inference
NEXUS inspects key uniqueness in each table:
- Both unique $\rightarrow$ **One-to-One (`1:1`)**
- Source A unique, Source B non-unique $\rightarrow$ **One-to-Many (`1:N`)**
- Source A non-unique, Source B unique $\rightarrow$ **Many-to-One (`N:1`)**
- Neither unique $\rightarrow$ **Many-to-Many (`N:M`)**

---

## 2. Fact vs. Dimension Auto-Classification

The `SemanticModelEngine` classifies each table:
- **Fact Table**: Contains multiple numeric measures, temporal timestamps, and transactional records ($> 500$ rows).
- **Dimension Table**: Contains a distinct primary key and descriptive categorical attributes.
- **Hybrid**: Balanced mix of transactional measures and descriptive attributes.
