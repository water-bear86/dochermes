# DocHermes Beta Smoke Test Checklist

Use this checklist for a focused beta pass after a clean install, a local development run, or a release candidate build.

DocHermes is an advisory sidecar only. During every smoke pass, verify that the app never asks for wallet control, private keys, seed phrases, signing, approvals, withdrawals, order routing, or trade execution.

## Prerequisites

- Install dependencies with `npm install`.
- Start the app with `npm run dev`, or launch the packaged beta build.
- Optional: start a local Hermes gateway compatible with `POST /v1/chat/completions`.
- Have a harmless trading, chart, or test window available for explicit capture selection.
- Keep one public wallet address and one small CSV sample ready if testing local memory import paths.

## Result Log

| Area | Result | Notes |
| --- | --- | --- |
| Launch app | Not run | |
| Configure local Hermes gateway | Not run | |
| Ask with screenshot allowed | Not run | |
| Maximum privacy ask path | Not run | |
| Voice toggle | Not run | |
| Local journal and memory | Not run | |
| CSV import | Not run | |
| OCR overlay | Not run | |
| Wallet sync disabled by default | Not run | |
| Advisory/privacy boundary | Not run | |

Use `Pass`, `Fail`, or `Blocked` in the Result column. Record the app version, operating system, Hermes gateway URL, and any copied debug report in Notes.

## 1. Launch App

1. Start DocHermes.
2. Confirm the compact coach window opens without a blank screen or renderer error.
3. Open the tray/menu-bar menu and confirm show/hide, capture/settings, and arm/pause controls are visible.
4. Confirm the footer states: `Platform agnostic. Read-only wallet context only. No signing. No order routing.`

Expected:

- The app launches without console crashes.
- The coach panel starts in an advisory posture and does not present trading execution controls.
- Capture still requires explicit user window selection.

## 2. Configure Local Hermes Gateway

1. Open Local settings.
2. Set Hermes gateway to `Local gateway`.
3. Set Gateway URL to `http://localhost:8642`.
4. Leave Bearer token empty for a private local gateway.
5. Click `Test gateway`.

Expected:

- The connection report clearly shows connected, degraded, or disconnected status.
- A connected local API reports text capability and, when supported, image capability.
- The debug report masks secrets and remains copyable.
- DocHermes does not ask the beta user to select a model/provider; that configuration stays inside Hermes.
- The configured path remains OpenAI-compatible through `/v1/chat/completions` by default; do not require a custom `/coach` route unless explicitly testing legacy mode.

## 3. Ask With Screenshot Allowed

1. Keep Privacy preset on `Balanced (window + summaries)` or `Full context (full window)`.
2. Select or pair the harmless trading/test window.
3. Enter: `What risk would make this setup a no-trade?`
4. Click `Capture and ask`.
5. If remote-hosted Hermes is configured, confirm any remote sharing prompt or disclosure before proceeding.

Expected:

- A screenshot preview appears for the selected window.
- The Hermes request preview lists `Screenshot image` in payload classes.
- The response appears as a coach assessment, not an execution instruction.
- The app does not route orders, connect to an exchange, ask for a wallet signature, or request private credentials.

## 4. Maximum Privacy Ask Path

1. Open Local settings.
2. Set Privacy preset to `Maximum (no screenshot, local summaries only)`.
3. Confirm redaction options are forced on or disabled by the preset.
4. Ask: `Given my notes, should I wait for confirmation?`
5. Submit the request.

Expected:

- No real screenshot is captured or transmitted.
- The Hermes request preview lists `Screenshot placeholder (maximum privacy)`.
- Local-only context remains local when the UI says it is withheld.
- The response still frames advice as risk coaching and does not provide execution commands.

## 5. Voice Toggle Sanity Check

1. Open Local settings.
2. Enable `Enable push-to-talk`.
3. Choose a push-to-talk hotkey and read the OS-specific conflict note.
4. Leave transcription on `Auto: browser speech, typed fallback` unless intentionally testing browser-only speech.
5. Click `Push-to-talk`.
6. Speak a short question, then stop listening.
7. If speech recognition is unavailable, confirm the app focuses the typed question path instead of sending audio somewhere else.
8. Optional: enable `Read Hermes replies aloud`, ask a low-risk question, and then stop reply audio.

