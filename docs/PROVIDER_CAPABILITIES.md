# Euron EURI Provider

NEXUS uses one hosted model integration: Euron's EURI API, configured with `EURI_API_KEY`. The Euron Code product documents EURI as an OpenAI-compatible provider and exposes it under that provider name ([Euron Code provider documentation](https://euron.one/code-agent)). The adapter uses the EURI chat-completions URL `https://api.euron.one/api/v1/euri/chat/completions` and defaults to `gemini-2.5-flash`; both can be changed only through the single EURI configuration.

## Configuration

Set `EURI_API_KEY` in the backend environment. Never put the key in frontend code or commit it. Set `EURI_MODEL` to a model available to the EURI account; the default is `gemini-2.5-flash`. If no key is set, NEXUS uses its deterministic analysis path. Legacy provider variables are ignored.

The EURI service is OpenAI-compatible, but account permissions, model access, quotas, and billing are account-specific. NEXUS reports token usage only when the service includes it in the response. It does not estimate or display a cost without returned billing evidence.

## Credential incident and verification

A smoke request was mistakenly sent to the similarly named Euri G2 host before the provider distinction was established. The submitted key was in the request's authorization header. The key was removed from the local `.env` and must be revoked and replaced before enabling remote inference. No dataset content was sent; the request contained only a short health-check prompt. No successful inference against Euron EURI has been verified.

The backend adapter and tests now target the Euron EURI endpoint, but live connectivity remains unverified until a rotated key is configured. Keep smoke checks limited to synthetic prompts and avoid logging authorization headers or provider error bodies.
