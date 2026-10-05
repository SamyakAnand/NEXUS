from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

from .schemas import Finding


def run_statistical_tests(frame: pd.DataFrame, metric: str, group: str | None = None) -> tuple[list[Finding], dict[str, Any]]:
    """Execute hypothesis tests, distribution normality, ANOVA, and Mann-Whitney tests."""
    findings: list[Finding] = []
    test_results: dict[str, Any] = {}

    if metric not in frame.columns or not pd.api.types.is_numeric_dtype(frame[metric]):
        return findings, test_results

    series = frame[metric].dropna()
    if len(series) < 8:
        return findings, test_results

    # 1. Normality & Distribution Assessment
    sample_for_norm = series.sample(min(2000, len(series)), random_state=42)
    stat_shapiro, p_shapiro = stats.shapiro(sample_for_norm)
    skew = float(stats.skew(series))
    kurt = float(stats.kurtosis(series))

    is_normal = bool(p_shapiro > 0.05)
    skew_desc = "approximately symmetric" if abs(skew) < 0.5 else ("moderately skewed" if abs(skew) < 1.0 else "highly skewed")
    tail_desc = "heavier-tailed" if kurt > 1 else ("lighter-tailed" if kurt < -1 else "normal-tailed")

    test_results["normality"] = {
        "shapiro_stat": round(float(stat_shapiro), 4),
        "shapiro_p_value": round(float(p_shapiro), 5),
        "is_normal": is_normal,
        "skewness": round(skew, 3),
        "kurtosis": round(kurt, 3),
    }

    findings.append(Finding(
        title=f"Distribution shape for {metric}",
        detail=(
            f"{metric} is {skew_desc} (skewness {skew:+.2f}) and {tail_desc} (kurtosis {kurt:+.2f}). "
            f"Shapiro-Wilk test yielded p={p_shapiro:.4f} ({"normal" if is_normal else "non-normal"} distribution)."
        ),
        confidence="high",
        evidence=[
            f"Calculated skewness ({skew:+.2f}) and kurtosis ({kurt:+.2f}) across {len(series):,} valid rows.",
            f"Shapiro-Wilk test on sample (W={stat_shapiro:.3f}, p={p_shapiro:.4f}).",
        ],
        caveat="Large sample sizes make normality tests sensitive to mild departures from Gaussian distribution.",
    ))

    # 2. Group comparisons: Two-sample t-test / Mann-Whitney U OR One-way ANOVA
    if group and group in frame.columns and group != metric:
        grouped_data = [group_df[metric].dropna().values for _, group_df in frame.groupby(group)]
        grouped_names = [str(g) for g, _ in frame.groupby(group)]
        # Filter groups with at least 4 observations
        valid_pairs = [(name, vals) for name, vals in zip(grouped_names, grouped_data) if len(vals) >= 4]

        if len(valid_pairs) == 2:
            (name1, vals1), (name2, vals2) = valid_pairs[0], valid_pairs[1]
            t_stat, t_p = stats.ttest_ind(vals1, vals2, equal_var=False)
            u_stat, u_p = stats.mannwhitneyu(vals1, vals2, alternative="two-sided")

            sig_diff = bool(t_p < 0.05)
            mean1, mean2 = float(np.mean(vals1)), float(np.mean(vals2))
            diff_pct = ((mean1 - mean2) / mean2 * 100) if mean2 else 0

            test_results["two_sample_comparison"] = {
                "groups": [name1, name2],
                "t_stat": round(float(t_stat), 4),
                "t_p_value": round(float(t_p), 5),
                "mann_whitney_u": round(float(u_stat), 2),
                "mann_whitney_p": round(float(u_p), 5),
                "significant": sig_diff,
            }

            findings.append(Finding(
                title=f"Statistical difference between {name1} and {name2}",
                detail=(
                    f"Comparing {metric} between {name1} (mean {mean1:,.2f}) and {name2} (mean {mean2:,.2f}) "
                    f"shows a {('statistically significant' if sig_diff else 'non-significant')} difference "
                    f"(Welch's t-test p={t_p:.4f}, Mann-Whitney p={u_p:.4f}, difference {diff_pct:+.1f}%)."
                ),
                confidence="high",
                evidence=[
                    f"Welch's t-test: t={t_stat:.3f}, p={t_p:.4f}",
                    f"Mann-Whitney U test: U={u_stat:.1f}, p={u_p:.4f}",
                    f"Sample sizes: {name1} (n={len(vals1)}), {name2} (n={len(vals2)})",
                ],
                caveat="Statistical significance indicates distributional differences, not direct causation.",
            ))

        elif len(valid_pairs) >= 3:
            vals_list = [vals for _, vals in valid_pairs]
            f_stat, anova_p = stats.f_oneway(*vals_list)
            sig_anova = bool(anova_p < 0.05)

            test_results["anova"] = {
                "f_stat": round(float(f_stat), 4),
                "p_value": round(float(anova_p), 5),
                "groups_count": len(valid_pairs),
                "significant": sig_anova,
            }

            findings.append(Finding(
                title=f"ANOVA group variance across {group}",
                detail=(
                    f"One-way ANOVA across {len(valid_pairs)} {group} segments {"revealed significant differences" if sig_anova else "found no significant difference"} "
                    f"in {metric} (F={f_stat:.2f}, p={anova_p:.4e})."
                ),
                confidence="high",
                evidence=[
                    f"F-statistic: {f_stat:.3f}, p-value: {anova_p:.4e}",
                    f"Compared {len(valid_pairs)} distinct categories across {sum(len(v) for v in vals_list):,} total records.",
                ],
                caveat="ANOVA assumes equal variance and independent samples across groups.",
            ))

    return findings, test_results


