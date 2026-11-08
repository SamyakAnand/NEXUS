# Contributing to NEXUS

Thank you for your interest in improving NEXUS. Contributions are welcome, especially fixes that make data handling, analysis results, evaluation, and documentation more reliable.

## Before you start

1. Read the project overview and current-scope notes in [README.md](README.md).
2. For a substantial change, open an issue first to discuss the problem and proposed approach.
3. Keep pull requests focused. Separate unrelated refactors, features, and formatting changes.
4. Never commit datasets containing personal, confidential, or otherwise sensitive information, credentials, API keys, or local environment files.

## Development environment

The documented local setup uses Python 3.11 or newer, Node.js, and npm. The CI workflow currently runs Python 3.12 and Node.js 22.

### API tests

From the repository root:

```bash
python -m pip install -r apps/api/requirements.txt pytest httpx
pytest -c apps/api/pytest.ini apps/api/tests
```

### Web checks

```bash
cd apps/web
npm ci
npm run typecheck
npm run build
```

These are the checks configured in the repository's GitHub Actions workflow. If a change adds new behavior, include or update tests that cover it.

## Engineering guidelines

- **Preserve source data:** cleaning and transformation workflows should create derived outputs rather than silently overwrite uploaded inputs.
- **Validate at boundaries:** validate file types, payloads, schemas, and tool parameters before processing.
- **Keep analysis inspectable:** expose the relevant source columns, assumptions, validation outcomes, and caveats behind findings.
- **Prefer deterministic behavior:** use predictable calculations and explicit tool selection where possible; do not imply that a model was called when the workflow used deterministic code.
- **Treat SQL as untrusted input:** preserve the existing read-only and constrained execution model. Do not add arbitrary shell, Python, filesystem, or unrestricted SQL execution.
- **Be precise about product scope:** update documentation when a capability is experimental, optional, unavailable, or not production-ready.
- **Avoid unsupported performance claims:** include a reproducible benchmark and its setup whenever reporting quality, speed, or accuracy numbers.

## Pull request checklist

Before requesting review:

- [ ] The change addresses one clear problem.
- [ ] Relevant API tests pass.
- [ ] Web type-check and production build pass when frontend code changes.
- [ ] New behavior has tests or a clear manual verification procedure.
- [ ] Documentation and examples match the implementation.
- [ ] No secrets, private data, generated local files, or unrelated changes are included.
- [ ] Known limitations and migration implications are documented.

## Pull request description

Please include:

1. **Problem:** what is currently difficult or incorrect?
2. **Change:** what did you change and why?
3. **Verification:** exact commands run and their results.
4. **Limitations:** anything not covered, deferred, or requiring follow-up.

Thanks for helping make NEXUS more useful, reliable, and explainable.
