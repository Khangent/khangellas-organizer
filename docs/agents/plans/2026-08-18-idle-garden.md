---
date: 2026-08-18T12:03:40+00:00
git_commit: e44eed86620f1531843c26bd107e6234c089e1ce
branch: main
topic: "Our Garden — co-op idle game (MVP)"
tags: [plan, idle-game, garden]
status: shipped
---

# Plan: Our Garden — co-op idle game (MVP)

Research: [../research/2026-08-18-idle-game.md](../research/2026-08-18-idle-game.md).
Decisions: concept **A (Our Garden)**, **co-op** (one shared save). MVP first, then grow.

## Goal
A calm, low-attention idle game in its own **Garden** tab: sunlight accrues over time (even
offline), you plant seeds that grow on timers, harvest for coins, and spend coins to expand.
One shared garden both partners tend, synced like everything else.

## Approach
- **State** `org.idle` (synced, co-op), added to `SYNC_KEYS` + `applyRemoteState`:
  ```js
  garden = { sun, coins, sunRate, lastTick, plots: [ {id, plant|null, planted|null} ], unlocked: [typeKeys], createdAt }
  ```
- **Static config** `PLANTS = { key: { name, emoji, cost(sun), grow(sec), yield(coins) } }` —
  MVP: `sprout 🌱` (cheap/fast), `flower 🌸`, `sunflower 🌻` (dearer/slower/richer).
- **Offline-first accrual** (the idle core, all timestamp-based — no fast tick needed for
  correctness):
  - `settleSun()` — award `sunRate × (now − lastTick)/1000` to `sun`, set `lastTick = now`.
  - A plot is **ripe** when `now − planted ≥ grow×1000` (so plants ripen while away too).
  - On load: settle sun (offline gains). A 1 s UI interval refreshes numbers/plant progress
    **only while the Garden view is active**; persist (`save.idle()`) on actions + a ~20 s
    autosave so offline math stays correct.
- **Co-op sync note (accepted):** a shared blob with last-write-wins + realtime `_by` echo
  guard. If both are idle simultaneously there's a minor double-count / lost-click edge case;
  fine for a casual toy. Incoming remote state is adopted as authoritative (its `lastTick`).
- **Pure, unit-tested helpers:** `sunGain(rate, elapsedMs)`, `growProgress(grow, planted, now)`
  (0..1), `isRipe(...)`, `plotCost(nPlots)` (rising price).
- Conventions: build DOM with `el()`; after each mutation `save.idle(); renderGarden(); updateBadges();`.

## Steps
Mark `[x]` when the step's **Verify** passes.

- [x] **Step 1 — State, config & pure helpers (+ unit tests)** — done, 30/30 green.
  - Files: `app.js` (new "Garden (idle)" section: `garden` state, `save.idle`, `PLANTS`,
    `sunGain`/`growProgress`/`isRipe`/`plotCost`/`settleSun`, `seedGarden()`), `test/run.mjs`.
  - Change: add state + pure helpers; export the helpers for tests; seed a default garden
    (3 plots, `sunRate 1`, `sprout` unlocked) if none.
  - Verify: `npm test` green with new unit checks for `sunGain`/`growProgress`/`isRipe`/`plotCost`.

- [x] **Step 2 — View + rendering** — done (built with Step 3); structure + smoke green.
  - Files: `index.html` (sidebar `data-view="garden"` + `#view-garden`: sun/coins/rate bar,
    `#garden-plots` grid, shop row), `app.js` (`renderGarden()`, `initGarden()`, add both to
    the Init block; 1 s UI tick gated to the active view), `styles.css` (garden styles).
  - Change: render the top bar + plot grid + shop from state (no actions yet).
  - Verify: `npm test` (structure: nav↔view parity + all `#ids` exist); load the app → Garden
    tab shows the seeded garden and live-ticking sunlight.

- [x] **Step 3 — Interactions + offline accrual** — done (plant/harvest/buy/unlock, settleSun on load, 20 s autosave, 1 s UI tick).
  - Files: `app.js`.
  - Change: `plantSeed(plot, type)`, `harvest(plot)`, `buyPlot()`, `buySunLamp()` (raise
    `sunRate`), `unlockPlant(type)` — each `settleSun()` → mutate → `save.idle()` →
    `renderGarden()` → `updateBadges()`. Award offline gains on load; 20 s autosave.
  - Verify: `npm test`; manual — plant a seed, watch it grow, harvest → coins; buy a plot/lamp;
    reload after a wait and confirm sunlight + ripened plants accrued while away.

- [x] **Step 4 — Sync, badge, subagent, ship** — `org.idle` synced + reloaded; ripe badge; garden-feature subagent; `?v=34`.
  - Files: `app.js` (`"org.idle"` into `SYNC_KEYS`; reload `garden` + `renderGarden()` in
    `applyRemoteState`; `updateBadges` sets `badge-garden` = ripe-plot count), `index.html`
    (`#badge-garden`), `.claude/agents/garden-feature.md` (new subagent), `Instruction.md`
    (add to the subagent list).
  - Verify: `npm test` (incl. the "SYNC_KEYS reloaded in applyRemoteState" check now covering
    `org.idle`); bump `?v=` and ship via the `deploy` skill; sanity that a change on one device
    would push (`Synced ✓`).

## Risks & mitigations
- **Idle sync double-count** (both online): accepted for a casual toy; accrual is
  timestamp-based and remote state is adopted authoritatively.
- **localStorage spam / sync noise:** don't persist every second — compute `sun` on the fly,
  persist only on actions + a ~20 s autosave.
- **Smoke test** executes `app.js` at load: `initGarden`/tick guard on the view + elements, so
  the DOM stub doesn't throw.
- **Naming collision** with the existing "Games to Play" tab: new tab is **Garden**, separate.

## Rollout
Served-asset change → bump `?v=33 → 34`, add the `garden-feature` subagent, `npm test`, ship
via `deploy`.

## Later (post-MVP, not now)
More plant tiers, a "sun lamp"/tool shop, decorations/cosmetics, a gentle prestige ("compost"),
harvest sound off by default, weekly bonus. Kept out of the MVP.

**Status: awaiting confirmation — no code until approved.**
