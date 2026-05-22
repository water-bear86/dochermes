# DocHermes Beta ASAP Cross-Platform Installers Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Get DocHermes to a private beta that normal users can install on Windows, macOS, and Linux as quickly as possible while preserving the privacy-first trading-coach posture.

**Architecture:** Split work into parallel agent lanes with clear ownership. Use Electron's existing Vite build as the app build input, add an Electron packaging toolchain, add first-run and secure-storage hardening required for beta trust, and add smoke tests/CI so each installer can be validated before release.

**Tech Stack:** Electron, electron-vite, React, TypeScript, Vitest, electron-builder, GitHub Actions, OS keychain/safeStorage where available.

---

## Coordination Model

### Top-level agents

Run these agents in parallel. Each top-level agent may spawn subagents for implementation, spec review, and code quality review.

1. **Release/Packaging Agent**
   - Owns Windows/macOS/Linux installers and local package commands.
   - Must not change app behavior except package metadata/assets.

2. **CI/Release Automation Agent**
   - Owns GitHub Actions, artifact upload, release draft workflow, and build verification.
   - Depends on the packaging commands created by Release/Packaging.

3. **First-Run UX Agent**
   - Owns onboarding/wizard path: Hermes connection, endpoint testing, window pairing, privacy disclosure.
   - Must coordinate with Security/Privacy on copy and consent.

4. **Security/Privacy Agent**
   - Owns bearer token storage, data controls, debug redaction, and hosted-endpoint warnings.
   - Must review any code that stores/transmits tokens or screenshots.

5. **E2E/QA Agent**
   - Owns fake Hermes server, end-to-end smoke tests, manual beta checklist, and failure-mode test coverage.
   - Must validate outputs from all other lanes.

6. **Docs/Beta Ops Agent**
   - Owns README beta install docs, troubleshooting, known limitations, release notes template, and beta tester instructions.

### Branching rules

- Each top-level agent gets its own branch:
  - `beta/packaging-installers`
  - `beta/release-ci`
  - `beta/first-run-wizard`
  - `beta/security-privacy-storage`
  - `beta/e2e-smoke-tests`
  - `beta/beta-docs`
- No agent touches another agent's branch.
- If two lanes need the same file, one lane owns the file and the other opens a small follow-up branch after merge.
- Integration branch: `beta/asap-integration`.
- Merge order recommendation:
  1. Packaging
  2. Security/privacy storage
  3. First-run wizard
  4. E2E smoke tests
  5. CI/release automation
  6. Docs/beta ops

### Required review gates for every top-level lane

For each task group:

1. Implementer subagent does the task.
2. Spec reviewer subagent checks exact acceptance criteria.
3. Code quality/security reviewer subagent checks maintainability, privacy, and platform safety.
4. Top-level agent runs the exact verification commands.
5. Top-level agent commits and summarizes.

---

## Beta Acceptance Criteria

DocHermes private beta is ready when all are true:

- Windows install method exists: `.exe` installer and/or portable `.zip` artifact.
- macOS install method exists: `.dmg` and/or `.zip` artifact.
- Linux install method exists: AppImage and `.deb` artifact.
- A non-developer can launch the app and complete first-run setup.
- User can connect to local Hermes API Server at `http://localhost:8642`.
- User can opt into hosted/custom Hermes with bearer auth and clear screenshot-sharing disclosure.
- Bearer token is not stored as plain JSON in app local settings.
- User can clear local journal/memory and remove hosted credentials.
- Fake-Hermes smoke test verifies at least text ask, image ask, auth failure, and image-capability failure.
- CI builds packages for all three OS families or documents exactly which artifacts require local signing hardware/credentials.
- README has install instructions per OS and clear beta limitations.

---

# Lane 1: Release/Packaging Agent

## Task 1.1: Add electron-builder and package metadata

**Objective:** Introduce a cross-platform packaging tool without changing app runtime behavior.

**Files:**
- Modify: `package.json`
- Create: `build/` assets if needed
- Possibly create: `electron-builder.yml` or `builder.config.cjs`

**Steps:**

1. Install dev dependency:
   ```bash
   npm install --save-dev electron-builder
   ```
2. Add package metadata in `package.json`:
   - `productName`: `DocHermes`
   - stable `appId`, e.g. `com.dochermes.app`
   - `author`
   - `homepage`
