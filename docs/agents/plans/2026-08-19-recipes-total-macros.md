---
date: 2026-08-19T09:15:41+00:00
git_commit: f0bae7ff3c1d557fbf7ad54c0a3bded83c2eaae8
branch: main
topic: "Recipes: total macros at recipe level + roomier ingredient inputs"
tags: [plan, recipes]
status: shipped
---

# Plan: Recipes — recipe-level total macros + readable inputs

Two requests: (1) enter macros **once for the whole recipe** (not per ingredient);
(2) the ingredient **Name/Amount inputs are cramped** — make them roomy/readable.

## Current state (`app.js` "Recipes" section)
- Ingredient: `{ id, name, amount, protein, carbs, fat }`; totals summed via
  `macroTotals(ingredients)`; editor row has 6 columns (name, amount, P, C, F, ✕) → cramped.

## Changes
### Data model
- Ingredient becomes `{ id, name, amount }` (no per-ingredient macros).
- Recipe gains **top-level totals**: `{ …, protein, carbs, fat }` (strings, like the inputs).
- New pure helper `recipeMacros(r)` → `{ p, c, f }`: uses the recipe totals when present, else
  **falls back to summing legacy ingredient macros** (so old recipes still read correctly).
- `kcalOf` unchanged; `macroTotals` kept (used by the fallback + migration) — still unit-tested.

### Migration (safe, one-time)
- `migrateRecipes()` at load: any recipe with per-ingredient macros and no top-level totals →
  **sum them into the recipe totals** and strip the per-ingredient macro fields; `save.recipes()`.
  → no data loss for existing recipes.

### Editor (`renderRecEditor`)
- Ingredient rows: **Name + Amount + ✕** only (3 columns, generous width).
- Add a **"Macros (whole recipe)"** block: three inputs **Protein / Carbs / Fat** (grams) bound
  to `recDraft.protein/carbs/fat`, updating the live Total/Per-serving preview.
- `saveRecipe`: keep ingredients with a name **or** amount; store the recipe totals as entered.

### List/view (`renderRecipes`)
- Card chips + totals use `recipeMacros(r)`.
- The expandable table becomes **Ingredient · Amount** only (drop the P/C/F columns).

### CSS
- `.rec-ing-row` / `.rec-ing-head` → `grid-template-columns: 1fr 140px 32px` (flexible name,
  comfortable amount, small delete); bigger input padding/font.
- New `.rec-macros-row` (3 labelled number inputs).
- `.rec-view-row` → `1fr auto` (Ingredient · Amount). Responsive tweak for phones.

## Steps
- [x] **Step 1 — Model + helper + migration** — recipeMacros + migrateRecipes; unit-tested.
  - `app.js`: `mkIngredient` → name/amount; `recipeMacros`; `migrateRecipes` (call in
    `initRecipes`); `newRecipe`/`editRecipe`/`saveRecipe`/`updateRecTotals` use recipe totals.
  - `test/run.mjs`: unit-test `recipeMacros` (totals + legacy fallback).
  - Verify: `npm test` green.
- [x] **Step 2 — Editor + list UI + CSS** — Name/Amount rows + whole-recipe macros block; roomier.
  - `app.js`: editor rows (Name/Amount/✕) + a Macros(whole-recipe) input block; view table
    Ingredient·Amount. `styles.css`: roomier grids + responsive.
  - Verify: `npm test` (structure/smoke); manual — add a recipe with just names/amounts + one set
    of macros; totals + per-serving compute; existing recipe still shows its macros.
- [x] **Step 3 — Subagent + ship** — recipes-feature updated; ?v=37.
  - Update `.claude/agents/recipes-feature.md` (new model); bump `?v=36 → 37`; `deploy`.

## Risks
- **Legacy recipes:** handled by `migrateRecipes` + the `recipeMacros` fallback.
- **Unit tests:** `macroTotals` test stays; add `recipeMacros`.

## Rollout
Served-asset change → bump `?v=37`, update the recipes subagent, `npm test`, ship via `deploy`.

**Status: awaiting confirmation — no code until approved.** (Existing recipes' per-ingredient
macros will be summed into the new recipe total — say if you'd rather discard them.)
