# Testing, Harness & Guardrails

A reference for the quality gates ("backpressure") that protect Khangella's Organizer — the
test harness, the standing verification rule, the deploy safety gates, how the deploy skill
was hardened, and the app's own runtime backpressure. See [workflow.md](workflow.md) for the
day-to-day run/verify/deploy commands and [../Instruction.md](../Instruction.md) for the
lean overview.

## Why this exists
The app is a live, public, no-build static site with no server and no framework safety net.
The guardrails below are layered so that a change can't silently break a feature or ship a
broken/duplicate release. They run **automatically** (a pre-commit hook + CI, §2) so the
feedback is immediate and in-context: **static checks → executed smoke → unit math → deploy
gates → runtime throttling.** Each layer catches a different class of failure.

This is "backpressure": automated feedback loops that let an agent catch and fix its own
mistakes without waiting for human review. What we lean on and what we skip, given a no-build
vanilla-JS app with no in-repo backend: ✅ automated tests, ✅ static/structure checks,
✅ `node --check` as our "compile", ✅ automatic (hook + CI) execution — but we deliberately
**skip TypeScript/tsc** (would force a build; the no-build simplicity is the point) and
**schema validation** (no API/backend lives in this repo).

---

## 1. The test harness — `test/run.mjs`
Zero-dependency Node script (fits the no-build app; only Node 24+ is required — no npm
packages). Run it with:
```bash
npm test        # == node test/run.mjs
npm run lint    # == node --check app.js && node --check tcg-data.js
```
Exit code is non-zero on any failure. Current baseline: **26 checks, all green** — and they
run automatically before every commit and in CI (see §2).

It exercises the **real** code in four layers:

### Layer 1 — Lint / syntax (3 checks)
`node --check` on `app.js`, `tcg-data.js`, and `test/run.mjs` — catches parse errors before
anything else runs.

### Layer 2 — Structure (static cross-checks between `index.html` and `app.js`, 8 checks)
- every sidebar `data-view` has a matching `#view-*` section, **and** vice-versa (nav↔view
  parity in both directions);
- every element ID referenced by a literal `$("#id")` / `$$("#id …")` in `app.js` exists in
  the DOM (HTML ids ∪ ids created via `el({id:…})`); interpolated selectors like
  `` `#badge-${id}` `` are skipped;
- no dangling references to removed features (e.g. the old AI recipe-extractor);
- cache-bust `?v=` versions are equal across `styles.css` / `tcg-data.js` / `app.js`;
- every `init*()` called at startup is actually defined;
- **every `org.*` key in `SYNC_KEYS` is reloaded in `applyRemoteState()`** — so a synced
  feature can't silently fail to sync (the invariant we keep in lockstep);
- **every `save.X()` call has a matching setter** — catches `save.`-typo regressions.

### Layer 3 — Integration smoke (1 check)
Actually **executes `app.js` end-to-end** against a hand-rolled DOM/`localStorage`/`window`
stub (`runApp()` wraps the source in a `new Function` with stubbed globals) and asserts it
initializes without throwing. This catches load-time crashes, a renamed/missing element, or
a missing function — things static checks miss. The module returns its pure helpers so
Layer 4 can test the real implementations.

### Layer 4 — Unit (real exported functions, 8 checks)
`num()`, `round1()`, `macroTotals()`, `kcalOf()` (= `4·P + 4·C + 9·F`), `parseSteamId()`,
`personGold()`, `raidStats()`, `fmtGold()` — the pure logic behind Recipes macros, Steam
cover parsing, and raid stats/gold.

