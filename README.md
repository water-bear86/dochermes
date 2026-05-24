# DocHermes

DocHermes is a desktop risk and execution coach for trading workflows.

It is designed to sit beside an existing trading platform, watch only the window the user explicitly selects, send context to a Hermes gateway, and return structured coaching before a trader acts.

## Status: Not Ready To Install

DocHermes is currently an active prototype.

Do not install this as a production trading tool yet. Do not use it as the basis for live trading decisions. There is no packaged release, no stable installer, and no production support guarantee.

This repository is public so the product direction, architecture, and implementation work can be reviewed early.

## What DocHermes Is

DocHermes is intended to become:

- A downloadable desktop companion.
- A professional risk copilot that stays on top of a trading workflow.
- A window-paired coach that captures only after the user selects a trading window.
- A model-agnostic client that connects to the Hermes gateway.
- A local-memory layer for journals, trade notes, postmortems, and behavior patterns.
- A guardrail layer for sizing discipline, cooldowns, source quality, liquidity risk, and repeat-mistake detection.

The intended flow:

```text
Signal appears
-> User asks DocHermes or captures the selected trading window
-> DocHermes sends screenshot/context to Hermes
-> Hermes returns risk and execution guidance
-> User decides whether to act in their existing trading platform
-> DocHermes stores local notes/outcomes for future coaching
```

## What DocHermes Is Not

DocHermes is not:

- A trading bot.
- A wallet.
- An exchange client.
- An order router.
- A signing tool.
- A source of financial advice.
- A system that asks for seed phrases, private keys, approvals, withdrawals, or wallet control.

The application has no trade execution capability. It does not place orders, route swaps, sign transactions, or control wallets.

## Design Principles

DocHermes should remain:

- Operating-system agnostic where practical.
- Trading-platform agnostic.
- Chain, exchange, wallet, and strategy agnostic.
- Model/provider agnostic.
- Explicit about what data leaves the machine.
- Advisory by default.

DocHermes connects to Hermes. Hermes owns provider selection, model selection, provider credentials, and inference routing.

## Current Prototype

The current prototype includes:

- Electron desktop app.
- Always-on-top compact coach window.
- Tray/menu-bar controls for show/hide, capture, settings, arm/pause, and quit.
- Explicit trading-window picker before capture.
- Screenshot preview.
- Text question input.
- Hermes gateway settings for local, hosted, or custom gateways.
- Connection testing with text/image route checks and copyable masked diagnostics.
- Local settings for always-on-top, armed/pause, voice, OCR, monitoring, privacy, and guardrail behavior.
- Privacy presets, including maximum privacy mode that withholds screenshots, window metadata, memory context, and monitoring context from Hermes.
- Local journal save with question, response, notes, selected-window metadata, and screenshot metadata.
- Local memory summaries and basic pattern matching.
- Trade notes and postmortem helpers.
- Read-only CSV trade-history import.
- Read-only public wallet observation cache for local risk checks.
- OCR monitoring and region calibration for local pre-checks.
- Optional browser extension scaffold for DOM-first context extraction.

Capture is user initiated. The journal stores screenshot metadata instead of screenshot image bytes.

## Hermes Gateway

DocHermes talks to a Hermes gateway, not directly to a provider model.

Default local gateway URL:

```text
http://localhost:8642
```

Default compatibility route:

```text
POST /v1/chat/completions
```

The UI exposes gateway setup as:

- Hermes gateway type.
- Gateway URL.
- Optional bearer token.
- Test gateway.

Advanced compatibility settings exist for gateways that require a specific adapter mode or OpenAI-style route/profile token. Normal users should not need to configure a model inside DocHermes.

See [Hermes API integration notes](docs/hermes-api-notes.md) for payload details.

## Local Development Only

This is for contributors and reviewers. It is not an install path for end users.

Install dependencies:

```bash
npm install
```

Run the app in development mode:

```bash
npm run dev
```

Run verification:

```bash
npm test
npm run typecheck
npm run build
```

## Beta Testing Notes

DocHermes does not have an installable beta yet. Current beta work is for maintainers, contributors, and invited testers using local development runs or maintainer-created release-candidate builds.

Useful beta docs:

- [Beta tester support checklist](docs/beta/tester-support-checklist.md)
- [Known beta limitations](docs/beta/known-limitations.md)
- [Beta troubleshooting](docs/beta/troubleshooting.md)
- [Tester feedback template](docs/beta/tester-feedback-template.md)
- [Manual QA checklist](docs/beta/manual-qa-checklist.md)
- [UX and accessibility audit](docs/beta/ux-accessibility-audit.md)
- [Release notes template](docs/beta/release-notes-template.md)
- [Beta release runbook](docs/beta/release-runbook.md)

## Project Direction

Near-term work is focused on:

- Hardening the desktop companion loop.
- Making Hermes gateway setup harder to misconfigure.
- Improving first-run clarity.
- Preserving strict privacy boundaries.
- Strengthening local memory and postmortem flows.
- Keeping the product advisory-only while guardrail and policy modes mature.

Longer term, DocHermes should support:

- Advisory mode: recommendations only.
- Guardrail mode: warnings when user-defined rules are violated.
- Policy mode: explicit override required before proceeding outside rules.
- Better context extraction through optional browser DOM helpers.
- Voice input and optional spoken replies.
- A packaged desktop release.

## Safety Boundary

DocHermes is a risk and execution coach. It should help traders slow down, size better, review prior behavior, and avoid repeating preventable mistakes.

It must not become a trade executor.

## License

DocHermes is licensed under the MIT License. See [LICENSE](LICENSE).
