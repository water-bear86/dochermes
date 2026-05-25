# DocHermes Beta Troubleshooting

DocHermes is a read-only trading coach sidecar. It can inspect context you choose to share, but it must not ask for private keys, seed phrases, wallet control, signing, withdrawals, order routing, or trade execution.

There is no public installable DocHermes release yet. Private beta testing is limited to local development runs or official release-candidate builds made by the project maintainers.

## Quick Support Checklist

- Confirm the tester is not using an unofficial installer or artifact.
- Confirm private beta artifacts came from the project release channel and match the published checksums.
- Confirm whether they are using local, hosted, custom, or fake Hermes.
- Confirm `Test gateway` has been run.
- Confirm screenshots, logs, and debug reports are sanitized before sharing.
- Confirm no private keys, seed phrases, exchange credentials, bearer tokens, wallet approvals, or account records are included.
- Confirm the issue does not involve wallet control, signing, order routing, withdrawals, or trade execution. If it does, treat it as a blocker.

See [tester support checklist](tester-support-checklist.md) and [tester feedback template](tester-feedback-template.md) for support handoffs.

## Local Fake Hermes

For contributors and reviewers, the fake Hermes server can help test gateway setup without a real provider:

```bash
npm run fake:hermes
```

Then start DocHermes in development mode:

```bash
npm run dev
```

Fake Hermes is only for local UI and request-flow checks. It is not a real coaching model and it is not an end-user install path.

## Hermes Is Not Running

If DocHermes says Hermes is disconnected, unreachable, or timed out:

1. Start your Hermes gateway first.
2. Confirm the local gateway URL in DocHermes settings.
3. Use the default local URL unless your gateway is configured differently:

   ```text
   http://localhost:8642
   ```

4. Click `Test gateway` again.

DocHermes expects an OpenAI-compatible Hermes API Server route by default:

```text
POST /v1/chat/completions
```

If you are using a custom adapter, make sure the configured endpoint mode matches that adapter. The old prototype `/coach` route is not the default Hermes API Server route.

The copyable gateway debug report includes a `Recovery suggestions` section. Use that first when triaging common local failures such as a stopped gateway, wrong port, dashboard URL, adapter mismatch, bad bearer token, invalid JSON, timeout, or text-only/image-capability mismatch.

## Hosted Auth Errors

Hosted Hermes endpoints should require bearer auth. If you see `401`, `403`, `auth required`, or `bad token`:

1. Confirm the hosted gateway URL is correct.
2. Confirm the bearer token was copied without spaces or shell quotes.
3. Rotate the token if it may have been shared.
4. Re-test the gateway after updating the token.

Hosted Hermes may receive screenshots and compact local summaries when your privacy settings allow it. Use hosted endpoints only when you are comfortable sending that request data over the internet. Never paste private keys, seed phrases, exchange credentials, or signing prompts into DocHermes.

## No Image Capability

If text requests work but screenshot requests fail, the configured Hermes route or provider may not support image input.

Try this:

1. Click `Test gateway` and check whether image capability is reported.
2. Switch to a Hermes profile/provider that supports multimodal chat.
3. Use the maximum privacy path or ask a text-only question until image support is available.

DocHermes should remain usable as a text-only coach when image input is unavailable. It should not fall back to hidden capture or bypass your selected privacy preset.

## No Capturable Windows

DocHermes requires explicit window selection for capture. If no windows appear:

1. Open the trading, chart, browser, or test window you want to inspect.
2. Make sure it is not minimized.
3. Re-open capture selection in DocHermes.
4. Restart DocHermes if the window list is stale.

If capture still fails, check the operating-system permissions below. DocHermes should not silently capture the full desktop when a selected window is unavailable.

## macOS Screen Recording Permission

macOS requires Screen Recording permission before Electron apps can capture windows.

1. Open `System Settings`.
2. Go to `Privacy & Security`.
3. Open `Screen Recording`.
4. Enable permission for DocHermes, Terminal, or the local development host you used to launch the app.
5. Quit and restart DocHermes.

If you launched DocHermes from a terminal during local development, macOS may attach the permission to the terminal app instead of DocHermes.

## Windows SmartScreen

Early beta builds may be unsigned until packaging and signing are complete. Windows SmartScreen can warn about unknown publishers or uncommon downloads.

Do not install a build unless it came from the official project release channel and the published checksum matches. If you trust the build, SmartScreen usually provides a `More info` path to continue.

No public Windows beta exists yet, so any installer-like file outside the official private beta release channel should be treated as unofficial.

## Linux AppImage Permissions And Sandbox Notes

For AppImage builds, Linux may require the executable bit:

```bash
chmod +x DocHermes-*.AppImage
```

Some distributions also require FUSE support for AppImage launch. If FUSE is unavailable, use the project-provided `.deb` or unpacked test build when one exists.

If Electron sandboxing or desktop capture fails, check your desktop environment and portal support. Wayland sessions can have stricter capture behavior than X11, and some setups require xdg-desktop-portal packages.

No public Linux beta exists yet. Treat any AppImage, `.deb`, or archive outside the official private beta release channel as unofficial.

## Privacy And Execution Boundary

When reporting a bug, include the operating system, DocHermes build source, Hermes gateway mode, and copied debug report if available. Remove tokens, wallet addresses, screenshots, account balances, and trade history unless the maintainer explicitly asks for a sanitized sample.

DocHermes is advisory only. A correct beta build does not place trades, route orders, sign wallet messages, submit transactions, approve withdrawals, or ask for private credentials.
