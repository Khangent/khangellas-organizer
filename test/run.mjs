/* ============================================================
   Zero-dependency test harness for Khangella's Organizer.
   No build step, no npm packages — just `node test/run.mjs`.

   Three layers:
     1. LINT     — `node --check` syntax on every JS file.
     2. STRUCTURE— static cross-checks between index.html and app.js
                   (view/menu parity, referenced element IDs exist,
                    no dangling refs, cache-bust versions consistent).
     3. SMOKE + UNIT — actually EXECUTES app.js against a DOM stub so a
                   runtime error at load (or a renamed element / missing
                   function) fails the suite, then unit-tests the real
                   pure functions it exports.
   ============================================================ */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const P = (rel) => fileURLToPath(new URL(rel, root));
const read = (rel) => readFileSync(P(rel), "utf8");

let passed = 0,
  failed = 0;
const fails = [];
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log("  \x1b[32m✓\x1b[0m " + name);
  } catch (e) {
    failed++;
    fails.push(name + " — " + e.message);
    console.log("  \x1b[31m✗\x1b[0m " + name + "\n      " + e.message);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg || "assertion failed");
};
const eq = (a, b, msg) =>
  assert(JSON.stringify(a) === JSON.stringify(b), (msg || "equal") + ` — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const html = read("index.html");
const appSrc = read("app.js");

// ------------------------------------------------------------
// 1. LINT — syntax check every JS file
// ------------------------------------------------------------
console.log("\n\x1b[1mLint / syntax\x1b[0m");
for (const f of ["app.js", "tcg-data.js", "test/run.mjs"]) {
  check(`node --check ${f}`, () => {
    execFileSync(process.execPath, ["--check", P(f)], { stdio: "pipe" });
  });
}

// ------------------------------------------------------------
// 2. STRUCTURE — static cross-checks (HTML ↔ JS)
// ------------------------------------------------------------
console.log("\n\x1b[1mStructure\x1b[0m");

const matchAll = (re, s) => [...s.matchAll(re)].map((m) => m[1]);
const htmlIds = new Set(matchAll(/\bid="([\w-]+)"/g, html));
const dataViews = new Set(matchAll(/data-view="([\w-]+)"/g, html));
const viewSections = new Set(matchAll(/id="view-([\w-]+)"/g, html));

check("every sidebar data-view has a matching #view-* section", () => {
  for (const v of dataViews) assert(viewSections.has(v), `data-view="${v}" has no #view-${v}`);
});
check("every #view-* section has a matching sidebar data-view", () => {
  for (const v of viewSections) assert(dataViews.has(v), `#view-${v} has no data-view button`);
});

