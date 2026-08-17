---
date: 2026-08-17T13:08:15+00:00
git_commit: 24adcb586fd4d70e0311b931e2f58ce17aaf2645
branch: main
topic: "How does request handling work in this API? Middleware chain, route registration, and authentication enforcement."
tags: [research, codebase, requests, routing, authentication, supabase, ai-endpoint]
status: complete
---

# Research: Request handling, "middleware", routing, and authentication

## Research Question
How does request handling work in this API? I want to understand the middleware chain, how routes are registered, and how authentication is enforced.

## Summary

Khangella's Organizer is a **static, single-page vanilla HTML/CSS/JS frontend with no backend server** (no `package.json` runtime deps, no server framework, no `.listen()`/`createServer`, no server files). Consequently the classic server concepts in the question map onto client-side or hosted-service mechanisms rather than an in-repo API layer:

- **"Request handling"** — there is **no inbound request handling**. All networking is **outbound from the browser** to two hosted services: the AI proxy (`aikeys.maibornwolff.de`, via `fetch`) and **Supabase** (via the `supabase-js` SDK loaded from a CDN `<script>`). See §B.
- **"Middleware chain"** — there is **no middleware framework**. The nearest analog is a single client-side hook: `store.set()` → `window.__ORG_SYNC.onChange(key)` → a debounced push to Supabase, plus an echo-suppression guard (`syncApplying`). See §B.3.
- **"Route registration"** — there is **no server-side URL router**. Navigation is **client-side view switching**: sidebar buttons carrying `data-view="x"` toggle the `.active` class on `<section id="view-x">`. External "routes" are fixed endpoint paths/table names. See §C.
- **"Authentication enforcement"** — the client authenticates against **Supabase Auth** (`signInWithPassword`, persisted JWT session) and **gates UI/requests on `syncUser`**. The **actual read/write authorization is enforced server-side by Supabase** (session validation + any Row-Level Security), configured in the Supabase project **outside this repository**. The AI endpoint uses a **separate `Authorization: Bearer <key>`** unrelated to Supabase. See §D.

### Key files
```
app.js
├─ Navigation — switchView()                                :88–94
├─ AI Assistant — aiComplete(), aiCfg, AI_DEFAULTS          :1034–1237
├─ Cloud Sync — Supabase client, SYNC_KEYS, push/pull/rt    :1239–1421
├─ Cross-device Chat — messages table + realtime            :1423–1553
├─ Canvas — Supabase Storage (upload/signedUrl/remove)      :1951–2173
└─ Init block — wires renders + init* + polling             :2175–2203
index.html
├─ Sidebar nav — .menu-item[data-view]                      :22–62
└─ View sections — <section class="view" id="view-*">       :72–294
```

### Outbound request map
```
Browser (index.html + app.js)
   │  fetch POST — Authorization: Bearer <org.ai key>
   ├───────────────► https://aikeys.maibornwolff.de/v1/chat/completions   (AI proxy; VPN-only)
   │
   │  supabase-js (persisted JWT session)
   ├───────────────► table app_state   — upsert / select  (per-user state blob)
   ├───────────────► table messages    — insert / select + realtime INSERT (chat)
   └───────────────► storage "canvas"  — upload / createSignedUrl / remove (images)
   + realtime channels: "app_state_<uid>" (postgres_changes *), "chat_messages" (INSERT)
```

## Detailed Findings

### A. What does NOT exist (confirmed absence)
There is no inbound HTTP server, middleware pipeline, or server-side route table in this repository:
- No server framework (Express/Fastify/Next/etc.) — `package.json` declares no runtime deps, only `test`/`lint` scripts.
- No `.listen()`/`createServer`, no `server.js`, `api/`, or serverless-function directories.
- `test/run.mjs` runs static checks + a DOM-stub smoke test; it starts no server.
- No URL-path routing (`/todos`, `/shopping`, …) and no API route handlers.

### B. Outbound request handling

**B.1 AI request path — `aiComplete(messages, opts)` (`app.js:1087–1127`)**
- URL built at `app.js:1088`: `aiCfg.base.replace(/\/+$/, "") + "/v1/chat/completions"` (base default `https://aikeys.maibornwolff.de`, `app.js:1041`).
- `fetch(url, { method: "POST", ... })` at `app.js:1094`.
- Headers (`app.js:1096–1099`): `Content-Type: application/json`, `Authorization: "Bearer " + aiCfg.key`.
- Body (`app.js:1100–1105`): `{ model: aiCfg.model, messages, temperature: opts.temperature ?? 0.7, max_tokens: opts.max_tokens ?? 1024 }`.
- Timeout via `AbortController` + `setTimeout(..., opts.timeout ?? 45000)` (`app.js:1089–1090`, cleared `app.js:1116–1118`).
- Error handling (`app.js:1108–1127`): network/CORS (`TypeError`) surfaces a guidance message; `401/403` → auth-failed message; other non-OK → status + body excerpt; success parses JSON and returns `data.choices?.[0]?.message?.content`.
- Caller `sendAi()` (`app.js:1154–1184`) builds the message array from `aiSystemPrompt()` + `aiChat`, and short-circuits at `app.js:1157` if `!aiCfg.key`.