3. Add scripts:
   ```json
   {
     "package": "npm run build && electron-builder --dir",
     "dist": "npm run build && electron-builder",
     "dist:win": "npm run build && electron-builder --win nsis zip",
     "dist:mac": "npm run build && electron-builder --mac dmg zip",
     "dist:linux": "npm run build && electron-builder --linux AppImage deb zip"
   }
   ```
4. Configure included files:
   - `out/**`
   - `package.json`
   - exclude `src/**`, `node_modules/.vite/**`, tests, docs unless needed.
5. Verification:
   ```bash
   npm run typecheck
   npm test -- --run
   npm run package
   ```
6. Commit:
   ```bash
   git add package.json package-lock.json electron-builder.yml build
   git commit -m "build: add electron-builder packaging config"
   ```

**Acceptance Criteria:**
- `npm run package` creates an unpacked desktop app locally.
- No app behavior changes.
- Existing tests still pass.

## Task 1.2: Add Windows install artifact config

**Objective:** Produce Windows beta artifacts.

**Files:**
- Modify: `electron-builder.yml` or builder config
- Add: `build/icon.ico` if missing

**Steps:**

1. Configure Windows target:
   - `nsis`
   - `zip`
2. Configure installer settings:
   - one-click false for beta, or one-click true if speed matters
   - per-machine false
   - allow install directory change true
3. Add icon placeholder if no final icon exists.
4. Verification on Windows runner later:
   ```bash
   npm run dist:win
   ```
5. Commit:
   ```bash
   git add .
   git commit -m "build: configure Windows installer artifacts"
   ```

**Acceptance Criteria:**
- CI or local Windows runner produces `.exe` and `.zip` artifacts.
- Artifact names include version and platform.

## Task 1.3: Add macOS install artifact config

**Objective:** Produce macOS beta artifacts.

**Files:**
- Modify: `electron-builder.yml` or builder config
- Add: `build/icon.icns` if missing

**Steps:**

1. Configure macOS targets:
   - `dmg`
   - `zip`
2. Set category: `public.app-category.finance` or `public.app-category.productivity`.
3. For ASAP private beta, allow unsigned local artifacts initially.
4. Add TODO block for future signing/notarization variables:
   - `APPLE_ID`
   - `APPLE_APP_SPECIFIC_PASSWORD`
   - `APPLE_TEAM_ID`
   - certificate import secret
5. Verification on macOS runner later:
   ```bash
   npm run dist:mac
   ```
6. Commit:
   ```bash
   git add .
   git commit -m "build: configure macOS beta artifacts"
   ```

**Acceptance Criteria:**
- CI or local macOS runner produces `.dmg` and `.zip` artifacts.
- Docs clearly say unsigned beta may require right-click Open until signing is configured.

## Task 1.4: Add Linux install artifact config

**Objective:** Produce Linux beta artifacts.

**Files:**
- Modify: `electron-builder.yml` or builder config
- Add: `build/icon.png` if missing

**Steps:**

1. Configure Linux targets:
   - `AppImage`
   - `deb`
   - optional `zip`
2. Add desktop category:
   - `Finance` or `Utility`
3. Add maintainer metadata.
4. Verification on Linux:
   ```bash
   npm run dist:linux
   ```
5. Commit:
   ```bash
   git add .
   git commit -m "build: configure Linux installer artifacts"
   ```

**Acceptance Criteria:**
- Linux build produces `.AppImage` and `.deb`.
- App launches from unpacked build at minimum.

---

# Lane 2: CI/Release Automation Agent

## Task 2.1: Add basic CI for typecheck/test/build

**Objective:** Prevent broken main branch before packaging work lands.

**Files:**
- Create: `.github/workflows/ci.yml`

**Steps:**

1. Add workflow on pull_request and push to main.
2. Use Node 22 or current project-supported LTS.
3. Commands:
   ```bash
   npm ci
   npm run typecheck
   npm test -- --run
   npm run build
   ```
4. Commit:
   ```bash
   git add .github/workflows/ci.yml
   git commit -m "ci: add test and build workflow"
   ```

**Acceptance Criteria:**
- CI runs on PRs.
- CI catches typecheck/test/build failures.

## Task 2.2: Add cross-platform package workflow

**Objective:** Build Windows, macOS, and Linux artifacts in CI.

