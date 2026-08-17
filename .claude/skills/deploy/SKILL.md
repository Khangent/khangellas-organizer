---
name: deploy
description: >-
  Deploy / ship / publish Khangella's Organizer to production (GitHub Pages). Use this
  whenever the user wants their work to go live on the site — phrasings like "deploy",
  "ship it", "push it live", "publish", "get this out", "put it on the site", or right after
  they finish editing a served asset (index.html, app.js, styles.css, tcg-data.js, icons)
  and want it public. It handles the cache-bust version bump, the required test run, syncing
  with the remote, commit, push, and the GitHub Pages build confirmation. If the pending
  change is dev-only (test/, package.json, docs, .claude/), it still applies — it just tests,
  commits, and pushes without a version bump or Pages step.
---

# Deploy Khangella's Organizer

Static app on **GitHub Pages** (`main`, served directly from the repo), so **pushing to
`main` IS the deploy** — Pages rebuilds from the new commit. Work through the steps in
order. If a **critical** step fails (tests red, or a push you can't resolve), stop and fix
before continuing. The final Pages-build check (step 6) is best-effort confirmation, not a
gate.

Throughout, run git as `git -C <repo>` (or `cd <repo>` first) so you act on the intended
repository.

## 1. Inspect, sync info, and classify
```bash
git -C <repo> status --short
git -C <repo> diff --stat
git -C <repo> fetch origin          # read-only: safe with a dirty tree, and it tells you where the remote is
```
Confirm the working tree holds only the change you mean to ship — no stray files and **no
secrets** (API keys must never be committed; only the Supabase *anon* key belongs in
source). You should be on `main`. Note what version the remote already carries (you'll need
it in step 2):
```bash
git -C <repo> show origin/main:index.html | grep -oE '(styles\.css|tcg-data\.js|app\.js)\?v=[0-9]+'
```

Classify the change:
- **Served asset** — `index.html`, `app.js`, `styles.css`, `tcg-data.js`, icons/manifest
  → needs a cache-bust bump (step 2).
- **Dev-only** — `test/`, `package.json`, `docs/`, `.claude/`, `Instruction.md`,
  `make_icons.py` → skip the bump (step 2) and the Pages check (step 6); just test, commit,
  push.

Don't run `git pull --rebase` yet — your change is still uncommitted and a rebase would
refuse a dirty tree. You rebase after committing, in step 5.

## 2. Bump the cache-bust version (served-asset changes only)
Browsers and the CDN cache the assets hard, so every served release needs a fresh `?v=`
key. In `index.html`:
- Read your local versions:
  `grep -oE '(styles\.css|tcg-data\.js|app\.js)\?v=[0-9]+' index.html`
- Set **all three** (`styles.css`, `tcg-data.js`, `app.js`) to the **same new number** =
  (highest version seen **locally** and on **`origin/main`** from step 1) **+ 1**. They must
  stay equal — the test suite enforces it — and strictly greater than anything already
  published, so a genuinely fresh cache key ships.
- Bump the icon/manifest `?v=` only if an icon or the manifest changed (they may lag the
  asset version — that divergence is expected).

## 3. Verify — tests must be green before shipping
```bash
cd <repo> && npm test
```
Never ship a red suite. Tests can't see pixels: for a visual/CSS change (e.g. a colour),
smoke the affected view in a browser if you can; in a headless environment, say so and rely
on the diff plus the user's local check.

## 4. Commit
```bash
git -C <repo> add -A
git -C <repo> commit -m "<concise imperative summary>" \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
The second `-m` puts the required Co-Authored-By trailer on its own line, after a blank
line — use it exactly as written.

## 5. Rebase onto the latest, then push
Now the tree is clean, so bring in anything the remote gained while you worked, then push:
```bash
git -C <repo> pull --rebase origin main
git -C <repo> push origin main
```
If the rebase pulled in a **newer version bump** from the other device (or the push is
**rejected** as non-fast-forward), the remote moved past you: your `?v=` may no longer be
strictly greater. Redo step 2's bump to (new remote version + 1), **re-run step 3 (tests)**,
`git commit --amend` (or a follow-up commit), and push again. Never force-push `main`.

## 6. Confirm the Pages deploy (served-asset changes only; best-effort)
Pages usually rebuilds automatically but can lag. Trigger a build and poll until it reports
`built` at HEAD:
```bash
gh api -X POST repos/:owner/:repo/pages/builds >/dev/null
HEAD=$(git -C <repo> rev-parse HEAD)
for i in $(seq 1 20); do
  read -r STATUS SHA < <(gh api repos/:owner/:repo/pages/builds/latest --jq '"\(.status) \(.commit)"')
  echo "try $i: $STATUS $SHA"
  [ "$STATUS" = "built" ] && [ "$SHA" = "$HEAD" ] && { echo "LIVE"; break; }
  sleep 6
done
```
`gh` resolves `:owner/:repo` from `origin` (`Khangent/khangellas-organizer`). If `gh` isn't
authenticated or can't reach GitHub, don't block on it — the push already deployed; report
that Pages will build shortly and move on.

## 7. Report
Tell the user: the commit hash, the new `?v=` (or "no bump — dev-only"), the test result,
and whether Pages is confirmed **LIVE** (or still building).
