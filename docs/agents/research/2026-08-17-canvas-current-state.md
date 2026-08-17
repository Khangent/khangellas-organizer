---
date: 2026-08-17T13:29:34+00:00
git_commit: 67370973d32f8b5fc660937238607d19af60f258
branch: main
topic: "Current state of the Canvas (moodboard) feature"
tags: [research, codebase, canvas, supabase-storage]
status: complete
---

# Research: Canvas feature — current state

## Research Question
Document how the Canvas feature currently works (structure, interactions, persistence,
styling) as a baseline for a Miro-like whiteboard redesign.

## Summary
Canvas is a shared freeform board where signed-in users place **images** (stored in Supabase
Storage) and **sticky notes** on a fixed-size surface, then drag/resize them. It is
implemented entirely in the "Canvas" section of `app.js` (`app.js:1951–2173`), styled in
`styles.css:598–635`, with markup at `index.html:179–194`.

```
Canvas feature
├─ index.html:179–194     view + toolbar (＋Image, ＋Note, status, hidden file input) + board/surface
├─ styles.css:598–635     .canvas-board (scroll), .canvas-surface (2200×1500), .cvi*, .cvi-resize
└─ app.js:1951–2173       state, auth gating, signed URLs, drag/resize, render, add/upload
```

## Detailed Findings

### Data model & state
- Items array `canvasItems = store.get("org.canvas", [])`; setter `save.canvas()`.
- Item shape: `{ id, type: "image"|"note", path?, text?, color?, x, y, w, h, z }`.
  - `image` items store a Supabase Storage `path` (e.g. `uid.jpg`); the pixels live in the
    bucket, not in the item.
  - `note` items store `text` and a `color` (from `NOTE_COLORS`, `app.js:1955`).
- `CVI_BAR = 26` (drag-bar height, `app.js:1954`); `canvasZ` tracks the top z-index.
- Signed-URL cache `canvasUrlCache` (`app.js:1957`).

### Coordinate system & viewport
- The board `#canvas-board` is a **fixed 72vh scrollable box** with a static dotted-grid
  background (`styles.css:601–607`).
- The inner `#canvas-surface` is a **fixed 2200×1500 px** absolutely-positioned plane
  (`styles.css:608`). Items are absolutely positioned by their `x/y/w/h`.
- **No zoom and no pan** — the only navigation is native scrollbars on the board.
- New items are placed with a small staggered offset near the current scroll position
  (`canvasPlacePos()`, `app.js:1995–1999`).

### Interactions
- **Move:** only by grabbing the item's **top bar** (`.cvi-bar`), via pointer events in
  `startDrag()` (`app.js:2007–2024`); position clamps at ≥0 and saves on pointer-up. The
  body itself is not a drag handle.
- **Resize:** only via the **bottom-right handle** (`.cvi-resize`), `startResize()`
  (`app.js:2026–2044`), min 90×60.
- **Z-order:** `bringToFront()` (`app.js:2001–2005`) bumps `z` on drag/resize/press.
- **Add image:** toolbar `＋Image` → hidden file input; also **drag-drop a file** onto the
  board and **paste** an image (Ctrl/Cmd+V while the canvas view is active) — all routed to
  `handleCanvasFile()` (`app.js:2110–2133`), which downsizes via `resizeImage(file,1600,…)`,
  uploads to the `canvas` bucket, and appends an item sized to the image aspect ratio.
- **Add note:** toolbar `＋Note` → `addCanvasNote()` (`app.js:2135–2141`); a `<textarea>`
  (`.cvi-note`) whose input saves `item.text`; a colour button cycles `NOTE_COLORS`.
- **Delete:** per-item `✕` in the bar → `deleteCanvasItem()` (`app.js:2046–2053`), which also
  removes the image object from Storage.
- Wiring in `initCanvas()` (`app.js:2143–2173`): toolbar buttons, file input, board
  dragover/drop, and a window-level paste listener gated to the active canvas view.

### Rendering
- `renderCanvas()` (`app.js:2101–2108`) clears `#canvas-surface` and rebuilds every item
  node via `buildCanvasItem()` (`app.js:2055–2099`). Drag/resize update the node's inline
  style directly and persist on release (no full re-render mid-gesture).
- Each node `.cvi` = a `.cvi-bar` (grip, optional colour swatch for notes, delete) + a
  `.cvi-body` (image `<img>` or note `<textarea>`) + a `.cvi-resize` handle
  (`styles.css:610–635`).

### Persistence & auth
- `org.canvas` is in `SYNC_KEYS` — but **only** item `path` + geometry (`x/y/w/h/z`) + note
  `text/color` sync; images themselves are in Supabase Storage.
- Image URLs are short-lived **signed URLs** via `canvasImageUrl()` (`createSignedUrl(path,
  3600)`, cached ~55 min, `app.js:1975–1984`); the node's `<img src>` is set to the signed
  URL at render (`app.js:2078–2081`).
- The feature requires a signed-in Supabase session: `canvasReady()` (`app.js:1959–1963`)
  and `updateCanvasAuth()` (`app.js:1968–1973`) disable the add buttons and show a hint when
  `!(sb && syncUser)`.

## Code References
- `app.js:1954–1957` — `CVI_BAR`, `NOTE_COLORS`, `canvasZ`, `canvasUrlCache`.
- `app.js:1959–1973` — auth gating (`canvasReady`, `setCanvasStatus`, `updateCanvasAuth`).
- `app.js:1975–1993` — `canvasImageUrl` (signed URLs), `imgDims`.
- `app.js:1995–2005` — `canvasPlacePos`, `bringToFront`.
- `app.js:2007–2044` — `startDrag`, `startResize` (pointer-event move/resize).
- `app.js:2046–2099` — `deleteCanvasItem`, `buildCanvasItem`.
- `app.js:2101–2141` — `renderCanvas`, `handleCanvasFile`, `addCanvasNote`.
- `app.js:2143–2173` — `initCanvas`.
- `styles.css:598–635` — all Canvas styling.
- `index.html:179–194` — view, toolbar, board/surface.

## Architecture Documentation
- Absolute-positioned items on a fixed-size plane; navigation via native scroll only.
- Drag is bar-only; resize is corner-only; z-order via bring-to-front on interaction.
- localStorage-as-truth + Supabase (Storage for pixels, `org.canvas` blob for geometry).
- Full-rebuild render, with direct inline-style updates during a gesture.

## Open Questions (out of repo)
- The `canvas` Storage bucket's access policies (who may read/write objects) are configured
  in Supabase, not in this repo.
