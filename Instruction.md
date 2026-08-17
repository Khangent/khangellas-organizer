# Instruction.md — Khangella's Organizer

A working guide to **what** this project is, **why** it exists, and **how** to work in it.
Keep this file up to date when the architecture or workflow changes.

---

## WHAT

### Purpose in one line
A private, shared personal-organizer web app for two people (Khang & partner): to-dos,
shopping, calendar, reminders, a Lost Ark raid tracker, a Pokémon TCG collector, a games
backlog, a moodboard canvas, and an AI assistant — all syncing across devices in realtime.

### Tech stack
| Area | Choice | Notes |
|---|---|---|
| Language | **Vanilla HTML + CSS + JavaScript** | ES2020+, no framework, **no build step** |
| Rendering | Hand-rolled DOM via an `el()` helper | No JSX/templating library |
| Local storage | `localStorage` | keys prefixed `org.*`, JSON-encoded |
| Backend / sync | **Supabase** (hosted) | Postgres (`app_state`, `messages`), Realtime, Auth, Storage |
| AI | **MaibornWolff LiteLLM proxy** (`aikeys.maibornwolff.de`) | OpenAI-compatible; **network-restricted to MW VPN** |
| Hosting | **GitHub Pages** | repo `Khangent/khangellas-organizer`, branch `main`, served static |
| PWA | `manifest.webmanifest` + icons | installable, custom app icon + tab favicon |
| Tests | **Zero-dependency Node harness** | `test/run.mjs`, run with `npm test` |

There is **no `node_modules`** and no bundler. Node is used only to run the test harness.
The single third-party runtime dependency is the Supabase JS SDK, loaded from a CDN
`<script>` in `index.html` (not npm-installed).

### Project structure (map of the codebase)
```
.
├── index.html            # Single page: sidebar + all views + modals. Loads Supabase CDN, tcg-data.js, app.js.
├── app.js                # ~2200 lines. ALL application logic (see module map below).
├── styles.css            # All styling, CSS variables, light/dark themes, responsive @media.
├── tcg-data.js           # Static data: window.TCG_CARDS = [...] (every Espeon & Umbreon card).
│
├── manifest.webmanifest  # PWA manifest (name, theme color, icon references).
├── favicon.svg           # Vector app icon (pink→green gradient "K" monogram).
├── icon-180.png          # apple-touch-icon.
├── icon-192.png / icon-512.png  # PWA / Android icons.
├── make_icons.py         # Pure-Python PNG rasterizer that regenerates the icons (GITIGNORED, dev-only).
│
├── test/run.mjs          # Zero-dependency test harness (lint + structure + smoke + unit).
├── package.json          # No deps. Only scripts: `test`, `lint`.
│
├── .nojekyll             # Tells GitHub Pages to serve files as-is (no Jekyll processing).
├── .gitignore            # Ignores make_icons.py.
├── README.md             # Short user-facing readme.
├── Instruction.md        # This file.
└── Plan.md, Test1.jpeg   # Scratch/historical artifacts (not part of the running app).
```

### Apps / libraries
This is a **single app**, not a monorepo — there are no separate apps or shared libs to
publish. Conceptually the "library layer" and "app layer" live inside `app.js`:

- **Utility layer** (top of `app.js`): `store` (localStorage get/set), `el()`/`$`/`$$`
  DOM helpers, `uid()`, date formatters. Reused by every feature.
- **Feature modules** (one clearly-commented section each in `app.js`): each owns its state
  variable, its `render*()` function, its event wiring, and its `save.*()` setter.
- **Static data module**: `tcg-data.js` exposes `window.TCG_CARDS`.

### Module map inside `app.js`
Sections are delimited by `// ===` comment banners, in this order:

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
| TCG Collector | `tcgOwned` | `renderTCG` | Espeon/Umbreon card collection tracker |
| AI Assistant | `aiCfg`, `aiChat` | `sendAi`, `aiComplete` | Chat over OpenAI-compatible proxy |
| Cloud Sync | `syncUser`, `SYNC_KEYS` | `initSync`, `applyRemoteState` | Supabase blob sync + realtime |
| Cross-device Chat | `chatNick` | `initChat`, `sendChat` | Realtime chat via `messages` table |
| Recipes | `recipes` | `renderRecipes` | Ingredient + macro (P/C/F/kcal) tracker |
| Games | `games` | `renderGames` | Backlog w/ Steam cover art |
| Canvas | `canvasItems` | `renderCanvas` | Freeform moodboard; images in Supabase Storage |
| Init (bottom) | — | top-level calls | Seeds raids, renders every view, wires init* |

---

## WHY

### Why the project exists
A couple's shared hub. Everything they track separately (chores, groceries, game raids,
card collecting, date planning) lives in one place that **syncs live between their phones
and laptops** and stays **private** (behind a shared Supabase login; the GitHub repo is
public, so **no secrets are ever committed**).

### Why these technical choices
- **No build step / vanilla JS** — the app is small and personal; zero tooling means it
  can be edited and deployed instantly, and GitHub Pages can serve the files directly.
- **`el()` + `render*()` instead of a framework** — keeps the whole app in one readable
  file with no dependency churn. Each feature re-renders its list from state on change.
- **localStorage as the source of truth, Supabase as the sync** — the app works offline
  first; `store.set` writes locally and *then* pushes to the cloud. `applyRemoteState`
  writes an incoming snapshot back into localStorage and re-renders everything.
- **GitHub Pages** — free, static, and the repo already lives on GitHub.

