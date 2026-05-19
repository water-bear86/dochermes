# DocHermes

DocHermes is a desktop risk coach add-on for trading workflows. It is not a trading bot, wallet, exchange client, or order router.

The app is designed to stay operating-system, trading-platform, chain, exchange, and strategy agnostic. The local requirements are:

- Docker running the Hermes gateway.
- A trading platform or trading window the user can explicitly select for screenshot capture.

## Milestone 1 Loop

The current prototype provides:

- Electron desktop app.
- Always-on-top compact coach window.
- Tray/menu-bar controls.
- Explicit window picker before capture.
- Screenshot preview.
- Text question input.
- Local settings for gateway URL and panel always-on-top behavior.
- Local journal save with question, response, user notes, selected-window metadata, and screenshot metadata.
- JSON request to the local Hermes Docker gateway.
- Hermes response display.

Capture is user initiated. The app does not run hidden background capture and has no execution capability.

The journal intentionally stores screenshot metadata instead of image bytes. That keeps the first local memory loop useful without silently retaining sensitive trading screenshots.

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

## Hermes Gateway Contract

The default gateway endpoint is:

```text
http://localhost:8787/coach
```

If the configured gateway URL is only an origin, such as `http://localhost:8787`, the app sends requests to `/coach`.

The app sends JSON:

```json
{
  "question": "Should I take this trade now?",
  "screenshot": {
    "mimeType": "image/png",
    "dataBase64": "..."
  },
  "selectedWindow": {
    "id": "window:...",
    "name": "Trading Platform",
    "kind": "window"
  },
  "constraints": {
    "executionCapability": false,
    "platformAgnostic": true,
    "captureRequiresUserSelection": true
  }
}
```

The response parser accepts any of these shapes:

```json
{ "answer": "..." }
```

```json
{ "response": "..." }
```

```json
{ "message": "..." }
```

It also accepts basic OpenAI-style `choices[].message.content` responses for gateways that proxy model output.
