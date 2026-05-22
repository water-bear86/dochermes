# DocHermes Beta Hardening Multi-Agent Plan

> **For Hermes:** Use this plan as the shared coordination document for beta hardening on the single `main` branch. Local Codex owns implementation work in explicit task lanes; local Hermes owns planning, review, verification, and integration guidance unless assigned a code lane.

**Goal:** Harden DocHermes for a beta-ready desktop trading sidecar while keeping one source-of-truth branch: `main`.

**Architecture:** Work in short, low-risk hardening passes with tests first. Codex implements one narrow lane at a time and commits frequently. Hermes reviews diffs, runs validation, updates the plan, and keeps privacy/advisory boundaries intact.

**Tech Stack:** Electron + electron-vite, React, TypeScript, Vitest, localStorage persistence, optional local Hermes API server/OpenAI-compatible endpoint, optional local Codex CLI.

---

## Coordination Rules

1. **One branch only:** all beta hardening happens on `main`.
2. **No blind parallel edits:** before either agent edits files, it claims a lane in this plan or in chat.
3. **Codex implementation lanes:** Codex should touch only the files named in its current prompt unless it discovers a necessary adjacent change and says so in its final summary.
4. **Hermes review lane:** Hermes should avoid editing Codex-owned files while Codex is actively running, except for explicit review fixes after Codex stops.
5. **Commit often:** one commit per completed hardening lane.
6. **Validation gate after every lane:** run at minimum `npm run typecheck && npm test -- --run`; run `npm run build` before handoff or beta tags.
7. **Privacy boundary:** never add wallet control, order routing, signing, private key handling, or trade execution.
8. **Compatibility boundary:** avoid hardcoding Hermes-specific one-off endpoints. Prefer OpenAI-compatible `/v1/chat/completions`, capability discovery, or configurable endpoint modes.

---

## Start Commands, In Order

Run these from your local clone. Terminal names are suggestions.

### 1. Prep the single branch

```bash
cd /path/to/dochermes
git fetch origin --prune
git checkout main
git pull --ff-only origin main
npm install
npm run typecheck
npm test -- --run
```

Expected: clean `main`, dependencies installed, typecheck/tests passing.

### 2. Start local Hermes API server / gateway

Use this if your local Hermes is providing the app-facing OpenAI-compatible API server.

```bash
hermes gateway run
```

If you prefer a configured background service instead:

```bash
hermes gateway status || true
hermes gateway start
hermes gateway status
```

Expected: API server adapter is available at the configured local port, usually `http://127.0.0.1:8642/v1/chat/completions` if enabled.

### 3. Start local Hermes reviewer/planner session

Open a second terminal:

```bash
cd /path/to/dochermes
hermes --skills writing-plans,github-pr-workflow,requesting-code-review,test-driven-development
```

Paste this as the first message:

```text
We are hardening DocHermes for beta on a single branch: main. Read docs/plans/2026-05-22-beta-hardening-multi-agent-plan.md. You are the local Hermes reviewer/planner. Do not edit files while Codex is actively implementing unless I explicitly assign you a code lane. Your job is to keep lanes small, review diffs, run validation, preserve privacy/advisory boundaries, and update the plan when needed.
```

### 4. Start local Codex implementation session

Open a third terminal:

```bash
cd /path/to/dochermes
codex exec --full-auto "Read docs/plans/2026-05-22-beta-hardening-multi-agent-plan.md. Claim Lane 1 only. Implement it test-first, commit when done, and stop. Do not start Lane 2. Preserve the advisory-only/privacy boundary: no wallet control, signing, order routing, private keys, or trade execution. Run npm run typecheck and npm test -- --run before final summary."
```

Expected: Codex implements Lane 1, creates one commit, reports files touched and validation results, then exits.

---

## Lane 1: Beta Smoke Test Harness

**Owner:** Codex

**Objective:** Add a focused smoke test checklist and, where cheap, automated coverage for the highest-risk beta flows.

**Files:**
- Create: `docs/beta-smoke-test.md`
- Modify if needed: existing test files only when adding low-friction regression coverage

**Scope:**
- Document manual smoke steps for:
  - launch app
  - configure local Hermes endpoint
  - ask with screenshot allowed
  - max privacy ask path
  - voice toggle sanity check
  - local journal/memory visibility
  - CSV import sanity path
  - OCR overlay open/adjust/save path
  - wallet sync disabled-by-default sanity check
- Add tests only if there is an obvious missing pure-function regression.
- Do not refactor app architecture.

**Validation:**

```bash
npm run typecheck
npm test -- --run
```

**Commit:**

```bash
git add docs/beta-smoke-test.md <any-test-files>
git commit -m "docs: add beta smoke test checklist"
```

---

## Lane 2: Local Hermes Endpoint Hardening

**Owner:** Codex after Lane 1 review passes

**Objective:** Make local Hermes connection setup harder to misconfigure and easier to diagnose.

**Files:**
- Likely modify: `src/main/hermesClient.ts`
- Likely modify: `src/main/hermesClient.test.ts`
- Likely modify: `src/main/inputValidation.ts`
- Likely modify: `src/main/inputValidation.test.ts`
- Possibly modify: `src/renderer/App.tsx` only for copy/UI diagnostics

**Acceptance Criteria:**
- Local endpoint defaults remain compatible-first.
- Diagnostics clearly distinguish:
  - unreachable server
  - auth required / bad token
  - endpoint mode mismatch
  - invalid JSON / unexpected response shape