### Why certain modules are the way they are
- **Cloud Sync** uses a single-row-per-user JSON blob (`app_state.data`) rather than
  normalized tables — simplest possible model for two users syncing a handful of lists.
  `SYNC_KEYS` is the allow-list of `org.*` keys that sync; a `_by` client id prevents an
  echo loop when realtime broadcasts your own write back to you.
- **AI Assistant key handling** — the API key is entered in-app and stored in
  `localStorage` (`org.ai`). It **syncs only to the user's own signed-in devices** via the
  private Supabase blob, and is **never committed** (the site is public).
- **AI endpoint is network-restricted** — `aikeys.maibornwolff.de` only resolves on the
  MaibornWolff network/VPN. A cloud relay can *never* reach it (confirmed: Cloudflare
  Worker + Supabase Edge Function both fail DNS). So the assistant is used **directly, on
  the work laptop only**. Do not reintroduce a relay for it.
- **Canvas** stores images in a private Supabase Storage bucket (`canvas`) and only syncs
  the path + position/size via `org.canvas`; images render via short-lived signed URLs.
- **Chat nickname (`org.nick`) is intentionally NOT in `SYNC_KEYS`** — it's per-device.

---

## HOW

### How to run the app
It's static — no build. Serve the folder and open it:
```bash
python3 -m http.server 8000     # then visit http://localhost:8000
```
(Opening `index.html` directly via `file://` mostly works, but a local server is closer to
production and avoids some browser restrictions.)

- **Sync / Chat / Canvas** need a Supabase sign-in (Sync view). They degrade gracefully
  when signed out.
- **AI Assistant** only reaches the endpoint from the MaibornWolff network/VPN; set the key
  in ⚙️ AI settings. Leave the Endpoint field blank to use the default.

### How to verify changes (REQUIRED after every major commit)
Run the test suite — it must be green before you consider a change done:
```bash
npm test          # == node test/run.mjs
```
The harness has four layers and exercises the **real** code:
1. **Lint / syntax** — `node --check` on every JS file.
2. **Structure** — sidebar `data-view` ↔ `#view-*` parity, every `$("#id")` referenced in
   `app.js` exists in the DOM, no dangling references to removed features, cache-bust
   `?v=` versions consistent, every `init*()` called at startup is defined.
3. **Integration smoke** — actually **executes `app.js` end-to-end** against a DOM stub, so
   a load-time crash / renamed element / missing function fails the suite.
4. **Unit** — the real pure functions (macro totals, `kcal = 4·P + 4·C + 9·F`, Steam-ID
   parsing, raid stats/gold, number coercion).

Then **manually smoke-test in a browser**: open the affected view, confirm it renders and
its actions work, and spot-check one unrelated view for regressions. The harness does not
cover CSS/visual layout or live Supabase/network behaviour — verify those by hand.

> Standing rule: **after every major commit, run the tests and cross-check that all
> features still work**, then report what ran and pass/fail.

### How to deploy
GitHub Pages serves `main` directly. To ship a change to **served assets**
(`index.html`, `app.js`, `styles.css`, `tcg-data.js`, icons):
1. **Bump the cache-bust version** in `index.html` — change `?v=N` → `?v=N+1` on the
   `styles.css`, `tcg-data.js`, and `app.js` links **together** (the test suite enforces
   they stay equal). This defeats the browser/CDN cache.
2. `git commit` and `git push origin main`.
3. Pages usually redeploys automatically; if it lags, trigger + poll a build:
   ```bash
   gh api -X POST repos/:owner/:repo/pages/builds
   gh api repos/:owner/:repo/pages/builds/latest    # wait for status=built AND commit==HEAD
   ```
Dev-only files (`test/`, `package.json`, `make_icons.py`) are **not** served, so changing
them needs no version bump or Pages rebuild.

### How to add a feature (follow the existing pattern)
1. **State**: add `let x = store.get("org.x", default)` and `save.x = () => store.set("org.x", x)`.
2. **View**: add a `<section class="view" id="view-x">` in `index.html` and a matching
   `<button class="menu-item" data-view="x">` in the sidebar (the test enforces this pair).
3. **Render**: write `renderX()` that clears its container and rebuilds from state using `el()`.
4. **Wire**: attach event handlers; call `save.x(); renderX(); updateBadges();` after mutations.
5. **Init**: call `renderX()` (and any `initX()`) in the Init block at the bottom of `app.js`.
6. **Sync**: if it should sync across devices, add `"org.x"` to `SYNC_KEYS` **and** load it
   in `applyRemoteState`.
7. **Deploy**: bump `?v=`, commit, push, `npm test`.

### How to follow standards / conventions
- **Match the surrounding code** — 2-space indent, semicolons, `const`/`let`, double quotes,
  small pure helpers, comment banners between modules. Comment density and naming should
  read like the existing file.
- **Build DOM with `el(tag, props, children)`** — `class`→className, `text`→textContent,
  `onXxx`→`addEventListener`; never string-concatenate HTML.
- **Never hardcode secrets.** API keys stay in `localStorage`; only the Supabase **anon**
  key (safe to expose) lives in source. Nothing sensitive is committed — the repo is public.
- **`uid()`** for all ids; **`org.*`** for all localStorage keys.
- **Keep `SYNC_KEYS` and `applyRemoteState` in lockstep** for anything that must sync.
- **Do not add a build step or npm runtime dependencies** without a deliberate decision —
  the no-build simplicity is a feature.
- Prefer **graceful degradation** when signed out or offline (guard on `sb`/`syncUser`).
