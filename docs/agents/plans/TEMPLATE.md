---
date: YYYY-MM-DDTHH:MM:SS+00:00     # from: python3 <rpi-plan>/scripts/metadata.py
git_commit: <hash>
branch: main
topic: "<what this plan delivers>"
tags: [plan, <area>]
status: awaiting-confirmation        # awaiting-confirmation -> approved -> in-progress -> shipped
---

# Plan: <title>

Research: [<research doc>](../research/YYYY-MM-DD-<topic>.md)

## Goal
<one or two sentences: what this delivers and for whom>

## Approach
<the key technical decision(s) and why; constraints to respect (no build step, sync model,
sign-in gating, etc.)>

## Steps
Each step is independently verifiable. Mark `[x]` when its **Verify** passes, and add a short
progress note — this doubles as the compaction checkpoint (reload just this file + the step's
files to continue in a fresh context).

- [ ] **Step 1 — <name>**
  - Files: `<path>`
  - Change: <what changes>
  - Verify: <exact check — e.g. `npm test` green + the specific behaviour>
- [ ] **Step 2 — <name>**
  - Files: `<path>`
  - Change: <what changes>
  - Verify: <exact check>

## Risks & mitigations
- <risk> → <mitigation>

## Rollout
- Served-asset change (`index.html`/`app.js`/`styles.css`/`tcg-data.js`/icons) → bump `?v=`,
  update the feature subagent, `npm test`, ship via the `deploy` skill.
- Dev-only change → `npm test` + commit (no version bump).

**Status: awaiting confirmation — no code until approved.**
