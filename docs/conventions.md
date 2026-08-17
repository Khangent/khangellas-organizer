# Conventions

Coding standards and the pattern for extending the app. See
[../Instruction.md](../Instruction.md) for the golden rules.

## Style
- 2-space indent, semicolons, `const`/`let`, double quotes.
- Small pure helpers; `// ===` comment banners between modules.
- **Match the surrounding code** — comment density and naming should read like `app.js`.
- `uid()` for all ids; `org.*` for all localStorage keys.

## DOM construction
Always build DOM with the `el(tag, props, children)` helper — never string-concatenate HTML.
- `class` → `className`, `text` → `textContent`, `onXxx` → `addEventListener(xxx)`.
- Other props → `setAttribute`. Falsy children are skipped.
- Query with `$(sel)` / `$$(sel)` (wrappers over `querySelector`/`querySelectorAll`).

Each feature re-renders its list from state: mutate state → `save.x()` → `renderX()` →
`updateBadges()`.

## Security
- **Never hardcode secrets.** API keys stay in `localStorage`; only the Supabase **anon**
  key (safe to expose) is in source. The repo is public — nothing sensitive is committed.

## Adding a feature or view (follow the existing pattern)
0. **Research + plan first (required):** before touching code, research the relevant areas
   and write a plan to `docs/agents/research/` and `docs/agents/plans/` (`.md`), then **get
   explicit user confirmation**. Only implement once the plan is approved. (RPI skills:
   `rpi-research` → `rpi-plan` → `rpi-implement`.)
1. **State:** `let x = store.get("org.x", default)` and `save.x = () => store.set("org.x", x)`.
2. **View:** add `<section class="view" id="view-x">` in `index.html` **and** a matching
   `<button class="menu-item" data-view="x">` in the sidebar (the test enforces this pair).
3. **Render:** write `renderX()` that clears its container and rebuilds from state via `el()`.
4. **Wire:** attach handlers; after each mutation call `save.x(); renderX(); updateBadges();`.
5. **Init:** call `renderX()` (and any `initX()`) in the Init block at the bottom of `app.js`.
6. **Sync (optional):** to sync across devices, add `"org.x"` to `SYNC_KEYS` **and** load it
   in `applyRemoteState`.
7. **Subagent (required):** add `.claude/agents/x-feature.md` following the existing
   template (name, a "Use for…" description with trigger words, and a body covering the
   view id, state var + `save` key, render/init fns, key DOM ids, data model, sync-key
   membership, and gotchas). Add it to the subagent list in `Instruction.md`. **Every new
   feature gets its own subagent.**
8. **Ship:** bump `?v=` in `index.html`, `npm test`, commit, push (see
   [workflow.md](workflow.md)).

**Keep subagents current:** whenever a feature's state var, render fn, DOM ids, data model,
or sync behaviour changes, update that feature's `.claude/agents/*-feature.md` in the same
change — a stale agent misguides future edits.

## Don'ts
- Don't add a build step or npm **runtime** dependencies without a deliberate decision.
- Don't reintroduce a cloud relay for the AI endpoint (VPN-only — see
  [architecture.md](architecture.md)).
- Don't put per-device values (like the chat nickname) into `SYNC_KEYS`.
- Prefer graceful degradation when signed out/offline (guard on `sb` / `syncUser`).