**B.2 Supabase SDK requests** (client created in `initSync()`, `app.js:1408–1421`; `SUPABASE_URL`/`SUPABASE_ANON` at `app.js:1242–1244`)
- Auth: `signInWithPassword` (`app.js:1375`), `getSession` (`app.js:1414`), `signOut` (`app.js:1383`).
- `app_state` table: `upsert(...)` in `pushStateNow()` (`app.js:1313–1315`), `select("data").eq("user_id", …).maybeSingle()` in `pullState()` (`app.js:1329`).
- `messages` table: `select("*").order("created_at", …).limit(100)` in `loadChat()` (`app.js:1483–1487`), `insert({ nick, body, client_id })` in `sendChat()` (`app.js:1524–1528`).
- Storage bucket `canvas`: `upload(path, blob, …)` (`app.js:2118`), `createSignedUrl(path, 3600)` (`app.js:1980`), `remove([path])` (`app.js:2051`).
- Realtime: channel `"app_state_" + userId` on `postgres_changes` (`app.js:1342–1355`, ignores own writes via `payload.new.data._by === syncClientId` at `app.js:1349`); channel `"chat_messages"` on `INSERT` (`app.js:1506–1518`).

**B.3 The one "middleware"-like hook — local-change → cloud-push**
- `store.set()` calls `window.__ORG_SYNC.onChange(key)` after every localStorage write (`app.js:24`).
- The hook (`app.js:1394–1400`) returns early when `syncApplying || !syncUser`, else when `key ∈ SYNC_KEYS` calls `scheduleSyncPush()`.
- `scheduleSyncPush()` debounces 700 ms then calls `pushStateNow()` (`app.js:1320–1325`).
- `syncApplying` (`app.js:1253, 1286, 1306, 1396`) is set `true` around `applyRemoteState()` so applying a remote snapshot does not echo back as a push.

### C. "Routing": client-side view switching

**C.1 `switchView(name)` (`app.js:88–94`)** toggles `.active` on `.menu-item` where `dataset.view === name`, and on `.view` where `id === "view-" + name`. Each `.menu-item` gets a click listener calling `switchView(btn.dataset.view)`.

**C.2 Nav ↔ view pairs (`index.html`)** — each sidebar button `data-view="x"` (`index.html:22–62`) maps to a `<section class="view" id="view-x">`:

| `data-view` | view section |
|---|---|
| `todos` | `#view-todos` (`index.html:73`) |
| `shopping` | `#view-shopping` (`:92`) |
| `recipes` | `#view-recipes` (`:218`) |
| `calendar` | `#view-calendar` (`:109`) |
| `reminders` | `#view-reminders` (`:128`) |
| `raids` | `#view-raids` (`:146`) |
| `tcg` | `#view-tcg` (`:160`) |
| `games` | `#view-games` (`:197`) |
| `canvas` | `#view-canvas` (`:179`) |
| `ai` | `#view-ai` (`:236`) |
| `sync` | `#view-sync` (`:270`) |

(The `test/run.mjs` "Structure" check enforces this nav↔view pairing.)

**C.3 "Registration"/wiring — the Init block (`app.js:2175–2203`)** seeds raids if empty, then calls every `render*()` and `init*()` once at load: `renderTodos/Shopping/CalLegend/Calendar/Reminders/Raids/TCG/Recipes/Games/Canvas`, `initAiConfigUI`, `renderAiSuggestions`, `renderAiChat`, `updateBadges`, then `initRecipes` (`:1789`), `initCanvas` (`:2143`), `initChat` (`:1537`), `initSync` (`:1408`), `refreshNotifNotice`, and `setInterval(checkReminders, 20000)`.

**C.4 External endpoints** — AI: base + `/v1/chat/completions`. Supabase: `SUPABASE_URL`, tables `app_state`/`messages`, storage bucket `canvas`, realtime channels above.

### D. Authentication and where it is enforced

**D.1 Supabase auth setup / sign-in-out**
- `initSync()` (`app.js:1408–1421`): `createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true, autoRefreshToken: true } })`; on load calls `getSession()` and, if a user exists, `onSignedIn()`.
- `syncSignIn(email,password)` (`app.js:1372–1378`) → `signInWithPassword` → `onSignedIn`.
- `onSignedIn(user)` (`app.js:1357–1370`) sets `syncUser = { id, email }`, then `pullState()`, `subscribeRealtime()`, chat/canvas auth refresh + loads.
- `syncSignOut()` (`app.js:1380–1391`) calls `signOut`, clears `syncUser`, removes channels.

