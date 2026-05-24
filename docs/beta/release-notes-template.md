# DocHermes Beta Release Notes Template

Use this template for private beta release notes. Keep the notes honest about what was tested, what is missing, and what data may leave the user's machine.

There is no installable DocHermes release yet. Leave install links empty until the packaging issue is complete and release artifacts are produced through the official project release process.

## Release

- Version:
- Date:
- Commit:
- Release channel: Private beta

## What Changed

- Added:
- Changed:
- Fixed:
- Removed:

## Install Links

No installable release is available until packaging is complete.

When packaging is ready, replace this section with official links only:

- macOS:
- Windows:
- Linux AppImage:
- Linux `.deb`:

Do not link ad-hoc local builds, unsigned test artifacts, or files from personal storage.

## Known Limitations

- Packaging/signing status:
- Hermes gateway requirements:
- Hosted endpoint requirements:
- Image capability requirements:
- Platform-specific issues:
- Features intentionally not supported:

DocHermes remains advisory only. It does not control wallets, sign messages, route orders, place trades, submit transactions, or approve withdrawals.

## Privacy Notes

- Local Hermes mode keeps requests on the local gateway you configured.
- Hosted/custom Hermes mode may send questions, selected screenshots, and compact summaries over the internet when your privacy settings allow it.
- Maximum privacy mode should not send real screenshots.
- Local journal, memory, and imported trade history are local beta features unless explicitly included as compact summaries in a Hermes request.
- Debug reports must mask bearer tokens and other secrets before sharing.

Never ask beta users for seed phrases, private keys, exchange credentials, signing approvals, or unsanitized account data.

## Checksums

Publish checksums for every official artifact.

```text
SHA256  <macOS artifact>       <checksum>
SHA256  <Windows artifact>     <checksum>
SHA256  <Linux AppImage>       <checksum>
SHA256  <Linux deb>            <checksum>
```

If checksums are not available, do not publish the release as installable.

## How To Report Bugs

Ask beta testers to include:

- Operating system and version.
- DocHermes version and artifact name.
- Hermes gateway mode: local, hosted, or custom.
- Whether image capability was enabled.
- The exact step that failed.
- The copied DocHermes debug report, with secrets redacted.
- Screenshots only when sanitized and necessary.

Ask beta testers not to include:

- Bearer tokens.
- Private keys or seed phrases.
- Exchange credentials.
- Full account balances or personal trading records.
- Unsanitized screenshots with sensitive data.
