# DocHermes

DocHermes is a desktop risk coach add-on for trading workflows. It is not a trading bot, wallet, exchange client, or order router.

The app is designed to stay operating-system, trading-platform, chain, exchange, wallet, and strategy agnostic. The local requirements are:

- A compatible Hermes instance, usually local Hermes API Server.
- A trading platform or trading window the user can explicitly select for screenshot capture.
- Optional local preference state for armed/pause and future local watch toggles.

## Current Prototype

The current prototype provides:

- Electron desktop app.
- Always-on-top compact coach window.
- Tray/menu-bar controls (show/hide, capture, settings, arm/pause, etc.).
- Explicit window picker before capture.
- Screenshot preview.
- Text question input.
- Hermes connection settings for local, hosted, or advanced/custom endpoints.
- OpenAI-compatible Hermes API Server adapter for `POST /v1/chat/completions`.
- Legacy `/coach` adapter support when explicitly selected or discovered during auto probing.
- Bearer auth and configurable model ID.
- Connection test UI with text/image capability checks and copyable masked diagnostics.
- Successful connection tests apply the discovered effective adapter/base URL to future asks.
- Local settings for panel always-on-top, armed/pause, and live monitoring toggles.
- Local OCR monitoring with selectable analysis region (`full-window`, `order-panel`, `chart-order-panel`) and manual recalibration.
- User-assisted OCR region overlay editor (drag-to-place on preview + normalized region controls).
- Local data-sharing controls for memory context (use local history for risk checks, send compact summary, raw records disabled by default).
- Read-only observed wallet address list with explicit private-key/seed warning.
- Read-only CSV trade-history import into normalized local memory summaries.
- Read-only wallet history sync loop for observed addresses (background refresh + manual sync, no signing/trading permissions).
- Paired-window preference that persists across restarts so you can resume from the same trading window.
- Local journal save with question, response, user notes, selected-window metadata, and screenshot metadata.
- Compact personal-memory context built from local journal entries.
- Basic local pattern matching for early-entry risk and confirmation behavior.
- Hermes response display.
- Optional browser extension scaffold for DOM-first context extraction that can be copied into clipboard monitoring.

Capture is user initiated. The app does not run hidden background capture and has no execution capability.

The journal intentionally stores screenshot metadata instead of image bytes. That keeps the first local memory loop useful without silently retaining sensitive trading screenshots.

When the coach is armed, clipboard changes are scanned for token/candidate patterns and surfaced as live monitoring signals.

If OCR watch is enabled, selected-window captures are preprocessed locally (resize + grayscale/contrast + threshold), then parsed for order context signals.

If observed wallet addresses are configured, DocHermes can run a read-only wallet-history sync in the background without blocking pre-trade checks. Wallet sync results are normalized into the same local trade-memory model used by journal and CSV imports. Unsupported address/provider formats are surfaced explicitly and are not treated as fatal.

When a new question resembles prior notes, the renderer sends a compact `memoryContext` object with the Hermes request. This is intentionally summarized before transmission so the app does not dump the full local journal into every prompt.

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Run verification:

```bash
npm test
npm run typecheck
npm run build
```

## Hermes Connection

Default local base URL:

```text
http://localhost:8642
```

Default model ID:

```text
hermes-agent
```

In `auto` or `openai-chat` mode, DocHermes sends OpenAI-compatible multimodal chat requests to:

```text
POST /v1/chat/completions
```

The settings panel can also test:

- `GET /health`
- `GET /v1/capabilities`
- `GET /v1/models`
- text ping to `POST /v1/chat/completions`
- image ping to `POST /v1/chat/completions`
- legacy `/coach` ping when auto mode needs a fallback

Hosted/public Hermes instances can use bearer auth. Debug reports mask bearer tokens and common token query parameters.

Bearer tokens are stored locally in the Electron app's local settings for this prototype. Do not use shared machines for hosted Hermes credentials.

Legacy `/coach` remains available through `legacy-coach` mode for custom adapters, but it is no longer the default.

See [Hermes API integration notes](docs/hermes-api-notes.md) for the recommended payload shape and migration notes.

## Optional Browser Extension

An optional browser-side extractor is available at:

```text
extensions/dochermes-context
```

Load this folder as an unpacked extension in Chromium-based browsers. The extension popup can extract page context (pair/chain/size/leverage/direction/type/address hints) and copy it as structured text for DocHermes clipboard monitoring.
