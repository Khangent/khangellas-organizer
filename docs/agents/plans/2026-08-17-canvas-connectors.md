---
date: 2026-08-17T15:40:35+00:00
git_commit: e1391841edb490790c5866a252b6f0977bc29517
branch: main
topic: "Plan: Canvas connectors / arrows"
tags: [plan, canvas, connectors]
status: approved
---

# Plan: Canvas connectors / arrows (Phase 3b)

Directional arrows between two items that re-route live as either item moves. Builds on
P1/P2/P3a. Confirmed UX: **drag from a connect handle on a selected item onto another item**.

## Data model
A connector is a normal `canvasItems` entry (so it syncs via `org.canvas` and rides the undo
history) — additive, **no migration**:
`{ id, type: "connector", from: <itemId>, to: <itemId>, z }`. It has no `x/y/w/h`; geometry is
derived from its two endpoints.

## Rendering
- A persistent **SVG overlay inside `#canvas-surface`** (so it transforms with pan/zoom).
  `el()` can't build SVG (HTML namespace) → add a tiny `svgEl(tag, attrs)` using
  `createElementNS`.
- One `<path marker-end=arrow>` per connector; endpoints computed in **world coords** by
  `edgePoint(rect, targetX, targetY)` (pure, unit-tested) — the point on each box border
  facing the other box's centre, so arrows touch edges, not centres.
- `redrawEdges()` updates each path's `d`; called from `renderCanvas` and during drag/resize
  move (not needed on pan/zoom — the SVG is inside the transformed surface). SVG is
  `pointer-events:none`; paths are `pointer-events:stroke` so only the line is clickable and
  the overlay never blocks item/board gestures. Connectors paint **behind** items (items
  carry `z-index ≥ 1`, the SVG is `z-index:auto`).

## Creation
When exactly one **box** item is selected, show a small **connect handle** (top-right,
distinct from the bottom-right resize handle). Pointer-drag it → a temp arrow follows the
cursor → release over another item creates the connector (`beginChange()` first). Release
over empty space cancels.

## Selection / delete / interactions
- Click a connector's line → `selectOnly(id)`; the path gets `.selected`. **Delete** removes
  it. `updateSelClasses` also toggles `.selected` on edge paths.
- Deleting a **box** cascades: also remove connectors whose `from`/`to` is that box.
- Connectors are **excluded** from drag/resize/marquee/group-move/duplicate/nudge/fit (they
  have no geometry and auto-follow) — guarded by `type !== "connector"` filters everywhere
  those operate.
- Undo/redo already covers create/delete (connectors live in `canvasItems`; snapshots include
  them).

## Files
- `app.js`: `svgEl`, `edgePoint` (pure), connector model, `buildEdges`/`redrawEdges`, connect
  handle + `startConnect`, delete cascade, redraw hooks, exclusions, `renderCanvas` skips
  connectors for box building.
- `styles.css`: `.cvi-edges` (svg overflow visible, pointer-events none), `.cvi-edge`
  (stroke, hover, `.selected`), `.cvi-connect` handle.
- `index.html`: none required (SVG built in JS).
- `test/run.mjs`: unit-test `edgePoint` (border projection).
- `.claude/agents/canvas-feature.md`: document connectors.

## Risks
- **SVG namespace** — must use `svgEl`/`createElementNS`, not `el()`.
- **NaN geometry** — connectors have no `x/w`; every box operation filters them out.
- **Thin-line hit target** — Phase 3b-1 uses `pointer-events:stroke` at ~2px world; a wider
  invisible hit-path can come later if it feels fiddly.
- **Smoke test** — SVG built lazily in render/init; guarded so load doesn't throw on the DOM
  stub.

## Rollout
`npm test` green (+ `edgePoint` unit test); bump `?v=32 → 33`; update subagent; ship via
`deploy`. Manual browser smoke: create a connector, move both endpoints, delete a box
(arrow disappears), undo/redo, sync.

**Status: SHIPPED 2026-08-17 (`?v=33`).** Connect by dragging an item's handle onto another;
arrows re-route on move; click a line to select, Delete to remove; deleting a box removes its
connectors; undo/redo covers create/delete. Minimap and pinch/touch remain.
