# Provider and Model Capability Report

**Checked:** 2026-10-14 (Asia/Kolkata)  
**Method:** Read-only authenticated model-catalog requests from the local environment plus official provider model documentation. No completion/generation requests were made. Secrets were never displayed.

## Local configuration and endpoint checks

| Provider | Configuration state | Safe check | Result | What remains unverified |
|---|---|---|---|---|
| Google Gemini | API key present; configured model `gemini-3.5-flash` | `GET https://generativelanguage.googleapis.com/v1beta/models` | HTTP 200; configured model appears in catalog. Catalog reports `generateContent`, `countTokens`, caching, and batch generation methods. | A catalog read does not prove `generateContent` permission, account tier, current quota, or a successful inference. No generation was called. |
| NVIDIA NIM | API key present; configured model `meta/llama-3.3-70b-instruct` | `GET https://integrate.api.nvidia.com/v1/models` | HTTP 200; 80 IDs returned. Configured ID absent. Catalog includes `meta/llama-3.2-11b-vision-instruct` and `meta/llama-3.2-90b-vision-instruct`. | No completion call; configured model availability is not verified. Per-account limits and current inference health were not established. |
| OmniRoute | API key/base URL absent | No endpoint call | Not configured. | Base URL, model, auth, access, capabilities, quotas and terms. |

The current `llm.py` provider selector checks Gemini before NVIDIA, so with both keys set it selects Gemini. `analysis.py` uses this selector for narrative synthesis. The imported `gateway` is not invoked. A separate `gateway.py` prioritizes NVIDIA, then OmniRoute, then Gemini, creating inconsistent provider selection. No automatic provider failover should be claimed from these checks.

## Verified capability details

| Model | Access evidence | Input / output | Context and limits | Assessment |
|---|---|---|---|---|
| `gemini-3.5-flash` | Present in authenticated catalog (HTTP 200). | Text, image, video, audio, PDF / text. | 1,048,576 input tokens; 65,536 output tokens. | Strong documented multimodal candidate. Exact project RPM/TPM/RPD limits are account-specific and must be read in AI Studio. |
| `meta/llama-3.3-70b-instruct` | Not present in returned NVIDIA catalog (HTTP 200). | Unknown for this configured endpoint/model ID. | Unknown. | Do not use until corrected and reverified. |
| `meta/llama-3.2-11b-vision-instruct` | Present in NVIDIA catalog. | Text + image / text. | NVIDIA model card reports 131K context. | Multimodal candidate; not the configured ID. No inference request was made. |

Official provider references:

- [Gemini 3.5 Flash model card](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash) — supported input types, output type, context and output limits.
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) — limits vary by project/tier and exact active limits are surfaced in AI Studio; therefore no fixed RPM/TPM/RPD is asserted here.
- [NVIDIA NIM model card: Llama 3.2 11B Vision](https://build.nvidia.com/meta/llama-3.2-11b-vision-instruct) — text/image input, text output and 131K context.
- [NVIDIA NIM multimodal API reference](https://docs.api.nvidia.com/nim/reference/multimodal-apis) — documents the vision endpoint family.

## Implementation gate

Before enabling generation, confirm the intended model, inference permission, project billing tier and active rate limits in the provider console; set request timeout/output caps and cost policy; and run one deliberately bounded smoke request against non-sensitive synthetic content. Keep text/image-specific payload support behind adapter capability declarations. Never send uploaded/private content in a provider health check. Do not infer OCR, chart/table extraction, or grounding quality from general image input support; evaluate those separately on labeled examples.
