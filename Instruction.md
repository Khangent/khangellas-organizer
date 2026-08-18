# Instruction.md — Khangella's Organizer

Lean entry point for every session. Deep detail lives in linked docs — **load them on
demand**, don't inline them here. Keep this file short (< ~100 lines).

## What
A private, shared personal-organizer web app for two people: to-dos, shopping, calendar,
reminders, a Lost Ark raid tracker, a Pokémon TCG collector, a games backlog, a moodboard
canvas, and an AI assistant — syncing across devices in realtime.

- **Stack:** vanilla HTML + CSS + JS, **no build step**. Supabase (Postgres + Realtime +
  Auth + Storage) for sync. Hosted on **GitHub Pages** (`main`, served static).
- **Shape:** one app, not a monorepo. Nearly all logic is in **`app.js`** (~2200 lines,
  one commented section per feature). `index.html` holds every view; `styles.css` all
  styling; `tcg-data.js` static card data.

## Why
A couple's shared hub that works offline-first (localStorage is the source of truth) and
**syncs live** between their phones/laptops via Supabase, while staying **private** (shared
login) — the GitHub repo is public, so **no secrets are ever committed**.

## How (the essentials)
- **Research → plan → confirm → implement (required):** for any feature or non-trivial
  change, research first and write a plan to `docs/agents/research/` + `docs/agents/plans/`
  (`.md`), then **wait for explicit user confirmation before editing code**. Pure ops
  (deploy/commit) and trivial one-line fixes are exempt; when in doubt, plan first. The RPI
  skills (`rpi-research`, `rpi-plan`, `rpi-implement`) drive this loop.
- **Run:** `python3 -m http.server 8000` → http://localhost:8000 (static, no build).
- **Verify:** `npm test` (== `node test/run.mjs`) must be green, then browser-smoke the
  affected view. **Run tests + cross-check features after every major commit.**
- **Deploy:** bump the `?v=N` cache-bust on `styles.css`/`tcg-data.js`/`app.js` in
  `index.html` (keep them equal), commit, `git push origin main`. Dev-only files
  (`test/`, `package.json`, `make_icons.py`) aren't served — no bump needed.

## Golden rules
- **No build step, no npm runtime deps** — the no-tooling simplicity is a feature.
- **Never commit secrets.** API keys live in `localStorage`; only the Supabase *anon* key
  (safe to expose) is in source.
- **Match surrounding code**; build DOM with the `el()` helper, never string HTML.
- **Keep `SYNC_KEYS` ↔ `applyRemoteState` in lockstep** for anything that must sync.
- The **AI endpoint is VPN-only** (`aikeys.maibornwolff.de`) — a cloud relay can't reach
  it; don't reintroduce one.

## Deeper docs (load when relevant)
- **[docs/architecture.md](docs/architecture.md)** — project structure, `app.js` module
  map, sync/AI/canvas design rationale.
- **[docs/conventions.md](docs/conventions.md)** — coding standards + the step-by-step
  pattern for adding a feature or view.
- **[docs/rpi.md](docs/rpi.md)** — Research → Plan → Implement + Frequent Intentional
  Compaction: the plan-first workflow, artifact conventions, and context management.
- **[docs/workflow.md](docs/workflow.md)** — running, the test harness in detail, and the
  full deploy / GitHub Pages procedure.
- **[docs/backpressure.md](docs/backpressure.md)** — backpressure (automated feedback loops):
  the concept, what fits this no-build app vs what we skip, and all our layers at a glance.
- **[docs/testing.md](docs/testing.md)** — the guardrails in detail: the 4-layer test harness,
  automatic execution (pre-commit hook + CI), verify-after-commit rule, deploy safety gates,
  how the deploy skill was hardened, and the app's runtime sync throttling.

## Skills
Reusable procedures live in `.claude/skills/<name>/SKILL.md` (auto-discovered):
- **deploy** — bump `?v=`, run tests, commit, push, and confirm the Pages build is live.

## Subagents
One feature-scoped subagent per feature lives in `.claude/agents/*-feature.md`
(auto-discovered). Delegate a task to the matching agent — each already knows that feature's
state var, render fn, view id, data model, and sync key: `todos`, `shopping`, `calendar`,
`reminders`, `raids`, `tcg`, `recipes`, `games`, `garden`, `canvas`, `ai`, `sync`, `chat`.
`sync` underpins `canvas` + `chat`; changes that must sync also go through `sync` (SYNC_KEYS +
applyRemoteState).
