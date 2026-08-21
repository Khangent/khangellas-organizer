---
date: 2026-08-21
git_commit: fc2f4dd
branch: main
topic: "Cross-device sync drops entries (data loss)"
tags: [research, sync, supabase, data-loss]
status: complete
---

# Research: Why sync loses entries across devices

## Research Question
Sync is not working properly across devices — some entries just disappear.

## Summary
The Supabase sync is a **whole-blob, last-write-wins (LWW)** design. Every local
change serializes *all* synced keys into one JSON object and **replaces the entire
cloud row**; every inbound change **overwrites all local keys**. Nothing merges by
item, so concurrent activity on two devices silently discards data.

Sync code lives in one section of `app.js`:

```
app.js
 ├─ store.set (7-26) .............. fires __ORG_SYNC.onChange(key) on every write
 ├─ SYNC_KEYS (1251) .............. 13 keys pushed/pulled as one blob
 ├─ collectState (1277) ........... reads ALL keys from localStorage → one object
 ├─ applyRemoteState (1287) ....... OVERWRITES all local keys, re-renders
 ├─ pushStateNow (1314) ........... upsert: REPLACES the whole cloud row
 ├─ scheduleSyncPush (1324) ....... 700ms debounce
 ├─ pullState (1331) .............. on sign-in: applyRemoteState(cloud)
 ├─ subscribeRealtime (1343) ...... on remote change: applyRemoteState(payload)
 └─ __ORG_SYNC.onChange (1398) .... schedules a push for any SYNC_KEYS write
```

## Detailed Findings

### 1. Whole-blob last-write-wins — the primary cause (app.js:1314-1322, 1277-1284)
`pushStateNow` builds `{ ...collectState(), _by, _ts }` and calls
`upsert({ user_id, data: payload }, { onConflict: "user_id" })`. `collectState`
snapshots the **entire** local state. The upsert **replaces** the row's `data`.

Failure sequence (two signed-in devices A and B):
1. A adds Todo X → A pushes blob (todos include X).
2. Before B receives/applies A's push, B adds Shopping item Y. B's local todo list
   is still the *old* one (no X).
3. B's 700ms debounce fires → B pushes its blob → cloud todos = B's old list.
4. **Todo X is gone.** Because it is one blob, a write to *any* feature discards
   concurrent changes to *every* feature.

### 2. Realtime overwrites an in-flight local edit (app.js:1287-1312, 1324-1329, 1343-1358)
Pushes are debounced 700ms. If a realtime update arrives inside that window,
`applyRemoteState` overwrites localStorage for every key present in the payload —
including the key the user just edited but hasn't pushed yet. The debounce timer is
**never cleared**, so `pushStateNow` then fires and pushes the just-overwritten
state, propagating the loss to the other device.

### 3. No item identity in sync (app.js:1291-1293, 28)
Items carry `id`s (`uid()`, app.js:28) but sync never uses them. `applyRemoteState`
does `localStorage.setItem(k, JSON.stringify(data[k]))` — a wholesale array replace.
There are no deletion tombstones, so a naive union-merge would resurrect deleted
items; that gap is *why* the current code overwrites instead of merging.

### 4. Data shapes of the 13 SYNC_KEYS (app.js:31-40, 945, 1046, 112)
- **Arrays of `{id,...}`** (8): `org.todos, org.shopping, org.events, org.reminders,
  org.raids, org.recipes, org.games, org.canvas` — the entries that "disappear".
- **Maps** (2): `org.tcg` (cardId→bool), `org.callegend` (colorHex→name).
- **Object/scalar** (3): `org.ai` (config), `org.idle` (garden co-op state), `org.theme`.

Deletions happen as `arr.filter(...)` + `save.X()` — there is **no delete hook**, so
tombstones must be derived at the sync layer (diff vs. a remembered snapshot) rather
than recorded at each delete site.

## Code References
- `app.js:1314-1322` — `pushStateNow`: upsert replaces the whole cloud row.
- `app.js:1277-1284` — `collectState`: snapshots all keys into one blob.
- `app.js:1287-1312` — `applyRemoteState`: overwrites all local keys, no merge.
- `app.js:1324-1329` — `scheduleSyncPush`: 700ms debounce, not cleared on remote apply.
- `app.js:1343-1358` — `subscribeRealtime`: applies remote payload verbatim.
- `app.js:1398-1404` — `onChange`: schedules a push for any synced-key write.
- `app.js:7-26` — `store.set`: the single mutation choke point (knows the key).

## Architecture Documentation
Single-row-per-user model: table `app_state (user_id PK, data jsonb, updated_at)`.
Realtime `postgres_changes` filtered by `user_id`; own writes ignored via `_by`
client id (app.js:1252, 1353). All reconciliation is "newest full blob wins."

## Open Questions
- Clock skew between devices affects any timestamp-based LWW tiebreak (acceptable for
  a 2-person app; documented as a known limitation).
- Tombstone retention: needs a TTL prune to avoid unbounded growth.
