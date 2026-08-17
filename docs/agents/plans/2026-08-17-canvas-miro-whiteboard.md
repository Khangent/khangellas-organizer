---
date: 2026-08-17T13:29:34+00:00
git_commit: 67370973d32f8b5fc660937238607d19af60f258
branch: main
topic: "Plan: rework Canvas into a Miro-like whiteboard"
tags: [plan, canvas, whiteboard, ux]
status: awaiting-confirmation
---

# Plan: Canvas → Miro-like whiteboard

Baseline: [research/2026-08-17-canvas-current-state.md](../research/2026-08-17-canvas-current-state.md).

## Goal
Keep the current capabilities (shared images + sticky notes, Supabase-backed, synced) but
make the board **feel and handle like a real whiteboard** (Miro/FigJam): navigable infinite
canvas with pan + zoom, direct manipulation, selection, and a clean tool/zoom UI.

## What "Miro-like" means here (target UX)
- **Infinite canvas** you pan and zoom, not a fixed scrollbox.
- **Direct manipulation:** grab an item anywhere to move it; clear selection state with
  handles; delete/duplicate with the keyboard.
- **A tool palette** (select / sticky note / image / text) and a **zoom bar** (−, %, +, fit).
- **A grid that scales** with zoom.
- Smooth, low-friction: wheel to pan, ⌘/Ctrl+wheel (or pinch) to zoom to the cursor.

## Design constraints (must respect)
- **Vanilla JS, no build, no libraries** — build DOM with `el()`; all logic stays in the
  Canvas section of `app.js`. (No React/Konva/fabric.js.)
- **Sync model unchanged:** item geometry stays in `org.canvas`; image pixels stay in the
  Supabase Storage `canvas` bucket. The **viewport (pan/zoom) is per-device** — store it
  locally (in-memory + optional `org.canvasview`), NOT in `SYNC_KEYS` (same precedent as the
  per-device chat nickname).
- **Sign-in gating stays** (`canvasReady`/`updateCanvasAuth`).
- **Test harness stays green**; add unit tests for the new pure coordinate math.
- Keep it usable on a laptop first; basic touch works, pinch-zoom is a later phase.

## Core technical change: a transform-based viewport
Today items live on a fixed 2200×1500 surface navigated by scrollbars. The redesign makes
`#canvas-surface` an **unbounded transformed plane**:
- A viewport `{ panX, panY, zoom }` renders the surface with
  `transform: translate(panX,panY) scale(zoom)`.
- Item `x/y/w/h` become **world coordinates** (existing values map 1:1 — no data migration).
- Two pure helpers convert coordinates and are unit-tested:
  - `screenToWorld(clientX, clientY, rect, view)` and `worldToScreen(...)`.
- Pan/zoom updates only move the transform (cheap); no per-item re-render needed.
- The dotted grid becomes a `background-position`/`background-size` that tracks pan/zoom.

## Phased plan

### Phase 1 — the core whiteboard feel (recommended first cut)
1. **Viewport + world coords:** add `{panX,panY,zoom}`, the transform, and the two coord
   helpers; rework `startDrag`, `startResize`, `canvasPlacePos`, and paste/drop placement to
   use world coords.
2. **Pan:** drag empty canvas to pan (and Space-drag / middle-mouse); wheel = pan,
   Shift+wheel = horizontal.
3. **Zoom:** ⌘/Ctrl+wheel zooms to the cursor; clamp ~10%–400%. A **zoom bar** (bottom-right)
   with −, live %, +, and **fit-to-content**/reset.
4. **Direct manipulation:** move by dragging the item **body** (drop the always-on title
   bar); **selection** on click (outline + corner resize handles + a small floating
   per-item toolbar: colour for notes, duplicate, delete); click empty = deselect.
5. **Keyboard:** Delete/Backspace delete selected, Esc deselect, arrows nudge, ⌘/Ctrl+D
   duplicate.
6. **Toolbar + visual refresh:** a cleaner tool palette (Select · Sticky · Image), a
   zoom-aware grid, tidier item chrome, dark-mode-correct note text contrast.
7. Keep images (Storage), notes, sign-in gating, and sync intact.

### Phase 2 — productivity (fast follow)
- Marquee multi-select + Shift-click; move/delete/duplicate multiple at once.
- Alignment/snapping guides (snap to other items / grid).
- Note colour **palette popover** (replace the cycle) + optional text size; copy/paste items.

### Phase 3 — extras (optional, later)
- Plain **text** elements and simple **shapes** (rect/ellipse); **connectors/arrows**.
- **Minimap**, **undo/redo** history, and **pinch-zoom / full touch** support.

## Data model & sync impact
- Phase 1 needs **no new synced fields** (item `x/y/w/h/z/type/path/text/color` unchanged;
  now interpreted as world coords) → **no migration**.
- New per-device viewport state → `org.canvasview` (NOT in `SYNC_KEYS`), or in-memory only.
- Phase 3 additions (text/shape items) would add `type` values + a few fields to the synced
  item shape, handled then.

## Files to touch (Phase 1)
- `app.js` (Canvas section ~1951–2173): viewport, coord helpers, pan/zoom handlers,
  selection model, keyboard handlers, reworked drag/resize/create, `buildCanvasItem`,
  `renderCanvas`, `initCanvas`.
- `styles.css` (598–635): viewport transform, grid, `.cvi` selection/handles, tool palette,
  zoom bar; responsive tweaks.
- `index.html` (179–194): tool palette + zoom-bar markup (or build via `el()`).
- `test/run.mjs`: unit tests for `screenToWorld`/`worldToScreen` (+ any clamp helper).
- `.claude/agents/canvas-feature.md`: update to the new model/handlers (per standing rule).

## Risks & mitigations
- **Pointer math at varying zoom** — isolate in the two pure helpers and unit-test them.
- **Smoke test** executes `app.js` at load with a DOM stub — new wheel/pointer listeners
  attach in `initCanvas` (guarded); default `zoom=1` avoids divide-by-zero even with the
  stub's zero-size `getBoundingClientRect`.
- **Scope creep** — Phase 1 is bounded; 2/3 are explicitly deferred.
- **Mobile** — Phase 1 is desktop-first (wheel/drag); pinch-zoom is Phase 3.

## Testing & rollout
- `npm test` green (structure + smoke + new unit tests); manual browser smoke: pan, zoom to
  cursor, fit, select, move-from-body, resize, delete/duplicate, add image (upload/drop/
  paste), add/edit/colour note, persistence + cross-device sync.
- Served-asset change → bump `?v=29 → 30`, update the canvas subagent, ship via `deploy`.

## Decisions needed before implementation
1. **Scope now:** Phase 1 only (recommended), Phase 1+2, or all three?
2. **Zoom gesture:** ⌘/Ctrl+wheel to zoom (Figma/Miro default; plain wheel pans) — or plain
   wheel to zoom?
3. **Touch/pinch:** fine to defer to Phase 3, or needed now?

**Status: APPROVED 2026-08-17 — implementing Phase 1.**
Decisions: (1) Phase 1 only; (2) ⌘/Ctrl+wheel zooms to cursor, plain wheel pans,
Shift+wheel pans horizontally; (3) touch/pinch deferred to Phase 3.