**Files:**
- Create: `.github/workflows/package.yml`

**Steps:**

1. Add matrix:
   - `windows-latest` -> `npm run dist:win`
   - `macos-latest` -> `npm run dist:mac`
   - `ubuntu-latest` -> `npm run dist:linux`
2. Upload `dist/**` as artifacts.
3. Trigger manually with `workflow_dispatch` and on tags `v*`.
4. Commit:
   ```bash
   git add .github/workflows/package.yml
   git commit -m "ci: add cross-platform packaging workflow"
   ```

**Acceptance Criteria:**
- Manual workflow creates artifacts for all OSes.
- Artifacts are downloadable from GitHub Actions.

## Task 2.3: Add release draft workflow

**Objective:** Make beta releases easy to publish.

**Files:**
- Modify: `.github/workflows/package.yml` or create `.github/workflows/release.yml`

**Steps:**

1. On tag `v*`, build packages.
2. Upload artifacts to a GitHub Release draft/prerelease.
3. Mark release as `prerelease: true` for beta.
4. Include checksum generation:
   ```bash
   shasum -a 256 dist/* > dist/SHA256SUMS.txt
   ```
5. Commit:
   ```bash
   git add .github/workflows
   git commit -m "ci: draft beta releases with installer artifacts"
   ```

**Acceptance Criteria:**
- Tagging `v0.x.y-beta.n` creates draft prerelease with installers and checksums.

---

# Lane 3: First-Run UX Agent

## Task 3.1: Add first-run state model

**Objective:** Track whether the user has completed initial setup.

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/localSettings.ts`
- Test: `src/renderer/localSettings.test.ts`

**Steps:**

1. Add `setupCompleted: boolean` or `setup: { completedAt?: string }` to `LocalSettings`.
2. Default to incomplete.
3. Preserve backwards compatibility for old settings.
4. Add tests for parse/write defaults and migration.
5. Verification:
   ```bash
   npm test -- --run src/renderer/localSettings.test.ts
   ```
6. Commit:
   ```bash
   git add src/shared/types.ts src/renderer/localSettings.ts src/renderer/localSettings.test.ts
   git commit -m "feat: track first-run setup state"
   ```

**Acceptance Criteria:**
- Existing users get sane defaults.
- Settings serialization remains stable.

## Task 3.2: Build first-run wizard shell

**Objective:** Show setup wizard before the main coach flow until completed.

**Files:**
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/FirstRunWizard.tsx`
- Modify: `src/renderer/styles.css`

**Steps:**

1. Extract minimal wizard component with steps:
   - Welcome/privacy promise
   - Hermes connection
   - Window pairing
   - Ready
2. Add skip/finish behavior for dev users.
3. Keep main app reachable after completion.
4. Verification:
   ```bash
   npm run typecheck
   npm test -- --run
   ```
5. Commit:
   ```bash
   git add src/renderer/App.tsx src/renderer/FirstRunWizard.tsx src/renderer/styles.css
   git commit -m "feat: add first-run setup wizard shell"
   ```

**Acceptance Criteria:**
- Fresh settings show wizard.
- Completing wizard opens main coach.
- Existing settings do not crash.

## Task 3.3: Wire Hermes connection test into wizard

**Objective:** Let beta users verify local or hosted Hermes during setup.

**Files:**
- Modify: `src/renderer/FirstRunWizard.tsx`
- Possibly extract existing connection UI helpers from `src/renderer/App.tsx`

**Steps:**

1. Reuse `bridge.testHermesConnection`.
2. Offer presets:
   - Local/private: `http://localhost:8642`
   - Hosted/custom: user-entered base URL and bearer token
3. Show text/image capability results.
4. Apply discovered effective connection on success.
5. Verification:
   ```bash
   npm run typecheck
   npm test -- --run
   ```
6. Commit:
   ```bash
   git add src/renderer
   git commit -m "feat: connect first-run wizard to Hermes probing"
   ```

**Acceptance Criteria:**
- Wizard can save a working connection.
- Wizard explains degraded/no-image capability.

## Task 3.4: Wire window pairing into wizard

**Objective:** Ensure first beta session ends with a selected trading window.

**Files:**
- Modify: `src/renderer/FirstRunWizard.tsx`
- Possibly extract reusable window picker component from `src/renderer/App.tsx`

**Steps:**

