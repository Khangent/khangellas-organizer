---
date: 2026-08-17T13:59:06+00:00
git_commit: 5f39a3d4955b43fbc93c81de07a318dac3730abe
branch: main
topic: "Plan: Canvas whiteboard Phase 3"
tags: [plan, canvas, whiteboard, phase3]
status: awaiting-confirmation
---

# Plan: Canvas whiteboard — Phase 3

Builds on Phase 1 (pan/zoom/select) + Phase 2 (multi-select/snapping/palette/copy-paste).
See [2026-08-17-canvas-miro-whiteboard.md](2026-08-17-canvas-miro-whiteboard.md).

## Phase 3 candidate features (from the original plan)
text elements · shapes · connectors/arrows · minimap · undo/redo · pinch/touch.

These differ a lot in value, complexity, and how verifiable they are in this headless
environment. Proposed split:

### 3a — Recommended first slice (bounded, high-value, verifiable)
1. **Undo / redo** (⌘/Ctrl+Z, ⌘/Ctrl+Shift+Z). Per-device, in-memory history of
   `canvasItems` snapshots. `beginChange()` pushes a JSON snapshot before each mutating
   action (add/delete/duplicate/paste/colour, and at drag/resize start); undo pops to the
   past stack, redo to the future stack; capped (~60). Undo then `save.canvas()` so the
   result still syncs. Biggest safety win for a shared board.
2. **Text elements** — a new `type:"text"` item: like a note but transparent (no card
   background/border), just editable text. Reuses the note edit/drag/resize machinery. New
   toolbar button **＋ Text**.
3. **Shapes** — a new `type:"shape"` item with `shape:"rect"|"ellipse"` and a `fill` colour
   (draggable/resizable/selectable, no text). New toolbar button **＋ Shape** (rect/ellipse
   toggle + colour via the existing palette).

**Data/sync:** `type` gains `"text"`/`"shape"`; shapes add `{shape, fill}`. Additive to the
`org.canvas` item shape — **no migration**, existing items untouched. Undo history is
per-device and not synced/persisted.

### 3b — Deferred (bigger or hard to verify headless; do as follow-ups)
- **Connectors / arrows** — needs anchor points, live re-routing on move, endpoint UI;
  highest complexity and risk. Its own phase.
- **Minimap** — a scaled overview with a viewport rect; moderate, nice-to-have.
- **Pinch-zoom / full touch** — gesture handling that can't be exercised in this headless
  sandbox (no touch); best validated on a real device.

## Files to touch (3a)
- `app.js` (Canvas section): history stack + `beginChange`/`undo`/`redo`; `type:"text"` and
  `type:"shape"` in `buildCanvasItem`; `addText`/`addShape`; toolbar wiring; keyboard Z/Y.
- `styles.css`: `.cvi.text` (transparent), `.cvi.shape` (fill, ellipse radius).
- `index.html`: **＋ Text**, **＋ Shape** buttons in the canvas toolbar.
- `test/run.mjs`: unit-test the history stack helper (pure push/undo/redo on snapshots).
- `.claude/agents/canvas-feature.md`: update model + functions.

## Risks & mitigations
- **Undo vs sync/echo:** undo is a local mutation that saves + syncs like any other; the
  `syncApplying` guard already prevents remote-apply echo. History is not affected by remote
  updates (a remote change just replaces items; undo will snapshot from there).
- **Text vs note drag/edit:** reuse the exact note pattern (readonly until click-to-edit) so
  behaviour is consistent.
- **Shape resize/selection** reuses existing handle logic.
- **Smoke test** stays green (new item types render via `el()`; init unchanged).

## Testing & rollout
- `npm test` green (+ history unit test); manual browser smoke of text/shape/undo.
- Served-asset change → bump `?v=31 → 32`, update subagent, ship via `deploy`.

**Status: 3a SHIPPED 2026-08-17 (`?v=32`) — undo/redo + text + shapes.** Connectors,
minimap, and pinch/touch remain as later follow-ups.
