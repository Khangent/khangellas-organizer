# Architecture

Structure, module map, and design rationale. See [../Instruction.md](../Instruction.md)
for the lean overview.

## Project structure
```
.
├── index.html            # Single page: sidebar + all views + modals. Loads Supabase CDN, tcg-data.js, app.js.
├── app.js                # ~2200 lines. ALL application logic (see module map below).
├── styles.css            # All styling, CSS variables, light/dark themes, responsive @media.
├── tcg-data.js           # Static data: window.TCG_CARDS = [...] (every Espeon & Umbreon card).
│
├── manifest.webmanifest  # PWA manifest (name, theme color, icon references).
├── favicon.svg           # Vector app icon ("K" monogram). icon-180/192/512.png = PWA/Apple icons.
├── make_icons.py         # Pure-Python PNG rasterizer to regenerate icons (GITIGNORED, dev-only).
│
├── test/run.mjs          # Zero-dependency test harness (lint + structure + smoke + unit).
├── package.json          # No deps. Scripts: `test`, `lint`.
│
├── .nojekyll             # GitHub Pages: serve files as-is (no Jekyll).
├── .gitignore            # Ignores make_icons.py.
├── Instruction.md        # Lean session entry point.
└── docs/                 # This folder — deeper docs loaded on demand.
```

## Apps / libraries
Single app, no publishable libs. The "library vs app" split lives *inside* `app.js`:
- **Utility layer** (top of file): `store` (localStorage get/set), `el()`/`$`/`$$` DOM
  helpers, `uid()`, date formatters — reused everywhere.
- **Feature modules**: one `// ===` banner section each; each owns its state variable, its
  `render*()`, its event wiring, and its `save.*()` setter.
- **Static data**: `tcg-data.js` exposes `window.TCG_CARDS`.

## `app.js` module map
Sections appear in this order, each under a `// ===` banner:

| Module | Key state | Entry points | Purpose |
|---|---|---|---|
| Storage helpers | `store`, `save` | `store.get/set` | Persist to localStorage + notify sync |
| DOM helpers | — | `el`, `$`, `$$`, `uid` | Build/query DOM tersely |
| Navigation | — | `switchView` | Sidebar → view switching |
| Theme | `org.theme` | `applyTheme` | Light/dark toggle |
| Badges | — | `updateBadges` | Sidebar open-item counts |
| To-dos | `todos` | `renderTodos` | Tasks w/ due date + priority |
| Shopping | `shopping` | `renderShopping` | Checklist w/ quantities |
| Calendar | `events`, `calLegend` | `renderCalendar` | Month grid, per-person colored events |
| Reminders | `reminders` | `renderReminders`, `checkReminders` | Timed desktop notifications |
| Raid Organizer | `raids` | `renderRaids` | Lost Ark weekly raids; drag-reorder; gold |
| TCG Collector | `tcgOwned` | `renderTCG` | Espeon/Umbreon collection tracker |
| AI Assistant | `aiCfg`, `aiChat` | `sendAi`, `aiComplete` | Chat over OpenAI-compatible proxy |
| Cloud Sync | `syncUser`, `SYNC_KEYS` | `initSync`, `applyRemoteState` | Supabase blob sync + realtime |
| Cross-device Chat | `chatNick` | `initChat`, `sendChat` | Realtime chat via `messages` table |
| Recipes | `recipes` | `renderRecipes` | Ingredient + macro (P/C/F/kcal) tracker |
| Games | `games` | `renderGames` | Backlog w/ Steam cover art |
| Canvas | `canvasItems` | `renderCanvas` | Moodboard; images in Supabase Storage |
| Init (bottom) | — | top-level calls | Seeds raids, renders every view, wires init* |

## Design rationale
- **localStorage is truth, Supabase is sync.** `store.set` writes locally then pushes to
  the cloud; `applyRemoteState` writes an incoming snapshot back into localStorage and
  re-renders everything. Works offline first.
- **Sync model = one JSON blob per user** (`app_state.data`), not normalized tables —
  simplest model for two users syncing a handful of lists. `SYNC_KEYS` is the allow-list of
  `org.*` keys that sync; a `_by` client id prevents an echo loop when realtime broadcasts
  your own write back to you.
- **AI key handling** — entered in-app, stored in `localStorage` (`org.ai`), synced only to
  the user's own signed-in devices via the private Supabase blob, **never committed**.
- **AI endpoint is network-restricted** — `aikeys.maibornwolff.de` only resolves on the
  MaibornWolff VPN. Cloudflare Worker + Supabase Edge Function both fail DNS, so a cloud
  relay can never reach it. Used directly, on the work laptop only. **Do not add a relay.**
- **Canvas** stores images in a private Supabase Storage bucket (`canvas`); only path +
  position/size sync via `org.canvas`; images render via short-lived signed URLs.
- **`org.nick` (chat nickname) is intentionally NOT in `SYNC_KEYS`** — per-device.