1. Add button to list window sources.
2. Let user select/pair a window.
3. Persist paired window.
4. Show recovery copy for screen recording permissions.
5. Verification:
   ```bash
   npm run typecheck
   npm test -- --run
   ```
6. Commit:
   ```bash
   git add src/renderer
   git commit -m "feat: pair trading window during first-run setup"
   ```

**Acceptance Criteria:**
- User can pair window during setup.
- No windows case is understandable and recoverable.

---

# Lane 4: Security/Privacy Agent

## Task 4.1: Move bearer token out of plain local settings

**Objective:** Stop storing hosted Hermes bearer token directly in local settings JSON.

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/localSettings.ts`
- Test: add/update relevant tests

**Steps:**

1. Add main-process secure token API:
   - save token
   - load token presence/masked value
   - delete token
2. Use Electron `safeStorage` if available.
3. If `safeStorage` unavailable, fall back only with explicit beta warning.
4. Remove token from serialized renderer settings, or store only token presence marker.
5. Verification:
   ```bash
   npm run typecheck
   npm test -- --run
   ```
6. Commit:
   ```bash
   git add src
   git commit -m "feat: store hosted Hermes tokens securely"
   ```

**Acceptance Criteria:**
- Bearer token is not persisted as plaintext in renderer local settings.
- Existing plaintext token is migrated or cleared safely.
- Debug reports still mask auth.

## Task 4.2: Add credential removal UI

**Objective:** Let users remove hosted credentials easily.

**Files:**
- Modify: `src/renderer/App.tsx` or extracted settings component
- Modify: `src/renderer/styles.css`

**Steps:**

1. Add “Remove hosted token” button when token exists.
2. Confirm before deletion.
3. Clear token in secure storage.
4. Show success/failure message.
5. Verification:
   ```bash
   npm run typecheck
   npm test -- --run
   ```
6. Commit:
   ```bash
   git add src/renderer src/main src/preload
   git commit -m "feat: add hosted credential removal controls"
   ```

**Acceptance Criteria:**
- User can remove token without editing files.
- Removing token makes hosted requests fail with clear auth prompt.

## Task 4.3: Add remote screenshot disclosure gate

**Objective:** Ensure hosted/custom endpoints are explicit opt-in before screenshots leave the machine.

**Files:**
- Modify: `src/renderer/requestPolicy.ts`
- Modify: `src/renderer/requestPolicy.test.ts`
- Modify: `src/renderer/App.tsx`

**Steps:**

1. Confirm current consent behavior.
2. Add copy that says screenshots and compact memory may be sent to hosted endpoint.
3. Require per-request consent or remembered consent only after explicit checkbox.
4. Test bypass rules.
5. Verification:
   ```bash
   npm test -- --run src/renderer/requestPolicy.test.ts
   npm run typecheck
   ```
6. Commit:
   ```bash
   git add src/renderer
   git commit -m "feat: harden hosted endpoint screenshot consent"
   ```

**Acceptance Criteria:**
- Local endpoint does not nag unnecessarily.
- Hosted/custom endpoint has clear opt-in before image payload send.

## Task 4.4: Add local data controls

**Objective:** Make privacy-first memory auditable and erasable.

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/journal.ts`
- Modify: `src/renderer/warningFeedback.ts`
- Tests as needed

**Steps:**

1. Add “Export journal JSON” control.
2. Add “Clear all local memory” control that clears journal and warning feedback.
3. Add confirmation prompt.
4. Ensure screenshot bytes are not exported because they are not stored.
5. Verification:
   ```bash
   npm run typecheck
   npm test -- --run
   ```
6. Commit:
   ```bash
   git add src/renderer
   git commit -m "feat: add local memory export and clear controls"
   ```

**Acceptance Criteria:**
- User can export and erase local memory from UI.
- Tests cover serialization/clear behavior.

---

# Lane 5: E2E/QA Agent

## Task 5.1: Add fake Hermes server test fixture

**Objective:** Provide deterministic API responses for smoke tests and local QA.

**Files:**
- Create: `scripts/fake-hermes-server.mjs`
- Possibly add npm script in `package.json`

**Steps:**

1. Implement endpoints:
   - `GET /health`
   - `GET /v1/models`
   - `GET /v1/capabilities`
   - `POST /v1/chat/completions`
2. Support modes via env var:
   - success text+image
   - auth required
   - text only/no image
   - timeout
