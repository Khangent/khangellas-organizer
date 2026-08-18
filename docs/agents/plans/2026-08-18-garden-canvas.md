---
date: 2026-08-18T12:24:17+00:00
git_commit: 2e490487d1e7dda3b8197797330719533644794e
branch: main
topic: "Garden: render an actual drawn garden on a <canvas>"
tags: [plan, garden, canvas, visual]
status: shipped
---

# Plan: a visual garden on a `<canvas>`

Enhances the shipped Garden idle game (`docs/agents/plans/2026-08-18-idle-garden.md`). Keeps
**all game logic** (sun/coins/plots/plant/harvest/buy, offline accrual, co-op sync) — only the
**plot grid** becomes a **drawn garden scene**.

## Goal
Replace the flat plot tiles with an actual little garden you can *see*: sky, a sun, a soil bed,
and plants that **visibly grow** stage-by-stage and bloom when ripe. Click a plant spot to
plant/harvest. Cute, calm, still glanceable.

## Approach
- **Rendering:** an HTML5 `<canvas id="garden-canvas">` replacing `#garden-plots`. Draw with
  the **2D context only** — gradients, arcs, curves — so there are **no image assets** (fits
  the no-build, zero-dep, GitHub-only-egress constraints). Scene = sky gradient + a sun (soft
  rays) + a soil band + a row of "plots" along the soil.
- **Per-plot drawing by state** (colour/shape from the plant type):
  - **empty** → a small soil mound with a faint dashed ring / "＋".
  - **growing** → a stem that rises, leaves that unfurl, a bud — all scaled by
    `growProgress(...)` (the pure helper already unit-tested).
  - **ripe** → a full bloom (flower/sunflower head) gently bobbing with a soft glow to invite a
    harvest.
- **Animation:** a `requestAnimationFrame` loop that runs **only while the Garden view is
  active** (cancelled otherwise) — slow sun-ray rotation, a little sway, ripe-plant bob. Cheap.
  The existing 1 s `setInterval` still drives game state + autosave; rAF only redraws.
- **Interaction:** click the canvas → map x→plot via a **pure `plotIndexAtX(x, w, n, pad)`**
  (unit-tested) → `plantSeed(plot, gardenSelSeed)` if empty / `harvest(plot)` if ripe. Hover
  highlights the hovered plot. Keep the **stats bar, seed bar, and shop** as the HTML controls
  around the canvas.
- **Crispness/responsiveness:** size the canvas to its container width with a fixed aspect,
  scaled by `devicePixelRatio`; redraw on resize.

## Steps
- [x] **Step 1 — Canvas scene renderer + pure hit-test** — done (drawGarden/drawPlant, plotIndexAtX unit-tested).
  - Files: `index.html` (swap `#garden-plots` → `<canvas id="garden-canvas">`), `app.js`
    (`drawGarden(ctx,w,h,now)`, plant/sun/soil drawing, `plotIndexAtX` pure helper, DPR sizing,
    rAF loop gated to the view; `renderGarden` no longer builds the grid), `test/run.mjs`
    (unit-test `plotIndexAtX`).
  - Verify: `npm test` green (new unit check + structure: `#garden-canvas` referenced exists);
    smoke still executes `app.js`.
- [x] **Step 2 — Canvas interactions + polish** — done (click plant/harvest, hover, sway/bob/sun anim).
  - Files: `app.js` (canvas `click` → plant/harvest via `plotIndexAtX`; `pointermove` hover
    highlight), `styles.css` (canvas sizing/rounding, cursor).
  - Verify: `npm test`; manual — click empty spot plants the selected seed, ripe bloom
    harvests; growth animates; resize stays crisp.
- [x] **Step 3 — Harness stubs, subagent, ship** — getContext/rAF stubs; subagent updated; ?v=35.
  - Files: `test/run.mjs` (add `getContext` → no-op 2D ctx + `requestAnimationFrame`/
    `cancelAnimationFrame` stubs so the smoke test still runs), `.claude/agents/garden-feature.md`
    (document the canvas rendering), bump `?v=34 → 35`.
  - Verify: `npm test` green; ship via `deploy`.

## Risks & mitigations
- **Smoke test executes `app.js`:** canvas `getContext('2d')` and `requestAnimationFrame` don't
  exist on the DOM stub → add no-op stubs; guard the draw code so a null context no-ops.
- **Perf:** one rAF loop, paused off-view; few plots; simple shapes.
- **Hit-test on resize/DPR:** all math in the pure `plotIndexAtX` (tested); map using CSS px.
- **Keep logic intact:** only rendering/interaction of plots changes; `plantSeed`/`harvest`/
  `buy*`/sync/badge unchanged.

## Rollout
Served-asset change → bump `?v=35`, update the `garden-feature` subagent, `npm test`, ship via
`deploy`.

## Open question (for you)
**View style:** a **side-on garden bed** (recommended — best for showing plants grow upward and
bloom) or a **top-down plot patch**? Either way it's fully drawn (no assets).

**Status: awaiting confirmation — no code until approved.**
