---
date: 2026-08-21
git_commit: fc2f4dd
branch: main
topic: "Fix cross-device data loss with item-level merge sync"
tags: [plan, sync, supabase, data-loss]
status: shipped
---

# Plan: Item-level merge sync (stop entries disappearing)

Replace whole-blob last-write-wins with **per-item merge** so concurrent activity on
two devices never drops data. See research: `docs/agents/research/2026-08-21-sync-data-loss.md`.

Chosen scope (confirmed): **Full item-level merge** — merge by item id + deletion
tombstones + per-item `updatedAt`, plus fix the realtime/pending-edit race.

## Design (all contained in the sync layer of `app.js` — no feature-code changes)

### Merge metadata, derived generically (no per-feature edits)
Feature code never touches merge metadata. The sync layer keeps a local **shadow** of
what it last saw, persisted in localStorage under `org._syncmeta` (NOT a SYNC_KEY):

```
syncMeta = {
  ua:   { "org.todos": { <id>: <updatedAtMs> }, ... },  // per-item last-changed
  tomb: { "org.todos": { <id>: <deletedAtMs> }, ... },  // deletion tombstones
  kv:   { "org.theme": <updatedAtMs>, ... }             // whole-value keys
}
```

**Deriving `updatedAt` / tombstones at collect time (generic, no delete hook needed):**
For each array key, compare the current local array against `syncMeta.ua`:
- id new to the shadow → `ua[id] = now` (an add).
- id present but the item's JSON changed vs. last collected → `ua[id] = now` (an edit).
- id in the shadow but absent now → `tomb[id] = now` (a delete), drop from `ua`.
- unchanged → keep the existing `ua[id]`.

The shadow's item JSON is remembered so change-detection works across reloads. This
means a delete made **offline** is still turned into a tombstone on next sync.

### Merge function (pure, unit-tested)
`mergeState(local, remote, meta)` returns `{ merged, meta }`. Per key, by policy:

- **Array-of-id keys** (`todos, shopping, events, reminders, raids, recipes, games,
  canvas`): union by `id`. For each id take the side with the greater `updatedAt`; if
  a tombstone (either side) has ts ≥ that item's `updatedAt`, the item is **removed**.
  Tombstones merge by `max(ts)`. → concurrent adds: both kept. deletes: stay deleted.
  same-item edit: newest wins.
- **Map keys** (`tcg`, `callegend`): union of map keys; per map-key LWW by the key's
  `updatedAt` (tracked in `ua` under a synthetic id = the map key). Removed map-keys
  tombstoned the same way. (Unlocking a card / setting a legend colour never clobbers.)
- **Object/scalar keys** (`ai`, `idle`, `theme`): whole-value LWW by `kv[key]`
  `updatedAt`, so an *unchanged* device can't overwrite a *changed* one.

Payload gains `_meta` (the `ua`/`tomb`/`kv` maps) alongside `_by`/`_ts`.

### Both directions merge (push and apply)
- **pushStateNow**: derive meta → **read current cloud row** → `mergeState(localCloud=cloud,
  incoming=local)` → write merged `data` + merged `_meta`. Merge is order-independent
  (union + max-ts), so interleaved writes from two devices converge; only a same-item
  concurrent *edit* resolves by newest ts (acceptable). Adds are never dropped.
- **applyRemoteState**: `mergeState(local, remote)` → write merged result to
  localStorage, refresh in-memory vars, update the shadow, re-render. **No blind
  overwrite**, so a pending local edit survives (it is newer) — this also fixes the
  realtime-clobbers-in-flight-edit race. Still fire the pending push afterward to
  propagate the merged result.

### Tombstone hygiene
Prune tombstones older than 30 days on load (both devices will have converged long
before). Keeps `org._syncmeta` bounded.

### Clock skew
`updatedAt` uses `Date.now()`; large skew between devices could mis-order same-item
edits. Acceptable for a 2-person app; noted as a known limitation. (No change to adds/
deletes correctness — only same-item edit tiebreak.)

## Steps
- [x] **Step 1 — Pure merge core + meta derivation.** Added `SYNC_POLICY`, `deriveMeta`,
  `mergeState`, `pruneTombstones`, `sameForSync` + helpers (`toItemMap`/`fromItemMap`/
  `hashStr`/`legacyMeta`/`stripMeta`). Exported for tests.
- [x] **Step 2 — Wire push.** `pushStateNow`: derive meta → read cloud row → merge → write
  merged `data`+`_meta`; reflect cloud-only newer items locally; persist shadow.
- [x] **Step 3 — Wire apply.** `applyRemoteState(payload)`: merge remote into local via
  `payload._meta`, write back, update shadow, `refreshInMemoryAndRender()`, converge-push
  only when we hold extra items. `_by` echo-guard kept.
- [x] **Step 4 — Tests + ship.** 8 merge unit tests + `SYNC_POLICY` structure check + reload
  check retargeted to `refreshInMemoryAndRender`; sync subagent updated; `?v=37→38`;
  `npm test` → 42/42; deployed.

## Tests (`test/run.mjs`, pure)
- concurrent adds on both devices → union keeps both.
- delete on A while B unchanged → item stays deleted (tombstone beats stale item).
- delete on A, edit same item on B with newer ts → edit wins (resurrects) / older →
  stays deleted (define + assert the rule: newest timestamp wins).
- same-item edit on both → newest `updatedAt` wins.
- map key (tcg unlock) added on A, different unlock on B → both present.
- scalar (theme) changed on A only → A's value wins over unchanged B.
- `deriveMeta` turns an add/edit/delete into the right `ua`/`tomb` entries.
- `pruneTombstones` drops >30-day entries, keeps recent.

## Risks / mitigations
- **Regression surface:** sync is central. Mitigate with pure, unit-tested merge core
  and the integration smoke that executes `app.js` headlessly.
- **Meta growth:** bounded by tombstone prune.
- **Migration:** none — items unchanged on disk; `org._syncmeta` is created lazily and
  seeded from current local state on first run (everything treated as "present now").
- **Backward compat:** a payload without `_meta` (old client) → treat all remote items
  as `updatedAt=0` so local (stamped `now` on first derive) wins; still a safe union,
  no loss. Both devices run the same code after deploy anyway.

## Rollout
Served-asset change → bump `?v=38`, update sync subagent, `npm test`, ship via `deploy`.

**Status: awaiting confirmation — no code until approved.**