Expected:

- The voice state changes between off, ready, listening, and speaking without freezing the app.
- Recognized text flows into the same advisory request path as manual capture.
- Auto transcription falls back to typed input when browser or OS speech recognition is unavailable.
- Disabling push-to-talk disables the voice button.
- Voice settings do not ask the beta user to choose a model/provider; that routing stays inside Hermes.
- Voice does not bypass privacy preset, selected-window, or remote consent behavior.

## 6. Local Journal And Memory Visibility

1. Complete a successful ask.
2. In Source context, add a short Session notes entry such as `Waited for confirmation instead of chasing entry`.
3. Click `Save journal`.
4. Confirm the Local memory panel shows the new local journal count.
5. Ask a related question that should match the saved note.
6. Confirm a Personal memory or local risk hint appears when relevant.
7. Click `Clear local memory` only after recording the result.

Expected:

- Journal entries are saved locally.
- Screenshot metadata may be saved, but image bytes are not stored in the journal.
- Compact memory context is summarized before any Hermes request.
- Clearing local memory removes visible journal and warning feedback counts.

## 7. CSV Import Sanity Path

1. Open Local settings.
2. Paste this read-only sample into Trade history CSV import:

   ```csv
   timestamp,size,unit,pnl_percent,token
   2026-05-22T12:00:00Z,0.5,SOL,-8.2,0x0000000000000000000000000000000000000000
   ```

3. Click `Import CSV`.
4. Confirm the Imported records count increments.
5. Ask a risk question that references sizing or recent losses.
6. Confirm local history affects local risk or compact summary behavior without exposing raw records.
7. Click `Clear imported records` after recording the result if you need a clean state.

Expected:

- CSV import is read-only and creates normalized local history records.
- `Send raw trade records to Hermes (disabled in MVP)` remains disabled.
- The app does not claim to modify exchange, broker, chain, or wallet data.

## 8. OCR Overlay Open, Adjust, Save Path

1. Open Local settings.
2. Enable `Use OCR snapshots for local pre-checks`.
3. Set OCR analysis region to `Order panel focus` or `Chart + order panel`.
4. Keep `Show OCR region overlay on capture preview` enabled.
5. Capture the selected window once.
6. Choose `Order panel` or `Chart zone` under OCR region to edit.
7. Drag over the capture preview, or adjust Region left/top/width/height.
8. Confirm the overlay box moves and persists while settings remain open.
9. Click `Recalibrate OCR regions`.
10. Optional: click `Reset OCR region defaults` and confirm default boxes return.

Expected:

- OCR setup is local-only and does not transmit OCR text unless included by the configured request path.
- Overlay controls stay within the selected capture preview.
- Recalibration reports a clear inactive, waiting, active, or error state.
- OCR monitoring does not start hidden capture without the app being armed and configured.

## 9. Wallet Sync Disabled-By-Default Sanity Check

1. Start from clean local settings or clear the Observed public wallet addresses field.
2. Confirm the field is empty by default.
3. Confirm Wallet records shows `0` or an unchanged local count.
4. Click `Sync wallet history` with no observed addresses.
5. Add a public address only if you are testing read-only history lookup.

Expected:

- With no observed public addresses, wallet sync does not fetch or create wallet records.
- The UI warns: never enter seed phrases or private keys.
- Wallet sync is read-only public history lookup only.
- The app never asks for signing, approvals, withdrawals, private keys, seed phrases, order placement, or wallet control.

## Final Boundary Check

Before signing off a beta smoke pass, verify:

- No feature asks the user to connect a wallet for control or signing.
- No feature creates, signs, routes, or submits trades.
- Hosted or public Hermes use is opt-in and clearly disclosed when screenshots may leave the machine.
- Local settings and journal data remain local unless compact summaries are explicitly configured for Hermes requests.
- Any failure is recorded with the exact step, app state, adapter mode, and copied debug report when available.
