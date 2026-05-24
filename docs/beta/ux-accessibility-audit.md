# DocHermes UX And Accessibility Audit

This is a practical audit for the current desktop companion prototype. It is written for maintainers, contributors, and invited testers using local development runs or maintainer-created release-candidate builds.

DocHermes is not ready to install. It is also not a trading bot, wallet, exchange client, order router, signing tool, or source of financial advice. The app must keep the no-execution boundary obvious in every first-run, support, and QA flow.

## Scope Checked

- First-run setup and readiness flow.
- Local settings and Hermes gateway setup.
- Gateway diagnostics and request diagnostics.
- Privacy presets, remote-send consent, and local data controls.
- Hosted/custom bearer token storage behavior.
- Window selection, capture preview, OCR region controls, and ask flow.
- Keyboard, screen-reader, focus, and visible-state risks from the current renderer structure.
- Manual QA and future E2E coverage needs.

## Priority Findings

### P0: No-execution and privacy boundary must stay impossible to miss

The README, beta limitations, footer, and local settings copy already say the right thing: DocHermes is advisory, captures only after a selected window is paired, stores screenshot metadata instead of image bytes, and does not sign, route, or place trades.

Risk: the product is trading-adjacent, so testers can easily over-trust it if the first-run flow, release notes, support docs, or diagnostics copy get softer over time.

Follow-ups:

- [ ] Keep "No signing. No order routing. No wallet control. No trade execution." visible in first-run and release-candidate notes.
- [ ] In every support/debug template, tell testers to redact private credentials, bearer tokens, account data, and raw screenshots before sharing.
- [ ] Add a QA row that verifies hosted/custom gateway consent explains what leaves the device before a request is sent.
- [ ] Confirm maximum privacy mode sends placeholder screenshot/window metadata and withholds memory and monitoring context from Hermes.
- [ ] Treat any UI that asks for seed phrases, private keys, approvals, withdrawals, wallet signing, or order-routing permissions as a release blocker.

### P1: First-run needs a keyboard and screen-reader pass

The app gates the main UI behind a first-run wizard, which is good for orientation. The risk is that first-run is the only chance to teach the user what DocHermes will and will not do, so it needs to work well without a mouse or visual scanning.

Follow-ups:

- [ ] Tab through first-run from launch to completion without a mouse.
- [ ] Verify the current step, gateway status, selected window, and readiness state are understandable to a screen reader.
- [ ] Confirm Back/Next/Finish controls have predictable focus order and do not trap focus.
- [ ] Confirm error messages in first-run are announced or reachable immediately after a failed gateway/window check.
- [ ] Confirm the first-run copy clearly separates local gateway setup from hosted/custom remote data sharing.

### P1: Settings are powerful but dense

Local settings expose gateway mode, URL, token entry, diagnostics, privacy presets, redaction toggles, local data controls, trade-history sharing, wallet observation, voice, risk budget, clipboard/OCR monitoring, and OCR calibration. Native labels are present for many controls, which helps. The density creates usability risk for first-time testers.

Follow-ups:

- [ ] Keyboard-test expanding settings, changing gateway type, saving/clearing a hosted token, running Test gateway, and copying the debug report.
- [ ] Verify disabled controls explain why they are disabled, especially raw trade sharing, redaction toggles under maximum privacy, OCR controls, and token buttons.
- [ ] Confirm focus remains near the setting that caused a validation/error message.
- [ ] Add a short "what changes on device vs Hermes" QA check for reset, clear memory, and clear diagnostics.
- [ ] Watch for copy that says "model" in DocHermes as if users should choose a provider inside the app. Provider/model routing belongs in Hermes.

### P1: Gateway diagnostics need redaction confidence

The app has a copyable gateway debug report and recent request diagnostics. That is useful for support, but diagnostics can become sensitive because they include selected-window names, route/profile settings, timing data, failure reasons, and sanitized question previews.

Follow-ups:

- [ ] Verify copied gateway reports never include raw bearer tokens.
- [ ] Verify copied request diagnostics use a sanitized question preview and do not include screenshot bytes.
- [ ] Test hosted auth failure copy for clarity without revealing the token.
- [ ] Test image-route failure copy and make sure text-only fallback stays usable.
- [ ] Add E2E coverage for "copy debug report" and "copy request diagnostic" redaction once a stable runner exists.

### P1: Remote-send consent is the key trust moment

The app builds a request preview and asks for consent when the destination is remote. This is the right pattern. It still needs careful QA because it is the exact moment where screenshot, window metadata, memory summaries, and monitoring context may leave the device depending on settings.

Follow-ups:

