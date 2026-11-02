"""OmniRoute and NVIDIA Model Gateway for Nexus Enterprise AI Data Analyst.

Handles model discovery, authentication, structured planning, and narrative synthesis
via remote model endpoints with strict privacy and security boundaries.

Guiding principles:
- Strictly NO local LLM fallback or Ollama.
- Arithmetic correctness is NEVER delegated solely to the LLM.
- Secrets are NEVER logged, committed, or exposed to the client.
- Graceful degradation when remote endpoints are unavailable.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Literal

import httpx
from dotenv import load_dotenv

load_dotenv()
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger("nexus.gateway")

DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_NVIDIA_MODEL = "meta/llama-3.2-11b-vision-instruct"


class OmniRouteGateway:
    """Enterprise Model Gateway integrating NVIDIA NIM and OmniRoute endpoints."""

    def __init__(self) -> None:
        self.reload_config()

    def reload_config(self) -> None:
        """Reload configuration from environment."""
        self.nvidia_key = os.getenv("NVIDIA_API_KEY", "").strip()
        self.nvidia_base_url = os.getenv("NVIDIA_BASE_URL", DEFAULT_NVIDIA_BASE_URL).rstrip("/")
        self.nvidia_model = os.getenv("NVIDIA_MODEL", DEFAULT_NVIDIA_MODEL).strip()

        self.omniroute_base_url = os.getenv("OMNIROUTE_BASE_URL", "").rstrip("/")
        self.omniroute_key = os.getenv("OMNIROUTE_API_KEY", "").strip()
        self.omniroute_model = os.getenv("OMNIROUTE_MODEL", "").strip()

        self.gemini_key = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", "")).strip()
        self.gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip()

        self.timeout = float(os.getenv("MODEL_TIMEOUT_SECONDS", "25.0"))
        self.max_retries = int(os.getenv("MODEL_MAX_RETRIES", "2"))

    def get_active_provider(self) -> dict[str, Any]:
        """Detect the active high-performance remote provider.
        
        Strict rule: No Ollama or local inference fallback.
        """
        # 1. Direct NVIDIA NIM / Integrate API
        if self.nvidia_key:
            return {
                "enabled": True,
                "provider": "nvidia",
                "type": "openai_compatible",
                "base_url": self.nvidia_base_url,
                "api_key": self.nvidia_key,
                "model": self.nvidia_model,
            }

        # 2. OmniRoute OpenAI-Compatible Router Gateway
        if self.omniroute_base_url and self.omniroute_key:
            return {
                "enabled": True,
                "provider": "omniroute",
                "type": "openai_compatible",
                "base_url": self.omniroute_base_url,
                "api_key": self.omniroute_key,
                "model": self.omniroute_model or "default",
            }

        # 3. Google Gemini (Remote cloud provider)
        if self.gemini_key:
            return {
                "enabled": True,
                "provider": "gemini",
                "type": "gemini",
                "base_url": "https://generativelanguage.googleapis.com/v1beta",
                "api_key": self.gemini_key,
                "model": self.gemini_model,
            }

        return {
            "enabled": False,
            "provider": "deterministic_fallback",
            "model": "deterministic",
        }

    def generate_chat_completion(
        self,
        messages: list[dict[str, str]],
        json_mode: bool = False,
        temperature: float = 0.2,
        max_tokens: int = 1500,
    ) -> tuple[str | None, int, float, str]:
        """Execute a remote chat completion call with retry protection and latency tracking.
        
        Returns:
            (content, token_count, estimated_cost, model_name)
        """
        config = self.get_active_provider()
        if not config.get("enabled"):
            return None, 0, 0.0, "deterministic"

        provider = config["provider"]
        model = config["model"]
        api_key = config["api_key"]

        for attempt in range(self.max_retries + 1):
            try:
                if provider in ("nvidia", "omniroute"):
                    return self._call_openai_compatible(
                        base_url=config["base_url"],
                        api_key=api_key,
                        model=model,
                        messages=messages,
                        json_mode=json_mode,
                        temperature=temperature,
                        max_tokens=max_tokens,
                    )
                elif provider == "gemini":
                    return self._call_gemini(
                        api_key=api_key,
                        model=model,
                        messages=messages,
                        json_mode=json_mode,
                        temperature=temperature,
                    )
            except Exception as exc:
                logger.warning(
                    "Model call attempt %d failed for %s (%s): %s",
                    attempt + 1,
                    provider,
                    model,
                    str(exc),
                )
                if attempt == self.max_retries:
                    # If NVIDIA/OmniRoute encounters endpoint-specific failure, try Gemini fallback if available
                    if provider in ("nvidia", "omniroute") and self.gemini_key:
                        try:
                            logger.info("Attempting backup remote route via Google Gemini...")
                            return self._call_gemini(
                                api_key=self.gemini_key,
                                model=self.gemini_model,
                                messages=messages,
                                json_mode=json_mode,
                                temperature=temperature,
                            )
                        except Exception as gemini_exc:
                            logger.error("Backup Gemini route also failed: %s", str(gemini_exc))
                    return None, 0, 0.0, model
                time.sleep(1.0 * (attempt + 1))

        return None, 0, 0.0, model

    def _call_openai_compatible(
        self,
        base_url: str,
        api_key: str,
        model: str,
        messages: list[dict[str, str]],
        json_mode: bool,
        temperature: float,
        max_tokens: int,
    ) -> tuple[str | None, int, float, str]:
        url = f"{base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        with httpx.Client(timeout=self.timeout) as client:
            res = client.post(url, headers=headers, json=body)
            res.raise_for_status()
            data = res.json()
            content = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
            tokens = usage.get("total_tokens", 0)
            cost = round((tokens / 1000.0) * 0.0002, 6)
            return content, tokens, cost, model

    def _call_gemini(
        self,
        api_key: str,
        model: str,
        messages: list[dict[str, str]],
        json_mode: bool,
        temperature: float,
    ) -> tuple[str | None, int, float, str]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        contents = [
            {
                "role": "user" if m["role"] == "user" else "model",
                "parts": [{"text": m["content"]}],
            }
            for m in messages
        ]
        body: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                **({"response_mime_type": "application/json"} if json_mode else {}),
            },
        }
        with httpx.Client(timeout=self.timeout) as client:
            res = client.post(url, json=body)
            res.raise_for_status()
            data = res.json()
            candidates = data.get("candidates", [])
            if candidates:
                text = candidates[0]["content"]["parts"][0]["text"]
                tokens = data.get("usageMetadata", {}).get("totalTokenCount", 0)
                cost = round((tokens / 1000.0) * 0.0001, 6)
                return text, tokens, cost, model
            return None, 0, 0.0, model


gateway = OmniRouteGateway()