3. Add script:
   ```json
   "fake:hermes": "node scripts/fake-hermes-server.mjs"
   ```
4. Verification:
   ```bash
   npm run fake:hermes
   curl http://localhost:8642/health
   ```
5. Commit:
   ```bash
   git add scripts/fake-hermes-server.mjs package.json package-lock.json
   git commit -m "test: add fake Hermes API server fixture"
   ```

**Acceptance Criteria:**
- Fake server can run locally and mimic success/failure modes.

## Task 5.2: Add Electron smoke test harness

**Objective:** Verify packaged/dev app can launch and basic flows work.

**Files:**
- Add dev dependency: Playwright or an Electron-compatible smoke harness
- Create: `tests/e2e/`
- Modify: `package.json`

**Steps:**

1. Add a minimal smoke test that launches app.
2. Assert main window renders.
3. Point connection settings at fake Hermes.
4. Trigger connection test.
5. Verification:
   ```bash
   npm run test:e2e
   ```
6. Commit:
   ```bash
   git add tests/e2e package.json package-lock.json
   git commit -m "test: add Electron smoke test harness"
   ```

**Acceptance Criteria:**
- `npm run test:e2e` runs locally on Linux CI at minimum.
- Test fails if app cannot launch.

## Task 5.3: Add fake-Hermes connection flow tests

**Objective:** Cover beta-critical Hermes states.

**Files:**
- Modify: `tests/e2e/*`

**Steps:**

1. Test success: local fake Hermes text+image.
2. Test auth failure.
3. Test image capability missing.
4. Test timeout/offline.
5. Verification:
   ```bash
   npm run test:e2e
   ```
6. Commit:
   ```bash
   git add tests/e2e
   git commit -m "test: cover Hermes connection failure modes"
   ```

**Acceptance Criteria:**
- E2E tests cover the most common beta setup failures.

## Task 5.4: Create manual beta checklist

**Objective:** Give humans a final release sanity checklist.

**Files:**
- Create: `docs/beta/manual-qa-checklist.md`

**Steps:**

1. Add per-OS install checklist.
2. Add first-run checklist.
3. Add local Hermes checklist.
4. Add hosted Hermes checklist.
5. Add uninstall/data deletion checklist.
6. Commit:
   ```bash
   git add docs/beta/manual-qa-checklist.md
   git commit -m "docs: add beta manual QA checklist"
   ```

**Acceptance Criteria:**
- A tester can follow the checklist without repo context.

---

# Lane 6: Docs/Beta Ops Agent

## Task 6.1: Update README with beta install section

**Objective:** Explain exactly how to install on each OS.

**Files:**
- Modify: `README.md`

**Steps:**

1. Add Windows instructions:
   - Download `.exe` or `.zip`
   - SmartScreen warning caveat for unsigned beta
2. Add macOS instructions:
   - Download `.dmg` or `.zip`
   - Gatekeeper/right-click Open caveat for unsigned beta
3. Add Linux instructions:
   - AppImage chmod/run
   - `.deb` install command
4. Add local Hermes prerequisite.
5. Commit:
   ```bash
   git add README.md
   git commit -m "docs: add cross-platform beta install instructions"
   ```

**Acceptance Criteria:**
- README includes Windows, macOS, and Linux install methods.

## Task 6.2: Add beta troubleshooting guide

**Objective:** Reduce support burden during private beta.

**Files:**
- Create: `docs/beta/troubleshooting.md`

**Steps:**

1. Add Hermes not running.
2. Add hosted auth error.
3. Add no image capability.
4. Add no capturable windows.
5. Add macOS screen recording permission.
6. Add Windows SmartScreen.
7. Add Linux AppImage permissions/sandbox notes.
8. Commit:
   ```bash
   git add docs/beta/troubleshooting.md
   git commit -m "docs: add beta troubleshooting guide"
   ```

**Acceptance Criteria:**
- Troubleshooting doc covers top setup failures.

## Task 6.3: Add release notes template

**Objective:** Make releases consistent and transparent.

**Files:**
- Create: `docs/beta/release-notes-template.md`

**Steps:**

1. Include sections:
   - What changed
   - Install links
   - Known limitations
   - Privacy notes
   - Checksums
   - How to report bugs