**D.2 Feature gating on `syncUser` (client-side)**
- Sync: `pushStateNow` (`app.js:1310–1318`), `pullState` (`app.js:1327–1337`), `subscribeRealtime` (`app.js:1339`) and the `__ORG_SYNC.onChange` hook (`app.js:1396`) each return early when not signed in — so when signed out, changes persist only to localStorage.
- Chat: `updateChatAuth()` disables `#chatw-input` + send button when `!syncUser` (`app.js:1463–1468`); `loadChat`/`subscribeChat`/`sendChat` guard on `!sb || !syncUser` (`app.js:1482, 1504, 1523`).
- Canvas: `canvasReady()` (`app.js:1959–1963`) and `updateCanvasAuth()` (`app.js:1968–1973`) require `sb && syncUser`; uploads/notes early-exit via `canvasReady()`.

**D.3 AI endpoint auth (separate)** — `aiComplete()` sends `Authorization: Bearer <aiCfg.key>` (`app.js:1098`); `aiCfg` comes from localStorage `org.ai` (`app.js:1043`). `org.ai` is in `SYNC_KEYS` (syncs across the user's own devices); `org.aichat` is **not** (stays per-device). The AI feature does not require a Supabase sign-in.

**D.4 Signed URLs (Storage)** — `canvasImageUrl(path)` (`app.js:1975–1984`) requests a 1-hour signed URL (`createSignedUrl(path, 3600)`) and caches it (~55 min); image items store only the `path`, and the `src` is set to the freshly signed URL at render (`app.js:2078–2081`).

**D.5 Where enforcement lives** — The client-side `if (!syncUser)` checks gate UI and avoid firing requests when signed out; they are **not** the authorization boundary. Read/write authorization is determined by **Supabase server-side** — session/JWT validation plus any Row-Level Security policies on `app_state`/`messages` and Storage bucket policies on `canvas` — all configured in the Supabase project, **not present in this repository**. Only the **anon** key is embedded in client source (`app.js:1243–1244`). The AI proxy validates its Bearer key independently and has no knowledge of Supabase sessions.

## Code References
- `app.js:16–26` — `store.set()` writes localStorage and fires `window.__ORG_SYNC.onChange(key)`.
- `app.js:88–94` — `switchView()` client-side view routing.
- `app.js:1041, 1043` — `AI_DEFAULTS` (base endpoint) and `aiCfg` from `org.ai`.
- `app.js:1087–1127` — `aiComplete()` full outbound AI request (URL, headers, body, timeout, errors).
- `app.js:1242–1244` — `SUPABASE_URL` / `SUPABASE_ANON`.
- `app.js:1248` — `SYNC_KEYS` (what syncs; excludes `org.aichat`, `org.nick`).
- `app.js:1310–1337` — `pushStateNow()` / `pullState()` (upsert/select on `app_state`, with sign-in guards).
- `app.js:1320–1325` — `scheduleSyncPush()` 700 ms debounce.
- `app.js:1339–1355` — `subscribeRealtime()` on `app_state`, echo guard `_by`.
- `app.js:1357–1421` — auth lifecycle: `onSignedIn`, `syncSignIn`, `syncSignOut`, `__ORG_SYNC`, `initSync`.
- `app.js:1463–1535` — chat auth gating + `messages` load/insert/subscribe.
- `app.js:1959–1984, 2051, 2110–2133` — canvas auth gating, signed URLs, Storage upload/remove.
- `app.js:2175–2203` — Init block (renders + init* + reminder polling).
- `index.html:22–62` — sidebar `.menu-item[data-view]`.
- `index.html:72–294` — `<section class="view" id="view-*">` sections.

## Architecture Documentation
- **SPA view toggling as "routing":** one HTML document; all views coexist and are shown/hidden by a single `.active` class toggle. No history/URL involvement.
- **localStorage-as-source-of-truth + Supabase-as-sync:** every feature keeps its state in a module variable persisted under an `org.*` key; `store.set` both persists locally and (via the sync hook) schedules a cloud push. `applyRemoteState()` writes a remote snapshot back into localStorage and re-renders all views.
- **Two independent trust domains:** (1) Supabase session (JWT) governs `app_state`, `messages`, and `canvas` Storage; (2) an AI Bearer key governs the AI proxy. They are configured and validated separately.
- **Echo suppression:** the realtime `_by` client-id check and the `syncApplying` flag prevent a device's own writes from bouncing back and re-triggering a push.
- **Client vs. server responsibility:** the repo contains orchestration and UI gating only; authorization/validation for synced data is delegated to hosted Supabase.

## Open Questions
The following are enforced/configured outside this repository and are not observable from the code here:
- The exact **Supabase Row-Level Security policies** on `app_state` and `messages`, and the **Storage bucket policies** on `canvas` (who may read/write which rows/objects).
- The **table schemas** (`app_state`, `messages`) and any DB constraints/triggers.
- The **LiteLLM proxy** key-validation and model-authorization behavior behind `aikeys.maibornwolff.de`.