- No hard dependency on a custom `/coach` route.
- Tests cover the new diagnostic mapping.

**Validation:**

```bash
npm run typecheck
npm test -- --run src/main/hermesClient.test.ts src/main/inputValidation.test.ts
npm test -- --run
```

**Commit:**

```bash
git add src/main/hermesClient.ts src/main/hermesClient.test.ts src/main/inputValidation.ts src/main/inputValidation.test.ts src/renderer/App.tsx
git commit -m "fix: harden local Hermes endpoint diagnostics"
```

---

## Lane 3: Privacy Mode Regression Pass

**Owner:** Codex after Lane 2 review passes

**Objective:** Lock down maximum privacy behavior so beta users cannot accidentally leak screenshots, window titles, memory context, or monitoring context where the app promises not to.

**Files:**
- Likely modify: `src/renderer/requestPolicy.ts`
- Likely modify: `src/renderer/requestPolicy.test.ts`
- Likely modify: `src/renderer/App.tsx`
- Likely modify: `src/main/inputValidation.test.ts`

**Acceptance Criteria:**
- Maximum privacy path sends only placeholder screenshot data where required by schema.
- UI clearly states what is withheld.
- Memory/monitoring context inclusion is covered by tests for each privacy preset.
- No regression to balanced/full modes.

**Validation:**

```bash
npm run typecheck
npm test -- --run src/renderer/requestPolicy.test.ts src/main/inputValidation.test.ts
npm test -- --run
```

**Commit:**

```bash
git add src/renderer/requestPolicy.ts src/renderer/requestPolicy.test.ts src/renderer/App.tsx src/main/inputValidation.test.ts
git commit -m "fix: lock down maximum privacy request behavior"
```

---

## Lane 4: Local Data Controls + Export/Reset Clarity

**Owner:** Codex after Lane 3 review passes

**Objective:** Make beta local data controls explicit and safe: users should understand what is stored locally and have obvious reset/clear actions.

**Files:**
- Likely modify: `src/renderer/App.tsx`
- Likely modify: `src/renderer/journal.ts`
- Likely modify: `src/renderer/journal.test.ts`
- Likely modify: `src/renderer/localSettings.ts`
- Likely modify: `src/renderer/localSettings.test.ts`

**Acceptance Criteria:**
- Clear user-facing copy for locally stored data categories.
- Existing clear actions are visible and confirmation-protected where destructive.
- No remote data deletion claims unless actually implemented.
- Tests cover local clear helpers where possible.

**Validation:**

```bash
npm run typecheck
npm test -- --run src/renderer/journal.test.ts src/renderer/localSettings.test.ts
npm test -- --run
```

**Commit:**

```bash
git add src/renderer/App.tsx src/renderer/journal.ts src/renderer/journal.test.ts src/renderer/localSettings.ts src/renderer/localSettings.test.ts
git commit -m "fix: clarify local data controls for beta"
```

---

## Lane 5: Error Boundary and Offline UX Pass

**Owner:** Codex after Lane 4 review passes

**Objective:** Reduce beta faceplants when local Hermes is offline, OCR dependencies fail, browser extension context is unavailable, or localStorage contains stale data.

**Files:**
- Likely modify: `src/renderer/App.tsx`
- Likely modify: `src/main/main.ts`
- Likely modify: `src/main/main.test.ts`
- Likely modify: `src/main/ocr.ts`

**Acceptance Criteria:**
- User-facing errors are actionable and non-scary.
- Local Hermes offline state suggests checking gateway/API server instead of implying data loss.
- OCR unavailable/degraded path does not crash the app.
- Corrupt localStorage values fall back safely.

**Validation:**

```bash
npm run typecheck
npm test -- --run src/main/main.test.ts src/renderer/localSettings.test.ts
npm test -- --run
npm run build
```

**Commit:**

```bash
git add src/renderer/App.tsx src/main/main.ts src/main/main.test.ts src/main/ocr.ts src/renderer/localSettings.test.ts
git commit -m "fix: improve beta offline and degraded-mode UX"
```

---

## Lane 6: Beta Release Gate

**Owner:** Hermes/reviewer after all implementation lanes pass

**Objective:** Produce a go/no-go summary for beta hardening.

**Steps:**

```bash
git status --short --branch
npm run typecheck
npm test -- --run
npm run build
```

Then manually execute `docs/beta-smoke-test.md` and record:
- OS
- app launch result
- local Hermes endpoint result
- privacy mode result
- known beta blockers
- known beta caveats

**Commit if docs updated:**

```bash
git add docs/beta-smoke-test.md docs/plans/2026-05-22-beta-hardening-multi-agent-plan.md
git commit -m "docs: record beta hardening release gate"
```

---

## Local Hermes Endpoint Notes

DocHermes should prefer configurable/OpenAI-compatible Hermes access:

- Default local base URL: `http://127.0.0.1:8642`
- Preferred route: `/v1/chat/completions`
- Expected response: OpenAI-compatible `choices[0].message.content`
- Avoid assuming custom routes like `/coach` unless explicitly selected by endpoint mode.

If API server auth is enabled, beta docs must tell the user where to put the bearer token in DocHermes settings.

---

## Stop Conditions

Stop and ask before continuing if any lane discovers:

- Need for wallet/private-key/order-routing integration
- Need to change Hermes Agent config globally
- Need to delete user data without an explicit confirmation flow
- Test failures outside the lane that look unrelated
- Merge conflict or dirty worktree from another local agent
