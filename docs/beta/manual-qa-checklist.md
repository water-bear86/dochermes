# DocHermes Beta Manual QA Checklist

Use this lightweight checklist before publishing beta release notes or handing a release candidate to testers. For detailed product flow coverage, run the full smoke test in `docs/beta-smoke-test.md`.

There is no installable DocHermes release yet. Until packaging is complete, mark installer checks as `Blocked` unless you are validating a maintainer-created local release-candidate build.

## Release Candidate Info

- Date:
- Tester:
- Operating system:
- Build source:
- Commit:
- Hermes gateway mode:

## Checklist

| Area | Result | Notes |
| --- | --- | --- |
| Official artifact exists | Blocked | No installable release until packaging is complete. |
| Artifact checksum published | Blocked | Required before install links are shared. |
| App launches | Not run | Use local dev run or release-candidate build. |
| Local Hermes connection test | Not run | Default gateway is `http://localhost:8642`. |
| Hosted Hermes auth failure is clear | Not run | Token errors should not expose secrets. |
| Image capability failure is clear | Not run | Text-only fallback should stay usable. |
| Window capture requires selection | Not run | No hidden full-desktop capture. |
| macOS Screen Recording path checked | Not run | Required for macOS capture testing. |
| Windows SmartScreen note checked | Not run | Expected for unsigned beta artifacts. |
| Linux AppImage permission note checked | Not run | `chmod +x` and sandbox/portal notes are documented. |
| Privacy boundary checked | Not run | No wallet control, signing, order routing, or trade execution. |
| Bug report path checked | Not run | Reports should redact tokens and sensitive account data. |

Use `Pass`, `Fail`, or `Blocked` in the Result column.

## Sign-Off Notes

- Blocking issues:
- Known limitations to include in release notes:
- Privacy or no-execution concerns:
- Follow-up owner:

Before sign-off, confirm that release notes do not contain unofficial install links and do not ask testers to share private credentials, seed phrases, bearer tokens, or unsanitized financial data.
