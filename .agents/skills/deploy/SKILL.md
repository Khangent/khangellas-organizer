---
name: deploy
description: >-
  Ship the current changes of Khangella's Organizer to production (GitHub Pages).
  Use when the user says "deploy", "ship it", "push live", or after finishing a change
  to a served asset (index.html, app.js, styles.css, tcg-data.js, icons). Handles the
  cache-bust version bump, the required test run, commit, push, and the Pages build
  trigger + poll. Do NOT use for dev-only changes (test/, package.json, docs) — those
  need no bump or Pages rebuild, just a normal commit.
---

# Deploy Khangella's Organizer

Static app on **GitHub Pages** (`main`, served directly). Follow these steps in order and
stop if any step fails.

## 1. Decide if a version bump is needed
- **Served assets changed** (`index.html`, `app.js`, `styles.css`, `tcg-data.js`, icons)
  → bump required (browsers/CDN cache aggressively).
- **Only dev-only files changed** (`test/`, `package.json`, `docs/`, `.agents/`,
  `make_icons.py`) → skip to step 3 (no bump, no Pages poll).

## 2. Bump the cache-bust version
In `index.html`, find the three `?v=N` query strings on the `styles.css`, `tcg-data.js`,
and `app.js` links and change them **all together** to `N+1`. They must stay equal — the
test suite enforces this. (Bump icon/manifest `?v=` too, but only if an icon changed.)

## 3. Verify — MUST be green before shipping
```bash
npm test
```
If it fails, fix the cause and re-run. Never deploy a red suite. Then browser-smoke the
affected view if you can.

## 4. Commit and push
```bash
git add -A
git commit -m "<concise imperative summary>"   # end with the project's Co-Authored-By trailer
git push origin main
```

## 5. Confirm the Pages deploy (only if step 2 applied)
Pages usually redeploys automatically but can lag. Trigger a build, then poll until it is
`built` AND its commit matches HEAD:
```bash
gh api -X POST repos/:owner/:repo/pages/builds >/dev/null
HEAD=$(git rev-parse HEAD)
for i in $(seq 1 20); do
  read -r STATUS SHA < <(gh api repos/:owner/:repo/pages/builds/latest \
    --jq '"\(.status) \(.commit)"')
  echo "try $i: $STATUS $SHA"
  [ "$STATUS" = "built" ] && [ "$SHA" = "$HEAD" ] && { echo "LIVE"; break; }
  sleep 6
done
```
`gh` resolves `:owner/:repo` from the repo's `origin` remote
(`Khangent/khangellas-organizer`).

## 6. Report
Tell the user the commit hash, the new `?v=` version, whether Pages is confirmed LIVE, and
the result of the test run.
