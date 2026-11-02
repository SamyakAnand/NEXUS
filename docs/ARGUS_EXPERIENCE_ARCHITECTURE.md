# ARGUS AI Experience Architecture and Implementation Plan

**Status:** Implemented frontend experience and route layer. This frontend rebrand and experience layer sits on the existing Nexus analytics prototype; it does not implement the backend RAG capabilities described by the product concept.

## Audit snapshot

- Next.js 16 App Router, React 19, strict TypeScript. Existing routes: `/` landing and `/workspace` interactive analysis.
- Existing design: custom global CSS and reusable utility classes, currently light-first; no Tailwind, shadcn/ui, Radix, Zod, React Hook Form or TanStack Query.
- Existing reusable capabilities: Phosphor icon system, Framer Motion, Recharts, `DatasetUniverse` React Three Fiber scene with WebGL/reduced-motion fallback, charts, typed API client, data upload/profile/analysis/cleaning/evaluation/lineage.
- Existing data: FastAPI routes for datasets and deterministic analysis. No auth, tenant isolation, document ingestion/RAG, server-side search, persisted session listing, graph API contract beyond local source lineage, or provider telemetry.
- Deployment: local/Docker Next proxy to FastAPI; Vercel API/web service routing. Existing `.env.local` is user-owned and will not be read into source or modified.
- Existing worktree is heavily modified. Preserve all unrelated backend edits and avoid replacing the working `/workspace` analysis surface.

## Route hierarchy

| Route | Purpose and data boundary |
|---|---|
| `/` | Public ARGUS brand/experience, conceptual 3D hero, truthful capability story and live synthetic analysis entry point. |
| `/overview` | Local dataset inventory and API health; retrieval/model quality metrics show unavailable until real endpoints exist. |
| `/workspace` | Existing deterministic analysis experience, rebranded and retained. |
| `/documents` | Existing CSV/XLSX/JSON dataset library and upload/preview; explicitly not arbitrary enterprise document ingestion. |
| `/search` | Ask the current deterministic analytical engine about a selected dataset; explicitly not semantic document retrieval. |
| `/graph` | Visualize the current source lineage API when data exists; distinguish heuristics from verified evidence and provide a list/inspector fallback. |
| `/sessions` | Browser-local analysis history only until a server listing API exists. |
| `/evaluation` | Existing deterministic routing/metadata fixture run and its stated limits. |
| `/models` | Configured provider/model from health metadata only; inference capability is marked unverified. No credentials displayed. |
| `/settings` | Local prototype configuration and unavailable security/tenant controls, clearly stated. |

## Design system and component boundaries

Create Argus CSS variables and reusable semantic classes without replacing the existing CSS system. Use the installed Phosphor icons, Framer Motion, Recharts, Three.js and React Three Fiber. Do not add Tailwind/shadcn/Radix dependencies blindly; accessible native buttons, links, forms and dialogs provide the same basic controls with the current stack. Use a shared application shell for product routes, a dynamic client-only Three.js hero scene, and route components with typed API adapters.

Token direction: obsidian `#070b12`, raised navy charcoal, muted blue-gray borders, cyan for focus/highlight, violet for secondary graph categories, green for verified success, amber for uncertainty and red for failures. Limit glow to selected nodes/primary actions. Body copy stays high-contrast and uncluttered.

## Stages

1. **Audit and plan:** completed in this document; preserve current analysis and source changes.
2. **Experience foundation:** tokens, metadata/rebrand, lazy 3D hero, shared responsive shell, route hierarchy and keyboard command palette.
3. **Core product routes:** overview, dataset library, analytical search, source-lineage graph, local sessions, evaluation, model status, settings. Use only existing APIs; show explicit unavailable states.
4. **Workspace integration:** rebrand existing analysis UI without changing API behavior; direct links to new areas and maintain keyboard/reduced-motion behavior.
5. **QA:** TypeScript check passes. HTTP route smoke check returns 200 for `/`, `/overview`, `/workspace`, `/documents`, `/search`, `/graph`, `/sessions`, `/evaluation`, `/models`, and `/settings`. The package has no lint or frontend test script. Production build was not run because the existing development server is actively using the shared `.next` output directory. Narrow viewport, keyboard, and WebGL fallback behavior still need a browser-level pass.

## Acceptance rules

- No production counts, retrieval scores, citations, auth state, provider health or model success fabricated.
- 3D loads client-side and only where used; accessible HTML controls expose the same selection information.
- Route links resolve; missing capabilities explain their current availability and the live feature that does work.
- Existing upload, analysis, cleaning, reports, trace, SQL and evaluation behavior remains available.
- Current API and UI security limitations remain visible; frontend presentation does not imply the API is authenticated.