// IDs available to JS = static HTML ids ∪ ids created dynamically via el({id:"…"})
const elCreatedIds = new Set(matchAll(/\bid:\s*["']([\w-]+)["']/g, appSrc));
const availableIds = new Set([...htmlIds, ...elCreatedIds]);
// IDs the JS looks up by literal selector `$("#id")` / `$$("#id …")`.
// The trailing lookahead requires the id to end at a quote/space/dot/bracket, so
// interpolated selectors like `$(`#badge-${id}`)` are skipped (they're dynamic).
const referencedIds = new Set(matchAll(/\$\$?\(\s*["'`]#([\w-]+)(?=["'`\s.\]])/g, appSrc));

check("every element ID referenced in app.js exists in the DOM", () => {
  const missing = [...referencedIds].filter((id) => !availableIds.has(id));
  assert(missing.length === 0, "missing element(s): " + missing.join(", "));
});

check("no dangling references to the removed AI recipe-extractor", () => {
  const banned = /\b(runExtract|renderRexResult|sampleVideoFrames|RECIPE_SYS|rexImages|saveDraft|extractRecipe)\b/;
  assert(!banned.test(appSrc), "found a leftover extractor symbol: " + (appSrc.match(banned) || [])[0]);
});

check("cache-bust versions are consistent across served assets", () => {
  const vers = matchAll(/(?:styles\.css|tcg-data\.js|app\.js)\?v=(\d+)/g, html);
  assert(vers.length >= 3, "expected 3 versioned asset links, found " + vers.length);
  assert(new Set(vers).size === 1, "asset ?v= versions differ: " + vers.join(", "));
});

check("every init* function called at startup is defined", () => {
  const called = new Set(matchAll(/\b(init[A-Z]\w+)\(\)/g, appSrc));
  for (const fn of called) assert(new RegExp(`function ${fn}\\b`).test(appSrc), `${fn}() is called but not defined`);
});

check("every SYNC_KEYS entry is reloaded in applyRemoteState()", () => {
  const arr = appSrc.match(/const SYNC_KEYS = \[([^\]]*)\]/);
  assert(arr, "SYNC_KEYS array not found");
  const keys = (arr[1].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ""));
  const start = appSrc.indexOf("function applyRemoteState");
  const end = appSrc.indexOf("async function pushStateNow");
  assert(start !== -1 && end > start, "could not locate applyRemoteState()");
  const body = appSrc.slice(start, end);
  const missing = keys.filter((k) => !body.includes(k));
  assert(missing.length === 0, "synced but not reloaded in applyRemoteState: " + missing.join(", "));
});

check("every save.X() call has a matching setter", () => {
  const objBlock = (appSrc.match(/const save = \{([\s\S]*?)\};/) || [])[1] || "";
  const defined = new Set([
    ...[...objBlock.matchAll(/(\w+):\s*\(\)/g)].map((m) => m[1]),   // object-literal setters
    ...[...appSrc.matchAll(/\bsave\.(\w+)\s*=/g)].map((m) => m[1]), // save.X = ... assignments
  ]);
  const called = [...new Set([...appSrc.matchAll(/\bsave\.(\w+)\(/g)].map((m) => m[1]))];
  const missing = called.filter((k) => !defined.has(k));
  assert(missing.length === 0, "save setter(s) missing for: " + missing.map((m) => "save." + m).join(", "));
});

// ------------------------------------------------------------
// 3. SMOKE — execute app.js end-to-end against a DOM stub
// ------------------------------------------------------------
console.log("\n\x1b[1mIntegration smoke (executes app.js)\x1b[0m");

const canvasCtxStub = new Proxy({}, {
  get: (_, p) => (p === "createLinearGradient" || p === "createRadialGradient")
    ? () => ({ addColorStop() {} })
    : () => {},
});
function makeEl() {
  const node = {
    style: {}, dataset: {}, files: [], children: [], hidden: false, open: false,
    disabled: false, value: "", textContent: "", innerHTML: "", className: "",
    checked: false, scrollTop: 0, scrollHeight: 0, nodeType: 1,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    append() {}, appendChild() {}, prepend() {}, addEventListener() {}, removeEventListener() {},
    setAttribute() {}, removeAttribute() {}, remove() {}, replaceWith() {}, focus() {}, blur() {},
    click() {}, insertBefore() {}, removeChild() {},
    querySelector() { return makeEl(); }, querySelectorAll() { return []; },
    closest() { return makeEl(); },
    getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; },
    getContext: () => canvasCtxStub, width: 0, height: 0, clientWidth: 0, clientHeight: 0,
  };
  return node;
}

function runApp() {
  const storage = new Map();
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  const documentStub = {
    documentElement: makeEl(),
    createElement: () => makeEl(),
    createElementNS: () => makeEl(),
    createTextNode: () => makeEl(),
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  };
  const windowStub = { addEventListener() {}, removeEventListener() {} };
  const noop = () => {};
  const exportsTail =
    "\n;return {num,round1,macroTotals,kcalOf,parseSteamId,personGold,raidStats,fmtGold,GAME_STATUS,PRIORITY_RANK,mkIngredient,GAME_ORDER,clampZoom,screenToWorld,worldToScreen,rectsOverlap,computeSnap,pushCapped,edgePoint,sunGain,growProgress,isRipe,plotCost,plotIndexAtX,recipeMacros};";
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    "window", "document", "localStorage", "alert", "confirm", "prompt", "console",
    "setInterval", "setTimeout", "clearTimeout", "clearInterval", "fetch",
    "AbortController", "Image", "FileReader", "Notification", "requestAnimationFrame", "cancelAnimationFrame",
    appSrc + exportsTail
  );
  return factory(
    windowStub, documentStub, localStorage, noop, () => false, () => null, console,
    () => 0, () => 0, noop, noop, () => Promise.reject(new Error("no network in tests")),
    class { abort() {} constructor() { this.signal = {}; } },
    class { set src(_) {} }, class { readAsDataURL() {} }, undefined, () => 0, noop
  );
}

let api = null;
check("app.js executes at load without throwing", () => {
  api = runApp();
  assert(api && typeof api.macroTotals === "function", "module did not initialize");
});

// ------------------------------------------------------------
// 4. UNIT — the real exported pure functions
// ------------------------------------------------------------
console.log("\n\x1b[1mUnit (real functions)\x1b[0m");
if (!api) {
  check("unit tests", () => assert(false, "skipped — app.js failed to load"));
} else {
  const { num, round1, macroTotals, kcalOf, parseSteamId, personGold, raidStats, fmtGold,
          clampZoom, screenToWorld, worldToScreen, rectsOverlap, computeSnap, pushCapped, edgePoint,
          sunGain, growProgress, isRipe, plotCost, plotIndexAtX, recipeMacros } = api;

  check("num() coerces only positive finite numbers", () => {
    eq(num("5"), 5); eq(num("2.5"), 2.5); eq(num("abc"), 0); eq(num("-3"), 0);
    eq(num(""), 0); eq(num(undefined), 0);
  });
  check("round1() rounds to one decimal", () => { eq(round1(2.34), 2.3); eq(round1(2.35), 2.4); eq(round1(10), 10); });
  check("macroTotals() sums protein/carbs/fat", () => {
    eq(macroTotals([{ protein: "10", carbs: "20", fat: "5" }, { protein: "5" }]), { p: 15, c: 20, f: 5 });
    eq(macroTotals([]), { p: 0, c: 0, f: 0 });
  });
  check("kcalOf() = 4·P + 4·C + 9·F", () => {
    eq(kcalOf({ p: 10, c: 20, f: 5 }), 165); eq(kcalOf({ p: 0, c: 0, f: 0 }), 0);
  });
  check("parseSteamId() extracts an App ID from links/ids", () => {
    eq(parseSteamId("https://store.steampowered.com/app/1245620/Foo/"), "1245620");
    eq(parseSteamId("400"), "400");
    eq(parseSteamId("https://x/?appid=730"), "730");
    eq(parseSteamId("no id here"), "");
    eq(parseSteamId(""), "");
  });
  check("personGold() sums gold from cleared raids only", () => {
    eq(personGold({ characters: [{ raids: [{ done: true, gold: 100 }, { done: false, gold: 50 }] }] }), 100);
    eq(personGold({ characters: [] }), 0);
  });
  check("raidStats() counts done/total", () => {
    eq(raidStats([{ raids: [{ done: true }, { done: false }] }]), { done: 1, total: 2 });
    eq(raidStats([]), { done: 0, total: 0 });
  });
  check("fmtGold() formats with thousands separators", () => { eq(fmtGold(1234), "1,234"); eq(fmtGold(0), "0"); });
  check("clampZoom() clamps zoom to [0.1, 4]", () => { eq(clampZoom(0.05), 0.1); eq(clampZoom(10), 4); eq(clampZoom(1), 1); });
  check("canvas world<->screen coordinate round-trip", () => {
    const view = { panX: 100, panY: 50, zoom: 2 };
    eq(worldToScreen(30, 40, 10, 20, view), { x: 170, y: 150 });
    eq(screenToWorld(170, 150, 10, 20, view), { x: 30, y: 40 });
    eq(screenToWorld(42, 7, 0, 0, { panX: 0, panY: 0, zoom: 1 }), { x: 42, y: 7 });
  });
  check("rectsOverlap() detects intersection (edge-touch = no overlap)", () => {
    eq(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
    eq(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 }), false);
    eq(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 }), false);
  });
  check("computeSnap() snaps a near edge and reports guides", () => {
    const others = [{ x: 100, y: 0, w: 50, h: 50 }];
    const s = computeSnap({ x: 96, y: 200, w: 40, h: 40 }, others, 6); // left edge 96 -> 100
    eq(s.dx, 4);
    eq(s.vlines.includes(100), true);
    eq(computeSnap({ x: 70, y: 200, w: 40, h: 40 }, others, 6).dx, 0); // out of threshold
  });
  check("pushCapped() bounds the undo history", () => {
    eq(pushCapped([1, 2, 3], 4, 3), [2, 3, 4]); // drops oldest at cap
    eq(pushCapped([1], 2, 5), [1, 2]);          // under cap keeps all
  });
  check("edgePoint() projects onto the box border toward a target", () => {
    const box = { x: 0, y: 0, w: 100, h: 100 };
    eq(edgePoint(box, 200, 50), { x: 100, y: 50 }); // right of box -> right-edge midpoint
    eq(edgePoint(box, 50, 200), { x: 50, y: 100 }); // below box  -> bottom-edge midpoint
    eq(edgePoint(box, 50, 50), { x: 50, y: 50 });   // target at centre -> centre
  });
  check("garden: sunGain() = rate × seconds elapsed", () => {
    eq(sunGain(1, 1000), 1); eq(sunGain(2, 5000), 10); eq(sunGain(3, -50), 0);
  });
  check("garden: growProgress() clamps 0..1 over the grow window", () => {
    eq(growProgress(10, 0, 5000), 0.5);   // 10s grow, 5s in -> half
    eq(growProgress(10, 1000, 1000), 0);  // just planted
    eq(growProgress(10, 0, 20000), 1);    // capped at ripe
    eq(growProgress(10, null, 5000), 0);  // empty plot
  });
  check("garden: isRipe() true once grow time elapses", () => {
    eq(isRipe(10, 0, 9999), false); eq(isRipe(10, 0, 10000), true); eq(isRipe(10, null, 1e9), false);
  });
  check("garden: plotCost() rises with plot count", () => {
    eq(plotCost(0), 50); eq(plotCost(3) > plotCost(2), true);
  });
  check("garden: plotIndexAtX() maps a canvas x to a plot (or -1 outside)", () => {
    eq(plotIndexAtX(25, 300, 4, 20), 0);   // first slot
    eq(plotIndexAtX(150, 300, 4, 20), 2);  // middle
    eq(plotIndexAtX(5, 300, 4, 20), -1);   // left of the padding
    eq(plotIndexAtX(295, 300, 4, 20), -1); // right of the padding
  });
  check("recipeMacros() uses recipe totals, else sums legacy per-ingredient", () => {
    eq(recipeMacros({ protein: "20", carbs: "30", fat: "10" }), { p: 20, c: 30, f: 10 });
    eq(recipeMacros({ ingredients: [{ protein: "5", carbs: "5", fat: "2" }, { protein: "5" }] }), { p: 10, c: 5, f: 2 });
    eq(recipeMacros({ protein: "", carbs: "", fat: "" }), { p: 0, c: 0, f: 0 });
  });
}

// ------------------------------------------------------------
// Summary
// ------------------------------------------------------------
console.log(`\n\x1b[1mResult:\x1b[0m ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\n\x1b[31mFailures:\x1b[0m");
  fails.forEach((f) => console.log("  • " + f));
  process.exit(1);
}
process.exit(0);
