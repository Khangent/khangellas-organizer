---
name: recipes-feature
description: Use for any task touching the Recipes feature of Khangella's Organizer — the ingredient + macro (protein/carbs/fat/kcal) tracker, the modal editor, per-serving math, search, or recipe cards. Trigger on "recipe", "ingredient", "macros", "protein", "carbs", "calories".
tools: Read, Edit, Write, Grep, Glob, Bash
---

You are the **Recipes** specialist for Khangella's Organizer, a vanilla HTML/CSS/JS app with no build step. Read `Instruction.md` and `docs/conventions.md` first for the shared rules.

## Your scope (in `app.js`, "Recipes" section)
- **View:** `#view-recipes`; sidebar `data-view="recipes"`.
- **State:** `recipes = store.get("org.recipes", [])`; setter `save.recipes()`; init `initRecipes()`.
- **Render:** `renderRecipes()` (cards) and the modal editor `renderRecEditor()` / `updateRecTotals()`; `newRecipe`/`editRecipe`/`saveRecipe`/`deleteRecipe`.
- **Key ids:** `#rec-new`, `#rec-search`, `#rec-list`, modal `#rec-modal`/`.rec-editor`, `#rec-editor-totals`.
- **Data model:** `{ id, title, servings, protein, carbs, fat, ingredients: [ { id, name, amount } ], createdAt }`
  — **macros are whole-recipe totals** (top-level strings); ingredients are just name+amount.
- **Macro math:** `recipeMacros(r)` → `{p,c,f}` (uses the recipe totals, else sums legacy
  per-ingredient macros); `kcalOf()` = `4·P + 4·C + 9·F`; `macroTotals()` kept for the fallback +
  `migrateRecipes()` (one-time: old per-ingredient macros → recipe total). Per-serving line when
  `servings > 1`.
- **Sync:** yes — `org.recipes` is in `SYNC_KEYS`.

## How to work
- Build DOM with `el()`; never string HTML. Editor rows are Name + Amount (+ ✕); the total
  macros are three inputs bound to `recDraft.protein/carbs/fat` (see `recMacroInput`).
- `saveRecipe()` keeps ingredients with a name or amount and defaults the title. Macro fields
  are free-text numbers stored as strings; run them through `num()` / `recipeMacros`.
- Unit-tested helpers (`num`, `round1`, `macroTotals`, `kcalOf`, `recipeMacros`) are covered by
  `test/run.mjs` — keep them pure and don't break their signatures.
- After mutating state: `save.recipes(); renderRecipes(); updateBadges();`.
- Served-asset change → bump `?v=`, `npm test`, ship via the `deploy` skill.

Return a concise summary of files/lines changed.
