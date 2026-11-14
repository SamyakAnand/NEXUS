"""Single-provider Euri gateway client with deterministic fallback."""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()
load_dotenv(Path(__file__).resolve().parents[3] / ".env")

logger = logging.getLogger(__name__)
EURI_BASE_URL = "https://api.euron.one/api/v1/euri"
DEFAULT_EURI_MODEL = "gemini-2.5-flash"


def get_configured_provider() -> dict[str, Any]:
    """Return Euri configuration, or deterministic mode when no key is configured."""
    api_key = os.getenv("EURI_API_KEY", "").strip()
    if not api_key:
        return {
            "enabled": False,
            "provider": "deterministic_fallback",
            "model": "deterministic",
        }
    return {
        "enabled": True,
        "provider": "euri",
        "base_url": EURI_BASE_URL,
        "api_key": api_key,
        "model": os.getenv("EURI_MODEL", DEFAULT_EURI_MODEL).strip(),
    }


def call_llm(messages: list[dict[str, str]], json_mode: bool = False) -> tuple[str | None, int, float]:
    """Call Euri's OpenAI-compatible endpoint without exposing credentials in errors."""
    config = get_configured_provider()
    if not config["enabled"]:
        return None, 0, 0.0

    body: dict[str, Any] = {
        "model": config["model"],
        "messages": messages,
        "temperature": 0.2,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(
                f"{config['base_url']}/chat/completions",
                headers={
                    "Authorization": f"Bearer {config['api_key']}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            response.raise_for_status()
            data = response.json()
        content = data["choices"][0]["message"]["content"]
        tokens = int(data.get("usage", {}).get("total_tokens", 0))
        # Euri usage responses do not establish account-specific billing cost.
        return content, tokens, 0.0
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        logger.warning("Euri completion failed; deterministic analysis remains available.")
        return None, 0, 0.0


def plan_with_llm(question: str, schema_info: dict[str, Any]) -> dict[str, Any] | None:
    """Ask Euri for a candidate plan; callers must validate it against the dataset schema."""
    config = get_configured_provider()
    if not config["enabled"]:
        return None

    system_prompt = (
        "You are a data analyst planning deterministic tools for a user question. "
        "Only select columns present in the supplied schema. Return JSON with keys: "
        "tools (list), metric (column or null), group (column or null), "
        "analytical_intent (string). Do not calculate or invent results."
    )
    schema_summary = {
        "numeric_columns": schema_info.get("numeric_columns", []),
        "categorical_columns": schema_info.get("categorical_columns", []),
        "temporal_columns": schema_info.get("temporal_columns", []),
    }
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Question: {question}\nDataset schema: {json.dumps(schema_summary)}"},
    ]
    content, tokens, cost = call_llm(messages, json_mode=True)
    if not content:
        return None

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    if not isinstance(data, dict):
        return None
    data.update(tokens=tokens, cost=cost, model=config["model"])
    return data


def synthesize_with_llm(
    question: str,
    findings: list[dict[str, Any]],
    profile: dict[str, Any],
    stats_summary: dict[str, Any],
) -> tuple[str | None, int, float]:
    """Synthesize verified results; calculations remain outside the model."""
    if not get_configured_provider()["enabled"]:
        return None, 0, 0.0

    system_prompt = (
        "You are the NEXUS data analyst. Summarize only the verified findings and "
        "provided statistics. Do not add numbers or claims that are not present."
    )
    user_prompt = (
        f"Question: {question}\n"
        f"Verified findings: {json.dumps([item.get('detail', '') for item in findings])}\n"
        f"Profile: {json.dumps(profile)}\n"
        f"Calculated statistics: {json.dumps(stats_summary)}"
    )
    content, tokens, cost = call_llm(
        [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
    )
    return content.strip() if content else None, tokens, cost