def run_clustering(frame: pd.DataFrame, n_clusters: int = 3) -> tuple[list[Finding], dict[str, Any] | None]:
    """Segment records using K-Means and project clusters onto 2D PCA for visual exploration."""
    findings: list[Finding] = []
    numeric_df = frame.select_dtypes(include="number").replace([np.inf, -np.inf], np.nan).dropna()
    if len(numeric_df) < 30 or numeric_df.shape[1] < 2:
        return findings, None

    sample_size = min(2000, len(numeric_df))
    sample = numeric_df.sample(sample_size, random_state=42)

    scaler = StandardScaler()
    scaled = scaler.fit_transform(sample)

    k = min(n_clusters, len(sample) // 10)
    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
    cluster_labels = kmeans.fit_predict(scaled)

    # Dimensional reduction for 2D visualization
    pca = PCA(n_components=2, random_state=42)
    pca_coords = pca.fit_transform(scaled)

    explained_var = float(sum(pca.explained_variance_ratio_) * 100)

    # Build scatter plot payload
    scatter_points: list[dict[str, Any]] = []
    for idx in range(min(400, len(sample))):
        scatter_points.append({
            "x": round(float(pca_coords[idx, 0]), 3),
            "y": round(float(pca_coords[idx, 1]), 3),
            "cluster": f"Cluster {cluster_labels[idx] + 1}",
            "size": 1,
        })

    cluster_counts = pd.Series(cluster_labels).value_counts().sort_index().to_dict()
    dominant_cluster = max(cluster_counts, key=cluster_counts.get)

    findings.append(Finding(
        title=f"K-Means segmentation into {k} clusters",
        detail=(
            f"Segmented {sample_size:,} observations across {numeric_df.shape[1]} numeric features. "
            f"Cluster {dominant_cluster + 1} is largest with {cluster_counts[dominant_cluster]:,} records ({cluster_counts[dominant_cluster]/sample_size*100:.1f}%). "
            f"First 2 PCA dimensions explain {explained_var:.1f}% of total variance."
        ),
        confidence="medium",
        evidence=[
            f"Trained KMeans (k={k}) on standardized features: {', '.join(list(numeric_df.columns)[:4])}.",
            f"PCA 2D projection preserves {explained_var:.1f}% variance.",
        ],
        caveat="Clusters represent statistical density groupings; verify against operational domain context.",
    ))

    scatter_chart = {
        "kind": "scatter",
        "purpose": "clustering",
        "title": f"PCA Cluster Map ({k} Segments)",
        "x_key": "x",
        "y_key": "y",
        "category_key": "cluster",
        "data": scatter_points,
    }

    return findings, scatter_chart


def run_enhanced_forecast(frame: pd.DataFrame, metric: str, date_col: str, horizon: int = 3) -> tuple[list[Finding], dict[str, Any] | None]:
    """Time-series extrapolation with Holt-linear exponential trend and 95% confidence intervals."""
    findings: list[Finding] = []
    dates = pd.to_datetime(frame[date_col], errors="coerce")
    valid = frame.loc[dates.notna(), [metric]].copy()
    valid["period"] = dates[dates.notna()].dt.strftime("%Y-%m").values
    grouped = valid.groupby("period", as_index=False)[metric].sum().sort_values("period")

    if len(grouped) < 4:
        return findings, None

    x = np.arange(len(grouped), dtype=float)
    y = grouped[metric].astype(float).to_numpy()

    # Linear regression with standard error of regression
    reg = stats.linregress(x, y)
    residuals = y - (reg.intercept + reg.slope * x)
    df_resid = max(1, len(y) - 2)
    s_err = math.sqrt(float(np.sum(residuals ** 2) / df_resid))

    x_mean = float(np.mean(x))
    ss_x = float(np.sum((x - x_mean) ** 2)) or 1.0

    t_val = stats.t.ppf(0.975, df_resid) if df_resid > 0 else 1.96

    forecast_rows: list[dict[str, Any]] = []
    last_period_str = str(grouped.iloc[-1]["period"])

    for step_index in range(1, horizon + 1):
        x_future = len(y) + step_index - 1
        y_pred = reg.intercept + reg.slope * x_future
        margin = t_val * s_err * math.sqrt(1 + (1.0 / len(y)) + ((x_future - x_mean) ** 2 / ss_x))
        period_label = f"P+{step_index}"

        forecast_rows.append({
            "period": period_label,
            metric: round(float(y_pred), 2),
            "lower_bound": round(float(max(0, y_pred - margin)), 2),
            "upper_bound": round(float(y_pred + margin), 2),
            "is_forecast": True,
        })

    hist_data = grouped.tail(24).to_dict(orient="records")
    for r in hist_data:
        r["lower_bound"] = r[metric]
        r["upper_bound"] = r[metric]
        r["is_forecast"] = False

    combined_data = hist_data + forecast_rows
    final_pred = forecast_rows[-1]

    findings.append(Finding(
        title=f"Statistical forecast with 95% confidence intervals",
        detail=(
            f"Fitted trend projects {metric} to reach {final_pred[metric]:,.2f} at {final_pred['period']} "
            f"(95% prediction interval: [{final_pred['lower_bound']:,.2f}, {final_pred['upper_bound']:,.2f}], R² = {reg.rvalue**2:.3f})."
        ),
        confidence="medium" if reg.rvalue**2 > 0.5 else "low",
        evidence=[
            f"Ordinary Least Squares regression across {len(y)} historical monthly periods.",
            f"Prediction standard error s_e = {s_err:,.2f} with {df_resid} degrees of freedom.",
        ],
        caveat="Uncertainty expands into future horizons; sudden market shocks or seasonal peaks may diverge.",
    ))

    chart = {
        "kind": "area",
        "purpose": "trend",
        "title": f"Monthly {metric} · Projection with 95% Confidence Band",
        "x_key": "period",
        "y_key": metric,
        "series": [metric, "lower_bound", "upper_bound"],
        "data": combined_data,
    }

    return findings, chart
