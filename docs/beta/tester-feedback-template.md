# DocHermes Tester Feedback Template

Use this template for beta feedback, bug reports, and support handoffs. Keep it short, specific, and sanitized.

Do not include private keys, seed phrases, exchange credentials, bearer tokens, wallet approvals, full account balances, personal trading records, or unsanitized screenshots.

## Summary

- What happened:
- What you expected:
- How serious it feels: Blocker / Major / Minor / Question

## Environment

- Operating system and version:
- DocHermes source: local dev / release-candidate build / commit SHA
- Hermes mode: local / hosted / custom / fake Hermes
- Gateway URL type: localhost / hosted / private network
- Text requests worked: Yes / No / Not tested
- Image requests worked: Yes / No / Not tested
- Privacy preset:

## Steps To Reproduce

1. First step:
2. Second step:
3. Third step:

## What You Saw

- Error message, with secrets removed:
- Area of the app:
- Did restarting DocHermes help:
- Did running `Test gateway` help:

## Sanitized Attachments

Only attach files that have been checked for secrets and sensitive trading data.

- Screenshot attached: Yes / No
- Debug report attached: Yes / No
- Logs attached: Yes / No
- Notes about what was removed:

## Safety Boundary Check

Answer these before sending:

- [ ] I did not include a seed phrase or private key.
- [ ] I did not include exchange credentials or API secrets.
- [ ] I did not include a bearer token.
- [ ] I did not include unsanitized wallet, exchange, or account screenshots.
- [ ] I did not include full account balances or personal trading history.
- [ ] DocHermes did not ask me to sign, approve, withdraw, route an order, or execute a trade.

If DocHermes did ask for signing, wallet control, order routing, private credentials, or trade execution, mark the report as a blocker and stop testing that build.
