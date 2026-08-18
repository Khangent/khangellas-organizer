# Backpressure

**Backpressure** = automated feedback loops that let an agent catch and fix its own mistakes
without waiting for human review. The loop:

1. **Agent makes a change** — code, config, docs.
2. **Validation runs automatically** — syntax check, static checks, tests, build.
3. **Feedback returns in-context** — errors/failures become part of what the agent sees.
4. **Agent corrects course** — fixes the issue before moving on.

It shifts mechanical verification from humans to machines, which buys **autonomous
correction, faster iteration, layered coverage, less human cognitive load, and longer safe
autonomy**. For Khangella's Organizer — a live, public, **no-build** static site with no
framework safety net — it's how a change is kept from silently breaking a feature or shipping
a broken/duplicate release.

This file is the overview + how the concept maps to *this* project. For the harness internals
see **[testing.md](testing.md)**; for run/verify/deploy commands see **[workflow.md](workflow.md)**.

---

## What fits this project (and what we deliberately skip)
Our context: **vanilla HTML/CSS/JS, no build step, no in-repo backend, zero npm deps, GitHub
Pages, sandbox reaches GitHub only.** Against the standard sources of backpressure:

| Source | Here | Why |
|---|---|---|
| **Automated tests** | ✅ have | `test/run.mjs` unit + smoke |
| **Static analysis / lint** | ✅ our harness *is* this | Real ESLint needs npm (registry blocked); our zero-dep structure checks fill the role |
| **"Compile" check** | ✅ `node --check` | Catches parse errors with no build |
| **Automatic execution** | ✅ hook + CI | The key part — feedback must be immediate |
| **Build systems** | ⚪️ N/A by design | No build step is a deliberate feature |
| **Type systems** | ❌ skip | TS/tsc forces a build + install; breaks the no-build simplicity |
| **Schema validation** | ❌ N/A | No API/backend lives in this repo (Supabase is external) |
| **Runtime feedback** | ⚪️ manual | DevTools/console — can't be automated headlessly |

---

## Our backpressure layers (what's actually wired up)
Each layer catches a different class of failure; together they form the coverage.

1. **Test harness — `test/run.mjs`** (26 checks, zero-dependency; `npm test`):
   - **Lint** — `node --check` on every JS file.
   - **Structure** — nav↔view parity, referenced element IDs exist, no dangling refs,
     cache-bust versions equal, `init*` defined, **`SYNC_KEYS` ⇄ `applyRemoteState` in
     lockstep**, **every `save.X()` has a setter**.
   - **Smoke** — actually executes `app.js` against a DOM stub (catches load-time crashes /
     renamed elements).
   - **Unit** — the pure logic (macros, coords, snapping, history cap, connector geometry…).
   - Details: [testing.md](testing.md).
2. **Automatic execution** — the "make feedback immediate" layer:
   - **Pre-commit hook** (`.githooks/pre-commit`) runs the harness and **blocks the commit**
     on failure. Enable once: `git config core.hooksPath .githooks` (bypass: `--no-verify`).
   - **GitHub Actions CI** (`.github/workflows/ci.yml`) runs the harness on push + PR — a
     red/green check per commit, no local tooling. Advisory (Pages still deploys from `main`
     on push), so the hook + the deploy skill's own test run are the real gates.
3. **Deploy gates** — the [`deploy` skill](../.claude/skills/deploy/SKILL.md): tests-green
   before push, cache-bust discipline (strictly-greater `?v=`), sync-before-push/rebase,
   best-effort Pages confirmation.
4. **Runtime backpressure in the app** — the Cloud Sync path throttles cloud writes: a
   **700 ms debounced push** + **echo suppression** (`syncApplying`, realtime `_by`), so
   rapid edits don't hammer Supabase or loop.

---

## Best practices, adapted to us
- **Quality error messages** — checks name the offending thing (the missing `#id`, the
  unhandled `org.*` key, the `save.` typo), not just "failed".
- **Layer multiple sources** — syntax + structure + smoke + unit + deploy gates; no single
  layer catches everything.
- **Make it immediate** — pre-commit hook + CI, so failures land in-context, not post-ship.
- **Keep it actionable** — a check should say *what* to fix.
- **Trust the loop** — let the hook/harness gate; intervene only for genuine judgment calls or
  if the loop gets stuck (e.g. the headless limits below).
- **Start with what you have; add layers as gaps appear** — the `SYNC_KEYS` and `save.X()`
  checks were added precisely because those invariants had bitten us.

---

## Known gaps / candidate next layers
- **Headless limits:** the harness can't see CSS/visual layout, a real browser, or live
  Supabase/network. A **Playwright** e2e layer is the biggest available upgrade.
- **Lightweight types:** JSDoc annotations + editor `checkJs` could add type feedback without
  a build, if ever wanted.
- **More invariants:** add a static check whenever a new project rule emerges.

---

## Pointers
- `test/run.mjs` — the harness · [testing.md](testing.md) — its internals
- `.githooks/pre-commit` — local gate · `.github/workflows/ci.yml` — CI
- `.claude/skills/deploy/SKILL.md` — deploy gates · [workflow.md](workflow.md) — commands
- Standing rule: run tests + cross-check after every major commit (now hook-enforced).
