from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


def build_demo_dataset(seed: int = 42) -> pd.DataFrame:
    """Deterministic synthetic retail data with trends and planted shifts."""
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2024-01-01", "2025-06-30", freq="D")
    regions = ["North", "South", "East", "West"]
    products = [("Atlas", "Hardware"), ("Nova", "Software"), ("Pulse", "Services")]
    channels = ["Direct", "Partner", "Online"]
    rows: list[dict[str, object]] = []
    for day_idx, day in enumerate(dates):
        for region in regions:
            for product, category in products:
                baseline = 1600 + day_idx * 1.2 + (regions.index(region) * 110)
                seasonal = 180 * np.sin(2 * np.pi * day.dayofyear / 365.25)
                revenue = max(150, baseline + seasonal + rng.normal(0, 145))
                # A generated signal for discovery: North softens from Sep 2024.
                if region == "North" and day >= pd.Timestamp("2024-09-01"):
                    revenue *= 0.76
                discount = float(np.clip(rng.normal(0.11, 0.045), 0, 0.32))
                if region == "West" and product == "Atlas" and day >= pd.Timestamp("2025-02-01"):
                    discount = float(np.clip(rng.normal(0.28, 0.035), 0.15, 0.4))
                units = max(1, int(rng.poisson(18)))
                cost = revenue * float(np.clip(rng.normal(0.64, 0.07), 0.42, 0.9))
                rows.append({
                    "date": day.date().isoformat(),
                    "region": region,
                    "product": product,
                    "category": category,
                    "revenue": round(revenue, 2),
                    "cost": round(cost, 2),
                    "profit": round(revenue - cost, 2),
                    "units": units,
                    "customer": f"C-{rng.integers(1, 2501):05d}",
                    "channel": rng.choice(channels),
                    "inventory": max(0, int(rng.normal(120, 24))),
                    "discount": round(discount, 4),
                })
    return pd.DataFrame(rows)


def ensure_demo_file(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        build_demo_dataset().to_csv(path, index=False)
    return path
