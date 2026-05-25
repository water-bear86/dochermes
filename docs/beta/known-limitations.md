# DocHermes Known Beta Limitations

DocHermes is an active prototype, not a public installable beta. This page tracks what testers should know before spending time on it.

## Release And Install

- Private release-candidate artifacts may exist for invited testers.
- No public beta download exists yet.
- Official private beta artifacts must include checksums.
- Signed and notarized desktop builds are not ready.
- OS-specific install notes are available for official private beta artifacts only.

Use local development runs or official maintainer-created release-candidate builds only. See [private beta install notes](install.md).

## Hermes Gateway

- DocHermes expects a Hermes gateway instead of talking directly to a model provider.
- The default local URL is `http://localhost:8642`.
- The default compatibility route is `POST /v1/chat/completions`.
- Hosted/custom gateways may send allowed request data over the internet.
- Image support depends on the configured Hermes route and provider.
- Fake Hermes is for local UI and gateway-flow testing only.

## Privacy

- Capture is user initiated and should require an explicit selected window.
- Privacy settings control whether screenshots, metadata, summaries, and monitoring context can leave the machine.
- Local journal and memory features are still beta surfaces.
- Debug reports and support notes must be reviewed before sharing.

Never share private keys, seed phrases, exchange credentials, bearer tokens, unsanitized account data, or raw screenshots with sensitive trading information.

## Advisory Boundary

DocHermes is not a trading bot, wallet, exchange client, order router, signing tool, or source of financial advice.

It does not:

- Place trades.
- Route orders or swaps.
- Sign wallet messages.
- Submit transactions.
- Approve withdrawals.
- Control wallets.
- Hold private keys.

If a beta build appears to ask for wallet control, signing access, order-routing access, or private credentials, stop testing and report it as a blocker.

## Platform Notes

- macOS capture may require Screen Recording permission for DocHermes, Terminal, or the local development host.
- Push-to-talk depends on the packaged desktop add-on for global hotkeys and on browser/OS speech recognition for current transcription. If speech recognition is missing, Auto mode falls back to typed questions.
- Windows may warn about unknown publishers for early unsigned builds.
- Linux desktop capture can vary across Wayland, X11, portals, and sandbox settings.
- AppImage, `.deb`, and `.tar.gz` artifacts are private beta candidates until a public release is approved.

## Testing Focus

Good beta testing right now means checking:

- First-run clarity.
- Gateway setup clarity.
- Failure messages.
- Privacy settings.
- Selected-window capture behavior.
- Text-only fallback when image input is unavailable.
- Local journal and memory behavior without sharing sensitive data.
