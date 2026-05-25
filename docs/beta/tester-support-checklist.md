# DocHermes Beta Tester Support Checklist

DocHermes is not ready for public install yet. There is no stable public installer, no public beta download, and no production support channel. Use this page for local development runs, official maintainer-created release-candidate builds, and support triage while the beta is being shaped.

DocHermes is advisory only. It does not control wallets, sign messages, route orders, place trades, submit transactions, approve withdrawals, or ask for private keys.

## Before Testing

- [ ] Confirm you are using a local development run or an official maintainer-created release-candidate build.
- [ ] Confirm any install link points to the project release channel and has matching checksums.
- [ ] Confirm the tester understands DocHermes is not financial advice and should not drive live trading decisions.
- [ ] Confirm the tester has a Hermes gateway plan: local, hosted, custom, or fake Hermes for development.
- [ ] Confirm no private keys, seed phrases, exchange credentials, bearer tokens, or unsanitized account data will be shared.
- [ ] Confirm any screenshot used for a bug report is sanitized first.

## What DocHermes Is Today

- A desktop sidecar for risk coaching and workflow review.
- A selected-window capture flow that should only inspect the window the user chooses.
- A Hermes gateway client for text and optional image context.
- A local journal and memory prototype for notes, summaries, and behavior patterns.
- A read-only helper. The user acts in their own trading platform if they choose to act.

## What Is Blocked

- Public installable beta artifacts.
- Any release artifact without a published checksum.
- Signed and notarized desktop builds.
- Production support guarantees.

Until those are done, do not tell testers to install DocHermes as a finished beta. For private artifacts, use [private beta install notes](install.md).

## Local Dev And Fake Hermes

For contributors and reviewers only:

```bash
npm install
npm run fake:hermes
npm run dev
```

The fake Hermes server is useful for UI and gateway-flow testing. It is not a real model provider and should not be used to judge trading quality.

Default local gateway:

```text
http://localhost:8642
```

Default compatibility route:

```text
POST /v1/chat/completions
```

## Reporting Issues

Ask testers to include:

- [ ] Operating system and version.
- [ ] DocHermes build source: local dev, release-candidate build, or commit SHA.
- [ ] Hermes gateway mode: local, hosted, custom, or fake Hermes.
- [ ] Whether text requests worked.
- [ ] Whether image requests worked.
- [ ] The exact step that failed.
- [ ] The visible error message, with secrets removed.
- [ ] A sanitized screenshot only if it helps explain the issue.

Ask testers not to include:

- [ ] Seed phrases or private keys.
- [ ] Wallet approvals, signing prompts, or recovery material.
- [ ] Exchange credentials or API secrets.
- [ ] Bearer tokens or hosted Hermes credentials.
- [ ] Full account balances, personal trading records, or tax records.
- [ ] Unsanitized screenshots of wallets, exchanges, chats, or dashboards.

## Support Triage

- [ ] If Hermes is unreachable, check the gateway URL and run `Test gateway`.
- [ ] If hosted auth fails, check for a bad token and rotate it if it may have leaked.
- [ ] If screenshot requests fail but text works, treat it as an image capability or permission issue.
- [ ] If no windows appear for capture, check that the target window is open and not minimized.
- [ ] If macOS capture fails, check Screen Recording permission for DocHermes or the terminal used to launch it.
- [ ] If a tester asks whether DocHermes can execute a trade, answer no.
- [ ] If a tester reports wallet, signing, withdrawal, or order-routing behavior, treat it as a blocker.

## Data Boundary

DocHermes can send questions, selected screenshots, selected-window metadata, compact summaries, and monitoring context to Hermes when settings allow it. Maximum privacy mode should withhold real screenshots, window metadata, memory context, and monitoring context.

DocHermes should never request or require private keys, seed phrases, exchange credentials, wallet control, signing approval, withdrawal approval, or trade execution access.
