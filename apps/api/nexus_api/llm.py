"""Multi-provider LLM interface supporting Free-tier APIs, Ollama, and deterministic fallback.

Supported providers:
- Groq (Free high-speed Llama-3.3-70B via GROQ_API_KEY)
- Google Gemini (Free tier Gemini-1.5/2.0-Flash via GEMINI_API_KEY)
- Ollama (Free local models like llama3, mistral, deepseek-r1 at localhost:11434)
- OpenRouter / HuggingFace (Free tier models)
- OpenAI & Anthropic (when keys provided)
- Deterministic Fallback (zero-cost, zero-network statistical heuristic planner)
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
import httpx

load_dotenv()
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

COST_PER_1K_TOKENS = {
    "llama-3.3-70b-versatile": 0.0,
    "llama-3.1-8b-instant": 0.0,
    "gemini-1.5-flash": 0.0001,
    "gemini-2.0-flash": 0.0001,
    "gpt-4o-mini": 0.0003,
    "gpt-4o": 0.005,
    "claude-3-5-sonnet": 0.003,
    "claude-3-haiku": 0.00025,
    "ollama": 0.0,
    "deterministic": 0.0,
}


def get_configured_provider() -> dict[str, Any]:
    """Detect available LLM provider with priority on free-tier high-performance APIs."""
    # 1. Groq (Free high-speed inference)
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if groq_key:
        return {
            "enabled": True,
            "provider": "groq",
            "base_url": "https://api.groq.com/openai/v1",
            "api_key": groq_key,
            "model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        }

    # 2. Google Gemini (Generous free tier)
    gemini_key = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", "")).strip()
    if gemini_key:
        return {
            "enabled": True,
            "provider": "gemini",
            "api_key": gemini_key,
            "model": os.getenv("GEMINI_MODEL", "gemini-1.5-flash"),
        }

    # 3. Local Ollama (Completely free, 100% private)
    ollama_url = os.getenv("OLLAMA_BASE_URL", "").strip()
    if ollama_url:
        return {
            "enabled": True,
            "provider": "openai_compatible",
            "base_url": f"{ollama_url.rstrip('/')}/v1",
            "api_key": "ollama",
            "model": os.getenv("OLLAMA_MODEL", "llama3"),
        }

    # 4. Standard OpenAI
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    openai_base_url = os.getenv("OPENAI_BASE_URL", "").rstrip("/")
    if openai_key or (openai_base_url and "localhost" in openai_base_url):
        return {
            "enabled": True,
            "provider": "openai_compatible",
            "base_url": openai_base_url or "https://api.openai.com/v1",
            "api_key": openai_key or "local",
            "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        }

    # 5. NVIDIA NIM / Integrate API
    nvidia_key = os.getenv("NVIDIA_API_KEY", "").strip()
    if nvidia_key:
        return {
            "enabled": True,
            "provider": "openai_compatible",
            "base_url": os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
            "api_key": nvidia_key,
            "model": os.getenv("NVIDIA_MODEL", "meta/llama-3.3-70b-instruct"),
        }

    # 6. Anthropic
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if anthropic_key:
        return {
            "enabled": True,
            "provider": "anthropic",
            "api_key": anthropic_key,
            "model": os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"),
        }

    # 7. High-Precision Deterministic Engine Fallback
    return {
        "enabled": False,
        "provider": "deterministic_fallback",
        "model": "deterministic",
    }


def call_llm(messages: list[dict[str, str]], json_mode: bool = False) -> tuple[str | None, int, float]:
    """Execute LLM call against configured provider with timeout and error protection."""
    config = get_configured_provider()
    if not config.get("enabled"):
        return None, 0, 0.0

    provider = config["provider"]
    model = config["model"]

    try:
        if provider in ("openai_compatible", "groq"):
            url = f"{config['base_url']}/chat/completions"
            headers = {
                "Authorization": f"Bearer {config['api_key']}",
                "Content-Type": "application/json",
            }
            body: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": 0.2,
            }
            if json_mode:
                body["response_format"] = {"type": "json_object"}

            with httpx.Client(timeout=15.0) as client:
                res = client.post(url, headers=headers, json=body)
                res.raise_for_status()
                data = res.json()
                content = data["choices"][0]["message"]["content"]
                usage = data.get("usage", {})
                tokens = usage.get("total_tokens", 0)
                rate = COST_PER_1K_TOKENS.get(model, 0.0001)
                cost = round((tokens / 1000.0) * rate, 6)
                return content, tokens, cost

        elif provider == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={config['api_key']}"
            contents = [
                {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]}
                for m in messages
            ]
            body = {
                "contents": contents,
                "generationConfig": {
                    "temperature": 0.2,
                    **({"response_mime_type": "application/json"} if json_mode else {}),
                },
            }
            with httpx.Client(timeout=15.0) as client:
                res = client.post(url, json=body)
                res.raise_for_status()
                data = res.json()
                candidates = data.get("candidates", [])
                if candidates:
                    text = candidates[0]["content"]["parts"][0]["text"]
                    tokens = data.get("usageMetadata", {}).get("totalTokenCount", 0)
                    rate = COST_PER_1K_TOKENS.get(model, 0.0001)
                    cost = round((tokens / 1000.0) * rate, 6)
                    return text, tokens, cost

        elif provider == "anthropic":
            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "x-api-key": config["api_key"],
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            }
            system = next((m["content"] for m in messages if m["role"] == "system"), None)
            user_msgs = [m for m in messages if m["role"] != "system"]
            body = {
                "model": model,
                "max_tokens": 1500,
                "messages": user_msgs,
                "temperature": 0.2,
                **({"system": system} if system else {}),
            }
            with httpx.Client(timeout=15.0) as client:
                res = client.post(url, headers=headers, json=body)
                res.raise_for_status()
                data = res.json()
                content = data["content"][0]["text"]
                tokens = (data.get("usage", {}).get("input_tokens", 0) + data.get("usage", {}).get("output_tokens", 0))
                rate = COST_PER_1K_TOKENS.get(model, 0.003)
                cost = round((tokens / 1000.0) * rate, 6)
                return content, tokens, cost

    except Exception:
        return None, 0, 0.0

    return None, 0, 0.0


def plan_with_llm(question: str, schema_info: dict[str, Any]) -> dict[str, Any] | None:
    """Use LLM to plan analysis tool routing and parameter selection."""
    config = get_configured_provider()
    if not config.get("enabled"):
        return None

    system_prompt = (
        "You are an expert autonomous data analyst planning tools for a user question.\n"
        "Available tool options: 'schema_inspector', 'pandas_analysis', 'sql_query', 'anomaly_detection', "
        "'correlation_analysis', 'forecasting', 'statistical_tests', 'clustering', 'visualization_generator'.\n"
        "Return a JSON object with keys:\n"
        "- tools: list of tool strings\n"
        "- metric: string (best numeric column from schema) or null\n"
        "- group: string (best categorical column from schema) or null\n"
        "- analytical_intent: brief description of how to approach this"
    )
    schema_summary = {
        "numeric_columns": schema_info.get("numeric_columns", []),
        "categorical_columns": schema_info.get("categorical_columns", []),
        "temporal_columns": schema_info.get("temporal_columns", []),
    }
    user_prompt = f"Question: {question}\nDataset Schema: {json.dumps(schema_summary)}"
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]

    content, tokens, cost = call_llm(messages, json_mode=True)
    if not content:
        return None

    try:
        data = json.loads(content)
        data["tokens"] = tokens
        data["cost"] = cost
        data["model"] = config["model"]
        return data
    except Exception:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(0))
                data["tokens"] = tokens
                data["cost"] = cost
                data["model"] = config["model"]
                return data
            except Exception:
                return None
    return None


def synthesize_with_llm(
    question: str,
    findings: list[dict[str, Any]],
    profile: dict[str, Any],
    stats_summary: dict[str, Any],
) -> tuple[str | None, int, float]:
    """Generate an evidence-backed executive summary synthesis from verified results."""
    config = get_configured_provider()
    if not config.get("enabled"):
        return None, 0, 0.0

    system_prompt = (
        "You are the NEXUS Autonomous Data Analyst. Given verified analytical findings and calculated metrics, "
        "produce an authoritative, concise, and evidence-backed 2-3 sentence executive answer. "
        "Do NOT invent numbers outside the provided findings and stats. Be crisp, professional, and clear."
    )
    user_prompt = (
        f"Question: {question}\n"
        f"Verified Findings: {json.dumps([f.get('detail', '') for f in findings])}\n"
        f"Stats & Summary: {json.dumps(stats_summary)}\n"
        "Provide a concise executive answer:"
    )
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
    content, tokens, cost = call_llm(messages, json_mode=False)
    return content.strip() if content else None, tokens, cost
