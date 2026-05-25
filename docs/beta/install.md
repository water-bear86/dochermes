# DocHermes Private Beta Install Notes

DocHermes is still not ready for normal installation or production trading. These notes are only for maintainers and invited testers using official private beta release-candidate artifacts from the project release channel.

Do not install a DocHermes build from a random file share, DM, chat attachment, or personal storage link. Use the GitHub release artifact and checksum that came from this repo.

DocHermes is advisory only. It does not control wallets, sign messages, route orders, place trades, submit transactions, approve withdrawals, or ask for private keys.

## Before You Install

- Confirm the artifact came from an official private beta GitHub release or maintainer handoff.
- Confirm there is a matching `SHA256SUMS.txt` file.
- Confirm the release notes say the build is unsigned unless signing is explicitly marked as verified.
- Confirm you have a Hermes gateway available. DocHermes connects to Hermes; it does not configure provider models itself.
- Do not use the app with real money until the beta has been explicitly cleared for that use.

Default local Hermes gateway:

```text
http://localhost:8642
```

Default compatibility route:

```text
POST /v1/chat/completions
```

## Verify Checksums

From the folder containing the downloaded artifact and `SHA256SUMS.txt`:

macOS or Linux:

```bash
shasum -a 256 -c SHA256SUMS.txt
```

If Linux uses `sha256sum`:

```bash
sha256sum -c SHA256SUMS.txt
```

Windows PowerShell:

```powershell
Get-FileHash .\DocHermes*.exe -Algorithm SHA256
Get-FileHash .\DocHermes*.zip -Algorithm SHA256
```

Compare the output to `SHA256SUMS.txt`. If the checksum does not match, stop and report it.

## macOS

Expected artifacts:

- `.dmg`
- `.zip`

Install path:

1. Verify the checksum first.
2. Open the `.dmg` and drag DocHermes to `Applications`, or unzip the `.zip` and move the app yourself.
3. Launch DocHermes.
4. If macOS blocks the unsigned beta, use `System Settings -> Privacy & Security` to review the blocked app, or right-click the app and choose `Open`.
5. When capture is needed, grant Screen Recording permission for DocHermes.
6. Quit and reopen DocHermes after changing Screen Recording permission.

Expected beta friction:

- Gatekeeper may warn because early builds are unsigned or not notarized.
- Screen Recording permission may attach to Terminal instead of DocHermes if you launched a local dev build.
- Capture may not work until the app is restarted after permission changes.

## Windows

Expected artifacts:

- `.exe`
- `.zip`

Install path:

1. Verify the checksum first.
2. Run the `.exe`, or unzip the `.zip` and launch DocHermes from the unpacked folder.
3. If SmartScreen warns about an unknown publisher, confirm the artifact and checksum before continuing.
4. Start or configure your Hermes gateway.
5. In DocHermes, open settings and run `Test gateway`.

Expected beta friction:

- SmartScreen may show unknown-publisher warnings.
- Antivirus tools may scan or delay first launch.
- Local firewall rules can block a non-default Hermes gateway port.

## Linux

Expected artifacts:

- `.AppImage`
- `.deb`
- `.tar.gz`

AppImage path:

```bash
chmod +x DocHermes-*.AppImage
./DocHermes-*.AppImage
```

Debian/Ubuntu `.deb` path:

```bash
sudo apt install ./dochermes*.deb
```

Archive path:

```bash
tar -xzf DocHermes-*.tar.gz
```

Expected beta friction:

- AppImage launch may require FUSE support.
- Wayland capture can depend on desktop portal support.
- X11 and Wayland can behave differently for window capture.
- Some desktop environments need `xdg-desktop-portal` packages for capture prompts.

## First Launch Checklist

- Open DocHermes.
- Confirm the footer says it is platform agnostic and read-only.
- Open settings.
- Confirm the Hermes gateway URL.
- Click `Test gateway`.
- Pair a trading window only when you are ready to capture it.
- Ask a text question before doing any real trading work.
- Confirm the trade card says DocHermes records coaching decisions only and cannot route, sign, or execute trades.

## If Something Looks Wrong

Stop and report it if DocHermes:

- Asks for a private key, seed phrase, wallet approval, exchange credential, or bearer token in a bug report.
- Claims it can place trades.
- Tries to route or sign a transaction.
- Captures a window you did not select.
- Sends data to a remote endpoint without consent.

Use [troubleshooting](troubleshooting.md) and the [tester feedback template](tester-feedback-template.md) for bug reports.