- [ ] For local gateway, confirm no remote consent appears.
- [ ] For hosted/custom gateway, confirm consent appears before sending.
- [ ] Confirm the consent copy lists destination, payload classes, and local-only classes.
- [ ] Confirm Cancel returns the user to a usable state without sending.
- [ ] Confirm maximum privacy remote consent says the request is placeholder-only.

### P2: Keyboard access is mostly plausible, but OCR overlay is mouse-heavy

Most primary actions are native buttons, inputs, selects, textareas, and details controls. That is a solid baseline. The OCR overlay can be dragged over the latest capture, but the keyboard fallback is the numeric region fields in settings. That fallback needs explicit QA because the visual drag affordance may not be enough.

Follow-ups:

- [ ] Run a full keyboard-only path: select window, ask question, send, read response, save journal.
- [ ] Run a keyboard-only OCR path: enable OCR, choose region target, edit left/top/width/height numeric fields, recalibrate.
- [ ] Verify focus outlines are visible on buttons, source options, details summary, and OCR region controls.
- [ ] Confirm selected window state is not color-only; the selected source should be clear by text or state for assistive tech.
- [ ] Consider adding explicit keyboard instructions only where the UI lacks a visible equivalent, such as OCR region editing.

### P2: Screen-reader status updates need explicit checks

Some sections use `aria-label` and errors use `role="alert"`, which is a good start. Dynamic state changes like "Checking...", gateway check results, diagnostics copied, token saved, OCR status, remote consent, and response arrival may still be missed if focus does not move or live regions are absent.

Follow-ups:

- [ ] Screen-reader-test gateway check start, success, auth failure, image failure, and copied report feedback.
- [ ] Screen-reader-test token saved/cleared messages.
- [ ] Screen-reader-test remote consent appearing after asking on a hosted/custom gateway.
- [ ] Screen-reader-test Hermes response arrival and error messages.
- [ ] Add live-region coverage or focus management later if manual testing confirms announcements are missed.

### P2: Color contrast and state styling need regression checks

The UI is dark, compact, and status-heavy. It uses many colored borders/chips for connected, warning, error, memory, trade-history, and policy states. That is appropriate for a companion window, but contrast and color-only meaning need recurring checks.

Follow-ups:

- [ ] Check contrast for small status text, subtle notes, disabled controls, chips, warnings, and diagnostics.
- [ ] Confirm success/failure states are conveyed by words as well as color.
- [ ] Confirm compact text does not truncate important status or selected-window names without another way to inspect them.
- [ ] Test at narrow widths down to the documented minimum window width.

### P3: E2E coverage should protect the trust boundaries first

The manual QA lane is useful now. Later automated coverage should focus on privacy and execution boundaries before polishing lower-risk UI paths.

Future E2E candidates:

- [ ] First-run: local gateway path, hosted gateway auth failure, and completion.
- [ ] Capture: no selected window blocks ask; selected window is required; no hidden full-desktop capture.
- [ ] Privacy: maximum privacy withholds screenshot/window title/memory/monitoring from request payload classes.
- [ ] Remote consent: hosted/custom gateway shows consent; Cancel does not send; Send records request preview.
- [ ] Diagnostics: copied reports are masked and contain no bearer token or screenshot bytes.
- [ ] Keyboard: tab order reaches primary controls, settings controls, diagnostics controls, and journal save.
- [ ] Advisory boundary: no UI path asks for wallet signing, private keys, seed phrases, order placement, or exchange credentials.

## Manual Test Prompts

Use these prompts during beta QA. Keep screenshots and logs local unless they are deliberately sanitized.

- [ ] New tester can explain what DocHermes does after first-run in one sentence.
- [ ] New tester can explain what DocHermes refuses to do: no signing, no wallet control, no order routing, no trade execution.
- [ ] Tester can identify whether the current request goes to local Hermes, hosted Hermes, or a custom gateway.
- [ ] Tester can see what will be sent to Hermes and what stays local.
- [ ] Tester can recover from a bad gateway URL, bad token, image-route failure, and missing screen recording permission.
- [ ] Tester can operate the main ask flow with keyboard only.
- [ ] Tester can use a screen reader to find gateway status, selected window, privacy preset, current error, and latest response.
- [ ] Tester can clear local memory and diagnostics without believing that remote Hermes data was deleted.

## Release-Note Guardrails

- [ ] Do not claim DocHermes is installable until official artifacts, signing/notarization status, checksums, and platform notes are real.
- [ ] Do not describe DocHermes as a trading automation tool.
- [ ] Do not ask testers to send raw screenshots, private credentials, seed phrases, private keys, bearer tokens, or unsanitized account data.
- [ ] Do mention that local development runs and maintainer-created release-candidate builds are the current testing paths.
