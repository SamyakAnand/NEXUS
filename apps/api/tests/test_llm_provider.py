from __future__ import annotations

from nexus_api import llm


def _clear_legacy_provider_environment(monkeypatch):
    for name in (
        "GROQ_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "OLLAMA_BASE_URL",
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
        "NVIDIA_API_KEY",
        "ANTHROPIC_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)


def test_euri_is_the_only_configured_remote_provider(monkeypatch):
    _clear_legacy_provider_environment(monkeypatch)
    monkeypatch.setenv("EURI_API_KEY", "test-euri-key")
    monkeypatch.setenv("GEMINI_API_KEY", "legacy-key")

    provider = llm.get_configured_provider()

    assert provider["provider"] == "euri"
    assert provider["base_url"] == "https://api.euron.one/api/v1/euri"
    assert provider["model"] == "gemini-2.5-flash"
    assert provider["api_key"] == "test-euri-key"


def test_legacy_provider_keys_do_not_enable_another_model(monkeypatch):
    _clear_legacy_provider_environment(monkeypatch)
    monkeypatch.delenv("EURI_API_KEY", raising=False)
    monkeypatch.setenv("NVIDIA_API_KEY", "legacy-key")

    provider = llm.get_configured_provider()

    assert provider == {
        "enabled": False,
        "provider": "deterministic_fallback",
        "model": "deterministic",
    }


def test_euri_completion_uses_openai_compatible_endpoint(monkeypatch):
    _clear_legacy_provider_environment(monkeypatch)
    monkeypatch.setenv("EURI_API_KEY", "test-euri-key")

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "choices": [{"message": {"content": "Verified summary"}}],
                "usage": {"total_tokens": 27},
            }

    class Client:
        def __init__(self, timeout):
            assert timeout == 15.0

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def post(self, url, headers, json):
            assert url == "https://api.euron.one/api/v1/euri/chat/completions"
            assert headers["Authorization"] == "Bearer test-euri-key"
            assert json["model"] == "gemini-2.5-flash"
            return Response()

    monkeypatch.setattr(llm.httpx, "Client", Client)

    content, tokens, cost = llm.call_llm([{"role": "user", "content": "Summarize"}])

    assert content == "Verified summary"
    assert tokens == 27
    assert cost == 0.0