### What it does NOT cover (known limits)
- CSS / visual layout (the harness can't see pixels).
- Live Supabase / network behaviour (auth, realtime, Storage) — the smoke test stubs them.
- A real browser (it's a DOM stub, not a headless Chromium).
A **Playwright** e2e layer would fill these gaps if ever wanted; not currently present.

---

## 2. Automatic & immediate feedback — pre-commit hook + CI
A harness only helps if it actually runs. Two mechanisms make it automatic:
- **Pre-commit hook** (`.githooks/pre-commit`) runs `node test/run.mjs` before every commit,
  so a red suite **blocks the commit**. Enable once per clone:
  `git config core.hooksPath .githooks` (bypass in a pinch with `git commit --no-verify`).
- **GitHub Actions CI** (`.github/workflows/ci.yml`) runs the harness on every push to `main`
  and every PR — a red/green check on the commit, needing no local tooling (pure Node, no
  `npm install`). It's *advisory*: GitHub Pages still deploys from `main` on push regardless,
  so the **pre-commit hook is the real gate** and the `deploy` skill re-runs tests before
  pushing.

This is the "validation runs automatically / feedback is immediate" layer — the failure lands
in-context instead of being discovered after shipping.

---

## 3. Standing rule — verify after every major commit
After every substantive commit: **run `npm test` and cross-check that all features still
work**, then report pass/fail. Static + smoke + unit is the automated part; a manual
browser smoke of the affected view (and a spot-check of one unrelated view) covers what the
harness can't. Recorded in memory as `run-tests-after-commits`.

---

## 4. Deploy safety gates — the `deploy` skill
`.claude/skills/deploy/SKILL.md` is the release runbook, and several of its steps are
guardrails ("backpressure" against a bad release):
- **Tests must be green before pushing** — never ship a red suite (the push *is* the deploy
  on GitHub Pages).
- **Cache-bust discipline** — served-asset changes bump `?v=` on all three assets equally,
  to `max(local, origin/main) + 1`, so a release always gets a fresh, strictly-greater
  cache key (never silently reuses a published version).
- **Sync-before-push** — `fetch` first, rebase **after** committing, and re-check the
  version if the remote moved; on a rejected push, rebase + re-test + retry (never
  force-push `main`).
- **Best-effort confirmation** — the Pages build poll confirms `built` at HEAD but is not a
  hard gate; if `gh` can't confirm, the push already deployed.
- **Dev-only fast path** — changes under `test/`, `docs/`, `.claude/`, `package.json` skip
  the version bump and Pages step (just test → commit → push).

---

## 5. How the deploy skill was hardened (eval loop)
The deploy skill was refined with the `skill-creator` skill using an **isolated eval
sandbox** so no eval ever touched production:
- Each run executed the skill against a **throwaway repo copy** whose `origin` was a **local
  bare remote** (`/tmp/…/remote.git`) — pushes never reached GitHub.
- **3 iterations**, 3 scenarios each (served-asset change, dev-only change, vague "ship
  it"), with one scenario's remote **pre-advanced** to simulate a push from another device.
- Iteration 1 found 5 gaps (undocumented commit trailer, no diverged-remote handling,
  brittle `N+1` bump, no headless fallback, Pages-as-hard-gate); iteration 2 fixed them and
  exposed a dirty-tree/rebase-ordering bug; iteration 3 confirmed convergence (bumped past a
  diverged remote to `v=31` with no stashing).
This is why the skill's steps read the way they do — each was validated by real execution,
not just inspection.

---

## 6. Runtime backpressure inside the app
The app also applies backpressure to its **cloud writes**, so rapid local edits don't
hammer Supabase (see [architecture.md](architecture.md) and the Cloud Sync section of
`app.js`):
- **Debounced push** — `store.set` → `window.__ORG_SYNC.onChange(key)` schedules
  `scheduleSyncPush()`, which coalesces changes and pushes at most once per **700 ms**
  (`pushStateNow()`), rather than on every keystroke.
- **Echo suppression** — a `syncApplying` guard skips pushes while a remote snapshot is
  being applied, and the realtime handler ignores payloads whose `_by` equals this device's
  `syncClientId`. Together these stop a write→broadcast→write feedback loop.
(These are pre-existing app mechanisms, included here because they're the app's literal
"backpressure" layer.)

---

## File map
```
test/run.mjs                     # the 4-layer harness (npm test)
package.json                     # scripts: test, lint (no deps)
.githooks/pre-commit             # runs the harness before every commit (git config core.hooksPath .githooks)
.github/workflows/ci.yml         # runs the harness on push + PR (advisory check)
.claude/skills/deploy/SKILL.md   # deploy runbook + safety gates
docs/workflow.md                 # run / verify / deploy commands
docs/testing.md                  # this file
app.js  (Cloud Sync section)     # runtime backpressure: scheduleSyncPush, syncApplying, _by
```