2. Commit:
   ```bash
   git add docs/beta/release-notes-template.md
   git commit -m "docs: add beta release notes template"
   ```

**Acceptance Criteria:**
- Maintainer can copy template into GitHub release.

---

# Integration Plan

## Integration Task A: Merge packaging branch first

**Objective:** Establish package scripts before CI/docs reference them.

**Steps:**

1. Checkout integration branch from latest main.
2. Merge `beta/packaging-installers`.
3. Run:
   ```bash
   npm ci
   npm run typecheck
   npm test -- --run
   npm run build
   npm run package
   npm run dist:linux
   ```
4. Fix conflicts only in packaging-owned files.
5. Commit merge.

**Acceptance Criteria:**
- Linux local packaging works on integration branch.

## Integration Task B: Merge security/privacy before first-run wizard

**Objective:** Ensure wizard uses secure credential APIs instead of plaintext settings.

**Steps:**

1. Merge `beta/security-privacy-storage`.
2. Run:
   ```bash
   npm run typecheck
   npm test -- --run
   ```
3. Manually test token save/delete if possible.
4. Commit merge.

**Acceptance Criteria:**
- No plaintext bearer token in local settings for new saves.

## Integration Task C: Merge first-run wizard

**Objective:** Make beta setup usable.

**Steps:**

1. Merge `beta/first-run-wizard`.
2. Resolve conflicts around settings/security APIs.
3. Run:
   ```bash
   npm run typecheck
   npm test -- --run
   npm run build
   ```
4. Manually launch app.
5. Commit merge.

**Acceptance Criteria:**
- Fresh user sees first-run wizard.
- Existing user can still use app.

## Integration Task D: Merge E2E and CI

**Objective:** Automate beta verification.

**Steps:**

1. Merge `beta/e2e-smoke-tests`.
2. Merge `beta/release-ci`.
3. Run:
   ```bash
   npm run typecheck
   npm test -- --run
   npm run test:e2e
   npm run build
   ```
4. Push integration branch and verify GitHub Actions.
5. Commit merge.

**Acceptance Criteria:**
- PR checks include unit/build and E2E where supported.
- Package workflow can be manually triggered.

## Integration Task E: Merge docs last

**Objective:** Align docs with actual commands/artifact names.

**Steps:**

1. Merge `beta/beta-docs`.
2. Update artifact names if packaging config changed.
3. Run docs link sanity check manually.
4. Commit merge.

**Acceptance Criteria:**
- Docs match actual commands and artifact names.

---

# Parallelization Map

Can start immediately in parallel:

- Lane 1 Task 1.1 packaging base
- Lane 3 Task 3.1 first-run state model
- Lane 4 Task 4.1 secure token storage design/implementation
- Lane 5 Task 5.1 fake Hermes server
- Lane 6 Task 6.2 troubleshooting guide

Wait for dependencies:

- Lane 2 Task 2.2 waits for Lane 1 package scripts.
- Lane 3 Task 3.3 should wait for or coordinate with Lane 4 secure token API.
- Lane 5 Task 5.2 can start after fake server exists.
- Lane 6 Task 6.1 should wait for exact artifact names from Lane 1.

Critical path for beta:

1. Packaging base
2. Secure token storage
3. First-run wizard
4. E2E smoke harness
5. CI package workflow
6. Docs/release checklist

---

# MVP Beta Cut Line

If time is brutal, cut to this minimum:

1. `electron-builder` package config for Windows/macOS/Linux.
2. GitHub Actions artifact build matrix.
3. First-run connection wizard for local Hermes + hosted/custom.
4. Secure token storage or explicit “hosted credentials are beta/insecure” blocker.
5. Manual QA checklist.
6. README install instructions.

Do **not** cut:

- Linux install method.
- Windows install method.
- macOS install method.
- Hosted screenshot disclosure.
- Basic CI verification.
- Token masking/redaction.

---

# Final Release Command Checklist

Before tagging beta:

```bash
npm ci
npm run typecheck
npm test -- --run
npm run build
npm run dist:linux
```

Then trigger package workflow for all OSes and verify artifacts:

- Windows: `.exe`, `.zip`
- macOS: `.dmg`, `.zip`
- Linux: `.AppImage`, `.deb`, optional `.zip`
- `SHA256SUMS.txt`

Tag format:

```bash
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1
```

Release should be marked prerelease/private beta.
