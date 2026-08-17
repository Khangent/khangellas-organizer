# Workflow

Run, verify, and deploy. See [../Instruction.md](../Instruction.md) for the essentials.

## Run locally
Static — no build. Serve the folder and open it:
```bash
python3 -m http.server 8000     # then visit http://localhost:8000
```
- **Sync / Chat / Canvas** need a Supabase sign-in (Sync view); they degrade gracefully
  when signed out.
- **AI Assistant** only reaches its endpoint on the MaibornWolff VPN; set the key in
  ⚙️ AI settings and leave the Endpoint field blank to use the default.

## Verify changes — REQUIRED after every major commit
```bash
npm test          # == node test/run.mjs
```
The harness exercises the **real** code in four layers:
1. **Lint / syntax** — `node --check` on every JS file.
2. **Structure** — sidebar `data-view` ↔ `#view-*` parity; every `$("#id")` referenced in
   `app.js` exists in the DOM; no dangling refs to removed features; cache-bust `?v=`
   versions consistent; every `init*()` called at startup is defined.
3. **Integration smoke** — actually **executes `app.js`** against a DOM stub, so a
   load-time crash / renamed element / missing function fails the suite.
4. **Unit** — real pure functions (macro totals, `kcal = 4·P + 4·C + 9·F`, Steam-ID parse,
   raid stats/gold, number coercion).

Then **manually smoke-test in a browser**: open the affected view, confirm it renders and
its actions work, and spot-check one unrelated view for regressions. The harness does not
cover CSS/visual layout or live Supabase/network behaviour — verify those by hand.

> Standing rule: after every major commit, run the tests and cross-check that all features
> still work, then report what ran and pass/fail.

## Deploy (GitHub Pages serves `main` directly)
For changes to **served assets** (`index.html`, `app.js`, `styles.css`, `tcg-data.js`,
icons):
1. **Bump the cache-bust version** in `index.html`: `?v=N` → `?v=N+1` on the `styles.css`,
   `tcg-data.js`, and `app.js` links **together** (the test suite enforces they're equal).
2. `git commit` and `git push origin main`.
3. Pages usually redeploys automatically; if it lags, trigger + poll a build:
   ```bash
   gh api -X POST repos/:owner/:repo/pages/builds
   gh api repos/:owner/:repo/pages/builds/latest   # wait for status=built AND commit==HEAD
   ```

Dev-only files (`test/`, `package.json`, `make_icons.py`) are **not** served — changing
them needs no version bump or Pages rebuild.

## Regenerating icons
`make_icons.py` (gitignored, pure-Python, no deps) rasterizes the PNG icons from the pink→
green "K" design. Run it only when the icon changes, then bump icon `?v=` in `index.html`.
