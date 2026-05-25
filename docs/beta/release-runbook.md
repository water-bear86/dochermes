# DocHermes Beta Release Runbook

DocHermes beta releases are for maintainers and invited testers only. The app is not ready for normal install, production trading, or production support.

## Release Boundary

- Treat every beta release as advisory-only test software.
- Artifacts are unsigned unless the release notes explicitly say otherwise.
- Do not publish a release without checksums for every attached artifact.
- Do not ask testers for bearer tokens, private keys, seed phrases, exchange credentials, unsanitized screenshots, or private account data.
- DocHermes does not control wallets, sign messages, route orders, place trades, submit transactions, approve withdrawals, or hold private keys.

## Tag Format

Use beta semver tags:

```bash
v0.1.0-beta.1
v0.1.0-beta.2
```

Do not use a plain production tag such as `v1.0.0` for beta handoff. The package workflow's draft prerelease job only runs for tags that match `vX.Y.Z-beta.N`.

## Preflight

Run local checks before tagging:

```bash
npm ci
npm run typecheck
npm test -- --run
npm run build
```

Review the beta caveats before sharing anything:

- [Known beta limitations](known-limitations.md)
- [Private beta install notes](install.md)
- [Release notes template](release-notes-template.md)
- [Manual QA checklist](manual-qa-checklist.md)

## Tag A Beta

Create an annotated tag on the commit you want to package:

```bash
git switch main
git pull --ff-only
git status --short
git tag -a v0.1.0-beta.1 -m "DocHermes v0.1.0-beta.1"
git push origin v0.1.0-beta.1
```

Pushing the tag starts the `Package` workflow. It builds Windows, macOS, and Linux artifacts, generates `SHA256SUMS.txt` files, uploads the package artifacts, then creates a GitHub draft prerelease marked as both draft and prerelease.

## Manual Draft Prerelease

Use this only when the tag already exists and you need to rerun packaging:

```bash
gh workflow run package.yml \
  -f create_draft_release=true \
  -f tag_name=v0.1.0-beta.1
```

The manual tag must already exist in git and must match `vX.Y.Z-beta.N`.

## Before Publishing The Draft

Keep the GitHub release as a draft until a maintainer has checked:

- The release is marked `Pre-release`.
- The notes say the artifacts are unsigned beta builds unless signing has been verified.
- The notes say there is no production support.
- The notes repeat the advisory boundary: no wallet control, signing, routing, or execution.
- Every platform attachment has a matching checksum file.
- No bug-report instructions request private credentials or unsanitized sensitive data.

If any item is missing, edit the draft or delete it and rerun the workflow.
