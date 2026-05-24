# DocHermes Known Beta Limitations

DocHermes is an active prototype, not an installable beta. This page tracks what testers should know before spending time on it.

## Release And Install

- No official installer exists yet.
- No public beta download exists yet.
- No published release checksums exist yet.
- Signed and notarized desktop builds are not ready.
- OS-specific install docs should stay blocked until real artifacts exist.

Use local development runs or maintainer-created release-candidate builds only.

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
- Windows may warn about unknown publishers for early unsigned builds.
- Linux desktop capture can vary across Wayland, X11, portals, and sandbox settings.
- AppImage and `.deb` notes are placeholders until real Linux beta artifacts exist.

## Testing Focus

Good beta testing right now means checking:

- First-run clarity.
- Gateway setup clarity.
- Failure messages.
- Privacy settings.
- Selected-window capture behavior.
- Text-only fallback when image input is unavailable.
- Local journal and memory behavior without sharing sensitive data.
