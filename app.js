/* ============================================================
   My Organizer — vanilla JS single-page app
   Data is persisted in localStorage. No build step required.
   ============================================================ */

// ---------- Storage helpers ----------
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("Storage failed for", key, e);
      alert("Couldn't save — your browser storage is full. Try using fewer or smaller character photos.");
    }
    // Push local changes to the cloud (no-op until sync is initialized + signed in)
    if (window.__ORG_SYNC) window.__ORG_SYNC.onChange(key);
  },
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- App state ----------
let todos = store.get("org.todos", []);
let shopping = store.get("org.shopping", []);
let events = store.get("org.events", []);
let calLegend = store.get("org.callegend", {}); // color(hex) -> person name
let reminders = store.get("org.reminders", []);
let raids = store.get("org.raids", []);
let recipes = store.get("org.recipes", []);
let games = store.get("org.games", []);
let canvasItems = store.get("org.canvas", []);
let garden = store.get("org.idle", null);

const save = {
  todos: () => store.set("org.todos", todos),
  shopping: () => store.set("org.shopping", shopping),
  events: () => store.set("org.events", events),
  reminders: () => store.set("org.reminders", reminders),
  raids: () => store.set("org.raids", raids),
  recipes: () => store.set("org.recipes", recipes),
  games: () => store.set("org.games", games),
  canvas: () => store.set("org.canvas", canvasItems),
  callegend: () => store.set("org.callegend", calLegend),
  idle: () => store.set("org.idle", garden),
};

// ---------- Small DOM helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function")
      node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c) node.append(c.nodeType ? c : document.createTextNode(c));
  });
  return node;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ============================================================
//  Navigation
// ============================================================
function switchView(name) {
  $$(".menu-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
}
$$(".menu-item").forEach((btn) =>
  btn.addEventListener("click", () => switchView(btn.dataset.view))
);

// ============================================================
//  Theme
// ============================================================
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const isDark = theme === "dark";
  $(".theme-toggle .icon").textContent = isDark ? "☀️" : "🌙";
  $(".theme-label").textContent = isDark ? "Light mode" : "Dark mode";
  store.set("org.theme", theme);
}
$("#theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});
applyTheme(store.get("org.theme", "light"));

// ============================================================
//  Badges (open-item counts in sidebar)
// ============================================================
function setBadge(id, count) {
  const badge = $(`#badge-${id}`);
  badge.textContent = count;
  badge.classList.toggle("show", count > 0);
}
function updateBadges() {
  setBadge("todos", todos.filter((t) => !t.done).length);
  setBadge("shopping", shopping.filter((s) => !s.done).length);
  setBadge("reminders", reminders.filter((r) => !r.notified).length);
  const rs = raidStats(allCharacters());
  setBadge("raids", rs.total - rs.done);
  setBadge("tcg", TCG_ALL.filter((c) => !tcgOwned[c.id]).length);
  setBadge("games", games.filter((g) => g.status === "want").length);
  setBadge("garden", gardenRipeCount());
}

// ============================================================
//  To-dos
// ============================================================
const PRIORITY_RANK = { high: 0, med: 1, low: 2 };
const PRIORITY_LABEL = { high: "High", med: "Medium", low: "Low" };

function renderTodos() {
  const list = $("#todo-list");
  list.innerHTML = "";

  const sorted = [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    if (a.due && !b.due) return -1;
    if (!a.due && b.due) return 1;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });

  if (!sorted.length) {
    list.append(el("div", { class: "empty", text: "No to-dos yet. Add one above! 🎉" }));
  }

  const today = todayISO();
  sorted.forEach((t) => {
    const meta = el("div", { class: "card-meta" }, [
      el("span", { class: `tag prio-${t.priority}`, text: PRIORITY_LABEL[t.priority] }),
    ]);
    if (t.due) {
      const overdue = !t.done && t.due < today;
      meta.append(
        el("span", {
          class: `tag due ${overdue ? "overdue" : ""}`,
          text: (overdue ? "Overdue · " : "Due ") + fmtDate(t.due),
        })
      );
    }

    list.append(
      el("div", { class: `card ${t.done ? "done" : ""}` }, [
        el("button", {
          class: `check ${t.done ? "on" : ""}`,
          title: "Toggle done",
          onclick: () => {
            t.done = !t.done;
            save.todos();
            renderTodos();
            updateBadges();
          },
        }),
        el("div", { class: "card-body" }, [
          el("div", { class: "card-title", text: t.text }),
          meta,
        ]),
        el("button", {
          class: "icon-btn",
          title: "Delete",
          text: "🗑",
          onclick: () => {
            todos = todos.filter((x) => x.id !== t.id);
            save.todos();
            renderTodos();
            updateBadges();
            renderCalendar();
          },
        }),
      ])
    );
  });
}

$("#todo-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("#todo-text").value.trim();
  if (!text) return;
  todos.push({
    id: uid(),
    text,
    done: false,
    due: $("#todo-due").value || null,
    priority: $("#todo-priority").value,
  });
  save.todos();
  e.target.reset();
  $("#todo-priority").value = "med";
  renderTodos();
  updateBadges();
  renderCalendar();
});

// ============================================================
//  Shopping
// ============================================================
function renderShopping() {
  const list = $("#shopping-list");
  list.innerHTML = "";

  const sorted = [...shopping].sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
  if (!sorted.length) {
    list.append(el("div", { class: "empty", text: "Your shopping list is empty. 🛒" }));
  }

  sorted.forEach((s) => {
    list.append(
      el("div", { class: `card ${s.done ? "done" : ""}` }, [
        el("button", {
          class: `check ${s.done ? "on" : ""}`,
          title: "Toggle",
          onclick: () => {
            s.done = !s.done;
            save.shopping();
            renderShopping();
            updateBadges();
          },
        }),
        el("div", { class: "card-body" }, [el("div", { class: "card-title", text: s.name })]),
        el("span", { class: "qty-pill", text: `×${s.qty}` }),
        el("button", {
          class: "icon-btn",
          title: "Delete",
          text: "🗑",
          onclick: () => {
            shopping = shopping.filter((x) => x.id !== s.id);
            save.shopping();
            renderShopping();
            updateBadges();
          },
        }),
      ])
    );
  });
}

$("#shopping-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#shopping-name").value.trim();
  if (!name) return;
  const qty = Math.max(1, parseInt($("#shopping-qty").value, 10) || 1);
  shopping.push({ id: uid(), name, qty, done: false });
  save.shopping();
  e.target.reset();
  $("#shopping-qty").value = 1;
  renderShopping();
  updateBadges();
});

$("#shopping-clear-done").addEventListener("click", () => {
  shopping = shopping.filter((s) => !s.done);
  save.shopping();
  renderShopping();
  updateBadges();
});

// ============================================================
//  Calendar
// ============================================================
let calYear, calMonth; // currently viewed month
{
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Palette used to colour events by person — two users only
const CAL_COLORS = ["#f6a5c0", "#a5d6a7"];
const DEFAULT_CAL_COLOR = "#f6a5c0";
let calSelColor = CAL_COLORS[0];
let calModalDate = null;

function itemsForDate(iso) {
  const evts = events
    .filter((e) => e.date === iso)
    .map((e) => ({ type: "event", id: e.id, title: e.title, color: e.color || DEFAULT_CAL_COLOR }));
  const dueTodos = todos
    .filter((t) => t.due === iso && !t.done)
    .map((t) => ({ type: "todo", title: t.text }));
  return [...evts, ...dueTodos];
}

function renderCalendar() {
  $("#cal-title").textContent = `${MONTHS[calMonth]} ${calYear}`;
  const grid = $("#cal-grid");
  grid.innerHTML = "";

  // Monday-first offset
  const firstDay = new Date(calYear, calMonth, 1);
  let offset = firstDay.getDay() - 1;
  if (offset < 0) offset = 6;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = todayISO();

  // Leading cells from previous month
  const prevDays = new Date(calYear, calMonth, 0).getDate();
  for (let i = offset - 1; i >= 0; i--) {
    grid.append(el("div", { class: "cal-cell muted" }, [
      el("span", { class: "cal-date", text: String(prevDays - i) }),
    ]));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const cell = el("div", { class: `cal-cell ${iso === today ? "today" : ""}` }, [
      el("span", { class: "cal-date", text: String(day) }),
    ]);
    itemsForDate(iso)
      .slice(0, 3)
      .forEach((it) => {
        if (it.type === "event") {
          const who = calLegend[it.color];
          const pill = el("div", {
            class: "cal-event",
            style: `background:${it.color};color:#22252b`,
            title: (who ? who + " · " : "") + it.title + "  (click to delete)",
            text: it.title,
          });
          pill.addEventListener("click", (e) => {
            e.stopPropagation();
            if (confirm(`Delete event “${it.title}”?`)) {
              events = events.filter((x) => x.id !== it.id);
              save.events();
              renderCalendar();
            }
          });
          cell.append(pill);
        } else {
          cell.append(el("div", { class: "cal-event todo", text: it.title, title: it.title }));
        }
      });
    cell.addEventListener("click", () => openEventModal(iso));
    grid.append(cell);
  }
}

// ----- Add-event modal (title + colour picker) -----
function renderModalColors() {
  const wrap = $("#cal-ev-colors");
  wrap.innerHTML = "";
  CAL_COLORS.forEach((c) => {
    const name = calLegend[c];
    wrap.append(
      el("button", {
        type: "button",
        class: `cal-swatch ${c === calSelColor ? "sel" : ""}`,
        style: `background:${c}`,
        title: name || "Unnamed colour",
        onclick: () => { calSelColor = c; renderModalColors(); },
      }, name ? [el("span", { class: "cal-swatch-name", text: name })] : [])
    );
  });
}
function openEventModal(iso) {
  calModalDate = iso;
  $("#cal-modal-title").textContent = "Add event · " + fmtDate(iso);
  $("#cal-ev-title").value = "";
  renderModalColors();
  $("#cal-modal").hidden = false;
  setTimeout(() => $("#cal-ev-title").focus(), 0);
}
function closeEventModal() {
  $("#cal-modal").hidden = true;
  calModalDate = null;
}
function addEventFromModal() {
  const title = $("#cal-ev-title").value.trim();
  if (!title) { $("#cal-ev-title").focus(); return; }
  events.push({ id: uid(), date: calModalDate, title, color: calSelColor });
  save.events();
  closeEventModal();
  renderCalendar();
}

// ----- Legend: name each colour (who's who) -----
function renderCalLegend() {
  const wrap = $("#cal-legend");
  if (!wrap) return;
  wrap.innerHTML = "";
  wrap.append(el("span", { class: "cal-legend-label", text: "Who:" }));
  CAL_COLORS.forEach((c) => {
    wrap.append(
      el("label", { class: "cal-legend-item" }, [
        el("span", { class: "cal-legend-dot", style: `background:${c}` }),
        el("input", {
          class: "cal-legend-input", value: calLegend[c] || "", placeholder: "name", maxlength: "16",
          onchange: (e) => {
            const v = e.target.value.trim();
            if (v) calLegend[c] = v; else delete calLegend[c];
            save.callegend();
            renderCalendar();
          },
        }),
      ])
    );
  });
}

$("#cal-ev-add").addEventListener("click", addEventFromModal);
$("#cal-ev-cancel").addEventListener("click", closeEventModal);
$("#cal-ev-title").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); addEventFromModal(); }
});
$("#cal-modal").addEventListener("click", (e) => {
  if (e.target.id === "cal-modal") closeEventModal();
});

$("#cal-prev").addEventListener("click", () => {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});
$("#cal-next").addEventListener("click", () => {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});
$("#cal-today").addEventListener("click", () => {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
});

// ============================================================
//  Reminders + notifications
// ============================================================
function fmtWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function renderReminders() {
  const list = $("#reminder-list");
  list.innerHTML = "";

  const sorted = [...reminders].sort((a, b) => (a.when < b.when ? -1 : 1));
  if (!sorted.length) {
    list.append(el("div", { class: "empty", text: "No reminders set. ⏰" }));
  }

  const now = Date.now();
  sorted.forEach((r) => {
    const due = new Date(r.when).getTime() <= now;
    const meta = el("div", { class: "card-meta" }, [
      el("span", {
        class: `tag due ${due && !r.notified ? "overdue" : ""}`,
        text: (due ? "Due · " : "At ") + fmtWhen(r.when),
      }),
    ]);
    if (r.notified) meta.append(el("span", { class: "tag", text: "Notified" }));

    list.append(
      el("div", { class: `card ${r.notified ? "done" : ""}` }, [
        el("div", { class: "card-body" }, [
          el("div", { class: "card-title", text: r.text }),
          meta,
        ]),
        el("button", {
          class: "icon-btn",
          title: "Delete",
          text: "🗑",
          onclick: () => {
            reminders = reminders.filter((x) => x.id !== r.id);
            save.reminders();
            renderReminders();
            updateBadges();
          },
        }),
      ])
    );
  });
}

$("#reminder-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("#reminder-text").value.trim();
  const when = $("#reminder-when").value;
  if (!text || !when) return;
  reminders.push({ id: uid(), text, when, notified: false });
  save.reminders();
  e.target.reset();
  renderReminders();
  updateBadges();
  refreshNotifNotice();
});

// --- Desktop notifications ---
function refreshNotifNotice() {
  const notice = $("#notif-notice");
  const supported = "Notification" in window;
  const needsPermission = supported && Notification.permission === "default";
  notice.hidden = !needsPermission;
}
$("#enable-notif").addEventListener("click", async () => {
  if ("Notification" in window) {
    await Notification.requestPermission();
    refreshNotifNotice();
  }
});

function checkReminders() {
  const now = Date.now();
  let changed = false;
  reminders.forEach((r) => {
    if (!r.notified && new Date(r.when).getTime() <= now) {
      r.notified = true;
      changed = true;
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("⏰ Reminder", { body: r.text });
      }
    }
  });
  if (changed) {
    save.reminders();
    renderReminders();
    updateBadges();
  }
}

// ============================================================
//  Raid Organizer (Lost Ark weekly raid tracker)
// ============================================================
const RAID_DEFAULTS = ["Raid 1", "Raid 2", "Raid 3"];
const mkRaids = () => RAID_DEFAULTS.map((n) => ({ id: uid(), name: n, done: false, gold: 0 }));

// Distinct tint per character group (green, blue, orange, purple, red, yellow — cycles)
const GROUP_COLORS = [
  "rgba(76,175,80,0.32)",
  "rgba(66,133,244,0.30)",
  "rgba(245,150,40,0.34)",
  "rgba(150,110,220,0.32)",
  "rgba(235,90,90,0.30)",
  "rgba(245,200,70,0.38)",
];

// Gold earned = sum of gold from cleared (checked) raids.
function personGold(person) {
  return person.characters.reduce(
    (sum, c) => sum + c.raids.reduce((s, r) => s + (r.done ? Number(r.gold) || 0 : 0), 0),
    0
  );
}
const fmtGold = (n) => (Number(n) || 0).toLocaleString("en-US");
const mkChar = (i) => ({ id: uid(), name: `Character ${i}`, cls: "", ilvl: "", img: "", raids: mkRaids() });

// Pick + downscale a photo, store it as a compact data URL, then save+rerender.
function pickImageFor(target, maxSize) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    resizeImage(file, maxSize, (dataUrl) => {
      target.img = dataUrl;
      save.raids();
      renderRaids();
    });
  });
  input.click();
}
const pickCharImage = (ch) => pickImageFor(ch, 320);
const pickPersonImage = (person) => pickImageFor(person, 400);

function resizeImage(file, maxSize, cb) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => alert("Sorry, that image couldn't be loaded.");
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
const mkPerson = (name, charCount) => ({
  id: uid(),
  name,
  characters: Array.from({ length: charCount }, (_, i) => mkChar(i + 1)),
});

function seedRaids() {
  return [mkPerson("Player 1", 6), mkPerson("Player 2", 6)];
}

function allCharacters() {
  return raids.flatMap((p) => p.characters);
}

function raidStats(chars) {
  let done = 0, total = 0;
  chars.forEach((c) => c.raids.forEach((r) => { total++; if (r.done) done++; }));
  return { done, total };
}

// ---- Drag & drop: reorder character tiles (within or across players) ----
let raidDrag = null; // { charId } of the tile currently being dragged

function findCharLoc(charId) {
  for (const p of raids) {
    const idx = p.characters.findIndex((c) => c.id === charId);
    if (idx !== -1) return { person: p, idx };
  }
  return null;
}

function clearDropMarks() {
  document
    .querySelectorAll(".drop-before, .drop-after")
    .forEach((t) => t.classList.remove("drop-before", "drop-after"));
}

function groupRect(trs) {
  const first = trs[0].getBoundingClientRect();
  const last = trs[trs.length - 1].getBoundingClientRect();
  return { mid: (first.top + last.bottom) / 2 };
}

// Move the dragged character next to the target character (before/after it).
function moveCharacter(dragCharId, targetPersonId, targetCharId, after) {
  if (dragCharId === targetCharId) return;
  const from = findCharLoc(dragCharId);
  const targetPerson = raids.find((p) => p.id === targetPersonId);
  if (!from || !targetPerson) return;
  const [moved] = from.person.characters.splice(from.idx, 1);
  let tIdx = targetPerson.characters.findIndex((c) => c.id === targetCharId);
  if (tIdx === -1) tIdx = targetPerson.characters.length;
  else if (after) tIdx += 1;
  targetPerson.characters.splice(tIdx, 0, moved);
  save.raids();
  renderRaids();
  updateBadges();
}

function progressBar(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return el("div", { class: "pbar", title: `${pct}%` }, [
    el("div", { class: "pbar-fill", style: `width:${pct}%` }),
  ]);
}

function renderRaids() {
  // Overall progress
  const overall = $("#raid-progress-overall");
  overall.innerHTML = "";
  const all = raidStats(allCharacters());
  const totalGold = raids.reduce((a, p) => a + personGold(p), 0);
  overall.append(
    el("span", { class: "raid-count", text: `${all.done} / ${all.total} raids cleared` }),
    progressBar(all.done, all.total),
    el("span", { class: "gold-badge", text: `🪙 ${fmtGold(totalGold)}` })
  );

  const wrap = $("#raid-people");
  wrap.innerHTML = "";

  if (!raids.length) {
    wrap.append(el("div", { class: "empty", text: "No players yet. Add one to get started. ⚔️" }));
  }

  raids.forEach((person) => {
    const ps = raidStats(person.characters);
    const initial = (person.name || "P").trim().charAt(0).toUpperCase() || "P";

    const personAvatar = el("div", {
      class: "person-avatar", title: "Click to add or change profile photo",
      onclick: () => pickPersonImage(person),
    }, [
      person.img
        ? el("img", { src: person.img, alt: person.name })
        : el("span", { class: "ph", text: initial }),
    ]);
    if (person.img) {
      personAvatar.append(el("button", {
        class: "char-mini-remove", title: "Remove photo", text: "✕",
        onclick: (e) => { e.stopPropagation(); person.img = ""; save.raids(); renderRaids(); },
      }));
    }

    const head = el("div", { class: "person-head" }, [
      personAvatar,
      el("input", {
        class: "person-name", value: person.name, placeholder: "Player name",
        onchange: (e) => { person.name = e.target.value; save.raids(); renderRaids(); },
      }),
      el("button", {
        class: "btn-ghost tiny", text: "+ Character",
        onclick: () => {
          person.characters.push(mkChar(person.characters.length + 1));
          save.raids(); renderRaids(); updateBadges();
        },
      }),
      el("button", {
        class: "icon-btn", title: "Remove player", text: "🗑",
        onclick: () => {
          if (confirm(`Remove ${person.name || "this player"} and all their characters?`)) {
            raids = raids.filter((p) => p.id !== person.id);
            save.raids(); renderRaids(); updateBadges();
          }
        },
      }),
    ]);

    const prog = el("div", { class: "person-progress" }, [
      el("span", { class: "raid-count small", text: `${ps.done}/${ps.total} raids` }),
      progressBar(ps.done, ps.total),
      el("span", { class: "gold-badge", text: `🪙 ${fmtGold(personGold(person))}` }),
    ]);

    // Build the character/raid table
    const table = el("table", { class: "raid-table" });
    table.append(
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "Character" }),
          el("th", { text: "Raid" }),
          el("th", { class: "center", text: "✓" }),
          el("th", { class: "right", text: "Gold" }),
          el("th", {}),
        ]),
      ])
    );
    const tbody = el("tbody");

    person.characters.forEach((ch, ci) => {
      const cs = raidStats([ch]);
      const complete = cs.total > 0 && cs.done === cs.total;
      const color = GROUP_COLORS[ci % GROUP_COLORS.length];
      const groupTrs = []; // all <tr>s of this tile, filled in below

      // Drag handle — grabbing it drags the whole tile (char + raids + gold)
      const grip = el("div", {
        class: "char-grip", title: "Drag to reorder", text: "⠿", draggable: "true",
        ondragstart: (e) => {
          raidDrag = { charId: ch.id };
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", ch.id);
          const cell = e.currentTarget.closest("td");
          if (cell) e.dataTransfer.setDragImage(cell, 24, 24);
          groupTrs.forEach((t) => t.classList.add("row-dragging"));
        },
        ondragend: () => {
          raidDrag = null;
          clearDropMarks();
          groupTrs.forEach((t) => t.classList.remove("row-dragging"));
        },
      });

      // The character info cell (spans all of this character's raid rows)
      const avatar = el("div", {
        class: "char-mini-avatar", title: "Click to add or change photo",
        onclick: () => pickCharImage(ch),
      }, [
        ch.img
          ? el("img", { src: ch.img, alt: ch.name })
          : el("span", { class: "ph", text: (ch.name || "?").trim().charAt(0).toUpperCase() || "?" }),
      ]);
      if (ch.img) {
        avatar.append(el("button", {
          class: "char-mini-remove", title: "Remove photo", text: "✕",
          onclick: (e) => { e.stopPropagation(); ch.img = ""; save.raids(); renderRaids(); },
        }));
      }

      const charCell = el("td", {
        class: `cell-char ${complete ? "complete" : ""}`,
        rowspan: String(Math.max(1, ch.raids.length)),
      }, [
        el("div", { class: "char-mini" }, [
          grip,
          avatar,
          el("div", { class: "char-mini-info" }, [
            el("div", { class: "char-mini-top" }, [
              el("input", {
                class: "char-mini-name", value: ch.name, placeholder: "Character",
                onchange: (e) => { ch.name = e.target.value; save.raids(); renderRaids(); },
              }),
              el("span", { class: `char-count ${complete ? "complete" : ""}`, text: `${cs.done}/${cs.total}` }),
            ]),
            el("div", { class: "char-mini-sub" }, [
              el("input", {
                class: "char-mini-cls", value: ch.cls, placeholder: "Class",
                onchange: (e) => { ch.cls = e.target.value; save.raids(); },
              }),
              el("input", {
                class: "char-mini-ilvl", value: ch.ilvl, placeholder: "ilvl",
                onchange: (e) => { ch.ilvl = e.target.value; save.raids(); },
              }),
            ]),
            el("div", { class: "char-mini-actions" }, [
              el("button", {
                class: "btn-ghost tiny", text: "+ Raid",
                onclick: () => {
                  ch.raids.push({ id: uid(), name: `Raid ${ch.raids.length + 1}`, done: false, gold: 0 });
                  save.raids(); renderRaids(); updateBadges();
                },
              }),
              el("button", {
                class: "icon-btn tiny", title: "Remove character", text: "🗑",
                onclick: () => {
                  person.characters = person.characters.filter((x) => x.id !== ch.id);
                  save.raids(); renderRaids(); updateBadges();
                },
              }),
            ]),
          ]),
        ]),
      ]);

      const raidList = ch.raids.length ? ch.raids : [null]; // ensure a row even with no raids
      raidList.forEach((r, ri) => {
        const last = ri === raidList.length - 1;
        const tr = el("tr", { class: `raid-tr ${r && r.done ? "done" : ""} ${last ? "grp-end" : ""}` });
        groupTrs.push(tr);

        // Whole tile is a drop zone: dropping before/after this character reorders it.
        tr.addEventListener("dragover", (e) => {
          if (!raidDrag || raidDrag.charId === ch.id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const after = e.clientY > groupRect(groupTrs).mid;
          clearDropMarks();
          (after ? groupTrs[groupTrs.length - 1] : groupTrs[0])
            .classList.add(after ? "drop-after" : "drop-before");
        });
        tr.addEventListener("drop", (e) => {
          if (!raidDrag || raidDrag.charId === ch.id) { clearDropMarks(); return; }
          e.preventDefault();
          const after = e.clientY > groupRect(groupTrs).mid;
          const dragged = raidDrag.charId;
          clearDropMarks();
          moveCharacter(dragged, person.id, ch.id, after);
        });

        if (ri === 0) tr.append(charCell);

        if (!r) {
          tr.append(el("td", { class: "cell-raid muted", colspan: "4", text: "No raids — use “+ Raid”." }));
          tbody.append(tr);
          return;
        }

        tr.append(
          el("td", { class: "cell-raid", style: `background:${color}` }, [
            el("input", {
              class: "raid-name", value: r.name, placeholder: "Raid name",
              onchange: (e) => { r.name = e.target.value; save.raids(); },
            }),
          ]),
          el("td", { class: "cell-check" }, [
            el("button", {
              class: `check ${r.done ? "on" : ""}`, title: "Toggle cleared",
              onclick: () => { r.done = !r.done; save.raids(); renderRaids(); updateBadges(); },
            }),
          ]),
          el("td", { class: "cell-gold" }, [
            el("input", {
              class: "gold-input", type: "number", min: "0", step: "100",
              value: r.gold ? String(r.gold) : "", placeholder: "–",
              onchange: (e) => { r.gold = parseInt(e.target.value, 10) || 0; save.raids(); renderRaids(); },
            }),
          ]),
          el("td", { class: "cell-act" }, [
            el("button", {
              class: "icon-btn tiny", title: "Remove raid", text: "✕",
              onclick: () => {
                ch.raids = ch.raids.filter((x) => x.id !== r.id);
                save.raids(); renderRaids(); updateBadges();
              },
            }),
          ])
        );
        tbody.append(tr);
      });
    });

    table.append(tbody);
    wrap.append(el("div", { class: "person-card" }, [head, prog, table]));
  });
}

$("#raid-add-person").addEventListener("click", () => {
  raids.push(mkPerson(`Player ${raids.length + 1}`, 1));
  save.raids();
  renderRaids();
  updateBadges();
});

$("#raid-reset-week").addEventListener("click", () => {
  if (!confirm("Start a new week? This unchecks every raid for all characters.")) return;
  raids.forEach((p) => p.characters.forEach((c) => c.raids.forEach((r) => (r.done = false))));
  save.raids();
  renderRaids();
  updateBadges();
});

// ============================================================
//  TCG Collector (Espeon & Umbreon Pokémon cards)
// ============================================================
const TCG_ALL = window.TCG_CARDS || [];
let tcgOwned = store.get("org.tcg", {}); // { cardId: true }
let tcgMon = "all", tcgQuery = "", tcgMissingOnly = false;
save.tcg = () => store.set("org.tcg", tcgOwned);

function matchesMon(c) {
  if (tcgMon === "Umbreon") return c.mon !== "Espeon";
  if (tcgMon === "Espeon") return c.mon !== "Umbreon";
  return true;
}

function tcgFiltered() {
  const q = tcgQuery.toLowerCase();
  return TCG_ALL.filter((c) => {
    if (!matchesMon(c)) return false;
    if (tcgMissingOnly && tcgOwned[c.id]) return false;
    if (q && !`${c.name} ${c.set} ${c.number} ${c.rarity} ${c.series}`.toLowerCase().includes(q))
      return false;
    return true;
  });
}

function updateTcgProgress() {
  const scope = TCG_ALL.filter(matchesMon);
  const owned = scope.filter((c) => tcgOwned[c.id]).length;
  const bar = $("#tcg-progress");
  bar.innerHTML = "";
  bar.append(
    el("span", { class: "raid-count", text: `${owned} / ${scope.length} collected` }),
    progressBar(owned, scope.length)
  );
}

function buildTcgCard(c) {
  const owned = !!tcgOwned[c.id];
  const node = el("div", { class: `tcg-card ${owned ? "owned" : ""}`, title: c.name }, [
    el("div", { class: "tcg-img" }, [
      c.img
        ? el("img", { src: c.img, alt: c.name, loading: "lazy" })
        : el("div", { class: "tcg-noimg", text: "No image" }),
    ]),
    el("div", { class: "tcg-check", text: owned ? "✓" : "" }),
    el("div", { class: "tcg-info" }, [
      el("div", { class: "tcg-name", text: c.name }),
      el("div", { class: "tcg-sub", text: `${c.set} · #${c.number}` }),
      el("div", { class: "tcg-rarity", text: c.rarity || "—" }),
    ]),
  ]);
  node.addEventListener("click", () => {
    const now = !tcgOwned[c.id];
    if (now) tcgOwned[c.id] = true;
    else delete tcgOwned[c.id];
    save.tcg();
    if (tcgMissingOnly) {
      renderTCG();
    } else {
      node.classList.toggle("owned", now);
      node.querySelector(".tcg-check").textContent = now ? "✓" : "";
      updateTcgProgress();
      updateBadges();
    }
  });
  return node;
}

function renderTCG() {
  $$(".tcg-tab").forEach((b) => b.classList.toggle("active", b.dataset.mon === tcgMon));
  updateTcgProgress();
  const grid = $("#tcg-grid");
  grid.innerHTML = "";
  const list = tcgFiltered();
  if (!list.length) {
    grid.append(el("div", { class: "empty", text: "No cards match your filters." }));
    return;
  }
  list.forEach((c) => grid.append(buildTcgCard(c)));
}

$$(".tcg-tab").forEach((b) =>
  b.addEventListener("click", () => {
    tcgMon = b.dataset.mon;
    renderTCG();
  })
);
$("#tcg-search").addEventListener("input", (e) => {
  tcgQuery = e.target.value.trim();
  renderTCG();
});
$("#tcg-missing-only").addEventListener("change", (e) => {
  tcgMissingOnly = e.target.checked;
  renderTCG();
});

// ============================================================
//  AI Assistant (LiteLLM proxy — aikeys.maibornwolff.de, OpenAI-compatible)
// ============================================================
const AI_MODELS = [
  "claude-sonnet-4.5", "claude-opus-4.5", "claude-haiku-4.5", "claude-sonnet-4",
  "gpt-5.1", "gpt-4.1", "gpt-4o", "gemini-2.5-flash",
];
const AI_DEFAULTS = { key: "", model: "claude-sonnet-4.5", base: "https://aikeys.maibornwolff.de" };

let aiCfg = { ...AI_DEFAULTS, ...store.get("org.ai", {}) };
let aiChat = store.get("org.aichat", []); // [{role:'user'|'assistant'|'error', content}]
let aiBusy = false;

save.ai = () => store.set("org.ai", aiCfg);
save.aichat = () => store.set("org.aichat", aiChat.filter((m) => m.role !== "error"));

function setAiStatus(text, kind = "") {
  const s = $("#ai-status");
  s.textContent = text;
  s.className = "ai-status " + kind;
}

// Build a compact snapshot of the user's data so the assistant has context.
function appContextSummary() {
  const lines = [];
  const openT = todos.filter((t) => !t.done);
  lines.push(
    `To-dos: ${openT.length} open` +
      (openT.length ? ` — ${openT.slice(0, 6).map((t) => t.text).join("; ")}` : "")
  );
  const openS = shopping.filter((s) => !s.done);
  lines.push(
    `Shopping: ${openS.length} to buy` +
      (openS.length ? ` — ${openS.slice(0, 10).map((s) => s.name + (s.qty > 1 ? ` x${s.qty}` : "")).join(", ")}` : "")
  );
  raids.forEach((p) => {
    const st = raidStats(p.characters);
    lines.push(`Lost Ark raids — ${p.name}: ${st.done}/${st.total} cleared (${p.characters.length} characters)`);
  });
  const owned = TCG_ALL.filter((c) => tcgOwned[c.id]).length;
  lines.push(`Pokémon TCG: ${owned}/${TCG_ALL.length} Espeon & Umbreon cards collected`);
  return lines.join("\n");
}

function aiSystemPrompt() {
  return (
    `You are the built-in assistant inside "Khangella's Organizer", a personal web app with these sections: ` +
    `To-dos, Shopping list, Calendar, Reminders, a Lost Ark Raid Organizer, and a Pokémon TCG Collector for Espeon & Umbreon cards. ` +
    `Be concise, friendly, and practical. Here is a snapshot of the user's current data:\n\n${appContextSummary()}\n\n` +
    `Use this data when it's relevant. You can't directly edit the app yet, so when the user wants to add or change items, briefly tell them which section to use.`
  );
}

async function aiComplete(messages, opts = {}) {
  const url = aiCfg.base.replace(/\/+$/, "") + "/v1/chat/completions";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? 45000);
  let res;
  try {
    console.log("[AI] POST", url, "model:", aiCfg.model);
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + aiCfg.key,
      },
      body: JSON.stringify({
        model: aiCfg.model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.max_tokens ?? 1024,
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    console.error("[AI] fetch failed:", e);
    if (e.name === "AbortError")
      throw new Error("The request timed out after 45s. The endpoint may be unreachable from the browser.");
    // Network/CORS failures surface here as a TypeError ("Failed to fetch").
    throw new Error(
      "Could not reach the AI endpoint (\"" + e.message + "\"). This is usually a CORS block (the proxy may not allow browser requests from this site) or a wrong endpoint URL. Open DevTools → Console/Network for details."
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403)
      throw new Error(`Authentication failed (${res.status}). Check that your API key is correct and active.`);
    throw new Error(`Request failed (${res.status}). ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "(the model returned an empty response)";
}

function renderAiChat() {
  const box = $("#ai-chat");
  box.innerHTML = "";
  if (!aiChat.length && !aiBusy) {
    box.append(
      el("div", { class: "empty", text: "👋 Ask me about your day, your raids, or your card collection." })
    );
  }
  aiChat.forEach((m) => {
    box.append(
      el("div", { class: `ai-msg ${m.role}` }, [el("div", { class: "ai-bubble", text: m.content })])
    );
  });
  if (aiBusy) {
    box.append(
      el("div", { class: "ai-msg assistant" }, [
        el("div", { class: "ai-bubble typing" }, [
          el("span", { class: "dot" }), el("span", { class: "dot" }), el("span", { class: "dot" }),
        ]),
      ])
    );
  }
  box.scrollTop = box.scrollHeight;
}

async function sendAi(text) {
  text = text.trim();
  if (!text || aiBusy) return;
  if (!aiCfg.key) {
    $("#ai-config").open = true;
    setAiStatus("Add your API key to start.", "warn");
    return;
  }
  aiChat.push({ role: "user", content: text });
  save.aichat();
  aiBusy = true;
  $("#ai-send").disabled = true;
  renderAiChat();

  try {
    const messages = [
      { role: "system", content: aiSystemPrompt() },
      ...aiChat.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: m.content })),
    ];
    const reply = await aiComplete(messages);
    aiChat.push({ role: "assistant", content: reply });
    save.aichat();
  } catch (err) {
    console.error("[AI] error:", err);
    aiChat.push({ role: "error", content: "⚠️ " + err.message });
  } finally {
    aiBusy = false;
    $("#ai-send").disabled = false;
    renderAiChat();
  }
}

const AI_SUGGESTIONS = [
  "What should I focus on today?",
  "Which Lost Ark raids are left this week?",
  "How many Espeon & Umbreon cards do I still need?",
  "Turn my shopping list into a meal idea",
];

function renderAiSuggestions() {
  const wrap = $("#ai-suggestions");
  wrap.innerHTML = "";
  AI_SUGGESTIONS.forEach((s) => {
    wrap.append(
      el("button", { class: "ai-chip", type: "button", text: s, onclick: () => sendAi(s) })
    );
  });
}

function initAiConfigUI() {
  const sel = $("#ai-model");
  sel.innerHTML = "";
  // Ensure the saved model is present even if not in the default list.
  const models = AI_MODELS.includes(aiCfg.model) ? AI_MODELS : [aiCfg.model, ...AI_MODELS];
  models.forEach((m) => sel.append(el("option", { value: m, text: m })));
  sel.value = aiCfg.model;
  $("#ai-key").value = aiCfg.key;
  $("#ai-base").value = aiCfg.base;
  setAiStatus(aiCfg.key ? "Ready" : "No API key set", aiCfg.key ? "ok" : "warn");
  if (!aiCfg.key) $("#ai-config").open = true;
}

$("#ai-save").addEventListener("click", () => {
  aiCfg.key = $("#ai-key").value.trim();
  aiCfg.model = $("#ai-model").value;
  aiCfg.base = ($("#ai-base").value.trim() || AI_DEFAULTS.base);
  save.ai();
  setAiStatus(aiCfg.key ? "Saved ✓ — Ready" : "Saved — but no key set", aiCfg.key ? "ok" : "warn");
  if (aiCfg.key) $("#ai-config").open = false;
});

$("#ai-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#ai-input");
  const text = input.value;
  input.value = "";
  sendAi(text);
});

$("#ai-clear").addEventListener("click", () => {
  aiChat = [];
  save.aichat();
  renderAiChat();
});

// ============================================================
//  Cloud Sync (Supabase) — shares all data across devices in realtime
// ============================================================
const SUPABASE_URL = "https://audcuqjwpdqeyxvjyrin.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1ZGN1cWp3cGRxZXl4dmp5cmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjA5MDgsImV4cCI6MjEwMjE5NjkwOH0.ppvvaI5queLd-Z8uKEn-OHZQ4YxiYZvMl9vnOFaObRo";
// Everything syncs, incl. the AI config (org.ai: endpoint + key + model) so the
// AI Assistant works on every signed-in device. Only the AI chat history
// (org.aichat) and per-device nickname stay local.
const SYNC_KEYS = ["org.todos", "org.shopping", "org.events", "org.reminders", "org.raids", "org.tcg", "org.recipes", "org.games", "org.canvas", "org.callegend", "org.theme", "org.ai", "org.idle"];
const syncClientId = Math.random().toString(36).slice(2) + Date.now().toString(36);

let sb = null;
let syncUser = null; // { id, email }
let syncApplying = false; // true while writing remote data locally (prevents echo)
let syncPushTimer = null;
let syncChannel = null;

function setSyncStatus(text, kind = "") {
  const s = $("#sync-status");
  if (s) { s.textContent = text; s.className = "ai-status " + kind; }
}

function renderSyncUI() {
  const out = $("#sync-signedout");
  const inn = $("#sync-signedin");
  if (!out || !inn) return;
  if (syncUser) {
    out.hidden = true; inn.hidden = false;
    $("#sync-email-label").textContent = syncUser.email || "";
  } else {
    out.hidden = false; inn.hidden = true;
  }
}

function collectState() {
  const out = {};
  SYNC_KEYS.forEach((k) => {
    const raw = localStorage.getItem(k);
    if (raw != null) { try { out[k] = JSON.parse(raw); } catch {} }
  });
  return out;
}

// Write a remote snapshot into local state and re-render every view.
function applyRemoteState(data) {
  if (!data) return;
  syncApplying = true;
  try {
    SYNC_KEYS.forEach((k) => {
      if (k in data) localStorage.setItem(k, JSON.stringify(data[k]));
    });
    todos = store.get("org.todos", []);
    shopping = store.get("org.shopping", []);
    events = store.get("org.events", []);
    reminders = store.get("org.reminders", []);
    raids = store.get("org.raids", []);
    tcgOwned = store.get("org.tcg", {});
    recipes = store.get("org.recipes", []);
    games = store.get("org.games", []);
    canvasItems = store.get("org.canvas", []);
    calLegend = store.get("org.callegend", {});
    garden = store.get("org.idle", garden);
    if ("org.ai" in data) { aiCfg = { ...AI_DEFAULTS, ...store.get("org.ai", {}) }; initAiConfigUI(); }
    if (data["org.theme"]) applyTheme(data["org.theme"]);
    renderTodos(); renderShopping(); renderCalLegend(); renderCalendar(); renderReminders();
    renderRaids(); renderTCG(); renderRecipes(); renderGames(); renderCanvas(); renderGarden(); updateBadges();
  } finally {
    syncApplying = false;
  }
}

async function pushStateNow() {
  if (!syncUser || !sb) return;
  const payload = { ...collectState(), _by: syncClientId, _ts: Date.now() };
  const { error } = await sb
    .from("app_state")
    .upsert({ user_id: syncUser.id, data: payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) { console.error("[sync] push", error); setSyncStatus("Save failed: " + error.message, "warn"); }
  else setSyncStatus("Synced ✓", "ok");
}

function scheduleSyncPush() {
  if (!syncUser) return;
  setSyncStatus("Saving…", "");
  clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(pushStateNow, 700);
}

async function pullState() {
  if (!syncUser || !sb) return;
  const { data, error } = await sb.from("app_state").select("data").eq("user_id", syncUser.id).maybeSingle();
  if (error) { console.error("[sync] pull", error); setSyncStatus("Read failed: " + error.message, "warn"); return; }
  if (data && data.data && Object.keys(data.data).length) {
    applyRemoteState(data.data);
    setSyncStatus("Synced ✓", "ok");
  } else {
    await pushStateNow(); // first device — seed the cloud from local
  }
}

function subscribeRealtime() {
  if (!syncUser || !sb) return;
  if (syncChannel) { sb.removeChannel(syncChannel); syncChannel = null; }
  syncChannel = sb
    .channel("app_state_" + syncUser.id)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_state", filter: "user_id=eq." + syncUser.id },
      (payload) => {
        const d = payload.new && payload.new.data;
        if (!d || d._by === syncClientId) return; // ignore our own writes
        applyRemoteState(d);
        setSyncStatus("Updated from another device ✓", "ok");
      }
    )
    .subscribe();
}

async function onSignedIn(user) {
  syncUser = { id: user.id, email: user.email };
  renderSyncUI();
  setSyncStatus("Connecting…", "");
  await pullState();
  subscribeRealtime();
  // Chat rides on the same signed-in Supabase session
  updateChatAuth();
  await loadChat();
  subscribeChat();
  // Canvas images live in Supabase Storage — (re)load them now we're authed
  updateCanvasAuth();
  renderCanvas();
}

async function syncSignIn(email, password) {
  if (!sb) { setSyncStatus("Sync unavailable — library didn't load.", "warn"); return; }
  setSyncStatus("Signing in…", "");
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { setSyncStatus("Sign-in failed: " + error.message, "warn"); return; }
  await onSignedIn(data.user);
}

async function syncSignOut() {
  if (syncChannel && sb) { sb.removeChannel(syncChannel); syncChannel = null; }
  if (chatChannel && sb) { sb.removeChannel(chatChannel); chatChannel = null; }
  if (sb) await sb.auth.signOut();
  syncUser = null;
  renderSyncUI();
  setSyncStatus("Signed out.", "");
  $("#chatw-msgs").innerHTML = "";
  updateChatAuth();
  updateCanvasAuth();
  renderCanvas();
}

// Hook invoked by store.set on every local change.
window.__ORG_SYNC = {
  onChange(key) {
    if (syncApplying || !syncUser) return;
    if (SYNC_KEYS.indexOf(key) === -1) return;
    scheduleSyncPush();
  },
};

$("#sync-form").addEventListener("submit", (e) => {
  e.preventDefault();
  syncSignIn($("#sync-email").value.trim(), $("#sync-pass").value);
});
$("#sync-signout").addEventListener("click", syncSignOut);

async function initSync() {
  if (!window.supabase) { setSyncStatus("Sync library failed to load (check your connection).", "warn"); return; }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  renderSyncUI();
  const { data } = await sb.auth.getSession();
  if (data && data.session && data.session.user) {
    await onSignedIn(data.session.user);
  } else {
    setSyncStatus("Not signed in — sign in to sync across your devices.", "");
    updateChatAuth();
  }
}

// ============================================================
//  Cross-device Chat (Supabase `messages` table, realtime)
// ============================================================
let chatNick = store.get("org.nick", ""); // per-device, NOT synced
let chatOpen = false;
let chatUnread = 0;
let chatChannel = null;

function chatHue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
function chatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function renderChatMsg(m) {
  const me = m.client_id === syncClientId;
  const nick = m.nick || "Anon";
  $("#chatw-msgs").append(
    el("div", { class: `chatw-msg ${me ? "me" : ""}` }, [
      el("div", { class: "chatw-nickline", style: `color:hsl(${chatHue(nick)},60%,50%)`, text: nick }),
      el("div", { class: "chatw-bubble", text: m.body }),
      el("div", { class: "chatw-time", text: chatTime(m.created_at) }),
    ])
  );
}
function chatScroll() {
  const box = $("#chatw-msgs");
  box.scrollTop = box.scrollHeight;
}
function setChatUnread(n) {
  chatUnread = n;
  const b = $("#chatw-unread");
  b.textContent = n > 9 ? "9+" : String(n);
  b.hidden = n <= 0;
}

function updateChatAuth() {
  const signed = !!syncUser;
  $("#chatw-hint").hidden = signed;
  $("#chatw-input").disabled = !signed;
  $("#chatw-form").querySelector("button").disabled = !signed;
}

function toggleChat(force) {
  chatOpen = typeof force === "boolean" ? force : !chatOpen;
  $("#chatw-panel").hidden = !chatOpen;
  $("#chatw-icon").textContent = chatOpen ? "▾" : "💬";
  if (chatOpen) {
    setChatUnread(0);
    (chatNick ? $("#chatw-input") : $("#chatw-nick")).focus();
    chatScroll();
  }
}

async function loadChat() {
  if (!sb || !syncUser) return;
  const { data, error } = await sb
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  $("#chatw-msgs").innerHTML = "";
  if (error) {
    console.error("[chat] load", error);
    $("#chatw-msgs").append(el("div", { class: "chatw-empty", text: "Couldn't load messages: " + error.message }));
    return;
  }
  const rows = (data || []).slice().reverse();
  if (!rows.length) {
    $("#chatw-msgs").append(el("div", { class: "chatw-empty", text: "No messages yet. Say hi! 👋" }));
  } else {
    rows.forEach(renderChatMsg);
  }
  chatScroll();
}

function subscribeChat() {
  if (!sb || !syncUser) return;
  if (chatChannel) { sb.removeChannel(chatChannel); chatChannel = null; }
  chatChannel = sb
    .channel("chat_messages")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      const m = payload.new;
      if (!m) return;
      const empty = $("#chatw-msgs .chatw-empty");
      if (empty) empty.remove();
      renderChatMsg(m);
      chatScroll();
      if (!chatOpen && m.client_id !== syncClientId) setChatUnread(chatUnread + 1);
    })
    .subscribe();
}

async function sendChat(text) {
  text = text.trim();
  if (!text) return;
  if (!sb || !syncUser) { toggleChat(true); return; }
  const { error } = await sb.from("messages").insert({
    nick: chatNick || "Anon",
    body: text,
    client_id: syncClientId,
  });
  if (error) {
    console.error("[chat] send", error);
    $("#chatw-msgs").append(el("div", { class: "chatw-empty", text: "Send failed: " + error.message }));
    chatScroll();
  }
  // The realtime INSERT echoes the message back to us, so we don't render it here.
}

function initChat() {
  $("#chatw-nick").value = chatNick;
  $("#chatw-toggle").addEventListener("click", () => toggleChat());
  $("#chatw-close").addEventListener("click", () => toggleChat(false));
  $("#chatw-nick").addEventListener("change", (e) => {
    chatNick = e.target.value.trim();
    store.set("org.nick", chatNick); // not in SYNC_KEYS → stays local per device
  });
  $("#chatw-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#chatw-input");
    const text = input.value;
    input.value = "";
    sendChat(text);
  });
  updateChatAuth();
}

// ============================================================
//  Recipes (ingredient + macro tracker)
// ============================================================
const num = (v) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; };
const round1 = (n) => Math.round(n * 10) / 10;

let recipeQuery = "";
let recDraft = null;      // working copy of the recipe being edited
let recEditingId = null;  // id when editing an existing recipe, else null

function mkIngredient() {
  return { id: uid(), name: "", amount: "", protein: "", carbs: "", fat: "" };
}

function macroTotals(ingredients) {
  return ingredients.reduce(
    (t, i) => { t.p += num(i.protein); t.c += num(i.carbs); t.f += num(i.fat); return t; },
    { p: 0, c: 0, f: 0 }
  );
}
const kcalOf = (t) => Math.round(t.p * 4 + t.c * 4 + t.f * 9);

function macroChips(t, opts = {}) {
  return el("div", { class: "macro-chips" + (opts.small ? " small" : "") }, [
    el("span", { class: "macro-chip p", text: `P ${round1(t.p)}g` }),
    el("span", { class: "macro-chip c", text: `C ${round1(t.c)}g` }),
    el("span", { class: "macro-chip f", text: `F ${round1(t.f)}g` }),
    el("span", { class: "kcal-badge", text: `${kcalOf(t)} kcal` }),
  ]);
}

// ---- Editor (in a modal) ----
function newRecipe() {
  recEditingId = null;
  recDraft = { id: uid(), title: "", servings: "", ingredients: [mkIngredient()], createdAt: new Date().toISOString() };
  renderRecEditor();
}

function editRecipe(r) {
  recEditingId = r.id;
  recDraft = {
    id: r.id, title: r.title, servings: r.servings || "", createdAt: r.createdAt,
    ingredients: (r.ingredients || []).map((i) => ({ ...i, id: i.id || uid() })),
  };
  if (!recDraft.ingredients.length) recDraft.ingredients.push(mkIngredient());
  renderRecEditor();
}

function closeRecEditor() {
  recDraft = null; recEditingId = null;
  const m = $("#rec-modal");
  m.hidden = true;
  m.querySelector(".rec-editor").innerHTML = "";
}

function macroInput(ing, key, ph) {
  return el("input", {
    class: "rec-macro-in", type: "number", min: "0", step: "0.1", inputmode: "decimal",
    value: ing[key] === "" ? "" : String(ing[key]), placeholder: ph,
    oninput: (e) => { ing[key] = e.target.value; updateRecTotals(); },
  });
}

function renderRecEditor() {
  const m = $("#rec-modal");
  const box = m.querySelector(".rec-editor");
  box.innerHTML = "";
  const d = recDraft;

  const rows = el("div", { class: "rec-ing-rows" });
  d.ingredients.forEach((ing) => {
    rows.append(el("div", { class: "rec-ing-row" }, [
      el("input", { class: "rec-in-name", value: ing.name, placeholder: "Ingredient",
        oninput: (e) => { ing.name = e.target.value; } }),
      el("input", { class: "rec-in-amt", value: ing.amount, placeholder: "e.g. 200 g",
        oninput: (e) => { ing.amount = e.target.value; } }),
      macroInput(ing, "protein", "P"),
      macroInput(ing, "carbs", "C"),
      macroInput(ing, "fat", "F"),
      el("button", { class: "icon-btn tiny rec-in-del", title: "Remove ingredient", text: "✕",
        onclick: () => {
          d.ingredients = d.ingredients.filter((x) => x.id !== ing.id);
          if (!d.ingredients.length) d.ingredients.push(mkIngredient());
          renderRecEditor();
        } }),
    ]));
  });

  box.append(
    el("div", { class: "rec-editor-head" }, [
      el("h3", { text: recEditingId ? "Edit recipe" : "New recipe" }),
      el("button", { class: "icon-btn", title: "Close", text: "✕", onclick: closeRecEditor }),
    ]),
    el("input", { class: "rec-title-in", value: d.title, placeholder: "Recipe name",
      oninput: (e) => { d.title = e.target.value; } }),
    el("label", { class: "rec-serv" }, [
      el("span", { text: "Servings" }),
      el("input", { type: "number", min: "1", step: "1", value: d.servings, placeholder: "—",
        oninput: (e) => { d.servings = e.target.value; updateRecTotals(); } }),
    ]),
    el("div", { class: "rec-ing-head" }, [
      el("span", { text: "Ingredient" }), el("span", { text: "Amount" }),
      el("span", { class: "center", text: "P (g)" }), el("span", { class: "center", text: "C (g)" }),
      el("span", { class: "center", text: "F (g)" }), el("span", {}),
    ]),
    rows,
    el("button", { class: "btn-ghost tiny rec-add-ing", text: "+ Add ingredient",
      onclick: () => { d.ingredients.push(mkIngredient()); renderRecEditor(); } }),
    el("div", { class: "rec-totals", id: "rec-editor-totals" }),
    el("div", { class: "rec-editor-actions" }, [
      el("button", { class: "btn-primary", text: "💾 Save recipe", onclick: saveRecipe }),
      el("button", { class: "btn-ghost", text: "Cancel", onclick: closeRecEditor }),
      recEditingId ? el("button", { class: "btn-ghost rec-del-btn", text: "🗑 Delete", onclick: () => deleteRecipe(d.id) }) : null,
    ])
  );
  m.hidden = false;
  updateRecTotals();
}

function updateRecTotals() {
  const box = $("#rec-editor-totals");
  if (!box || !recDraft) return;
  box.innerHTML = "";
  const t = macroTotals(recDraft.ingredients);
  box.append(el("div", { class: "rec-totals-line" }, [
    el("span", { class: "rec-totals-label", text: "Total" }), macroChips(t),
  ]));
  const serv = parseInt(recDraft.servings, 10);
  if (serv > 1) {
    box.append(el("div", { class: "rec-totals-line" }, [
      el("span", { class: "rec-totals-label", text: `Per serving (${serv})` }),
      macroChips({ p: t.p / serv, c: t.c / serv, f: t.f / serv }),
    ]));
  }
}

function saveRecipe() {
  const d = recDraft;
  d.title = (d.title || "").trim() || "Untitled recipe";
  d.ingredients = d.ingredients.filter((i) => (i.name || "").trim() || num(i.protein) || num(i.carbs) || num(i.fat));
  const idx = recipes.findIndex((r) => r.id === d.id);
  if (idx >= 0) recipes[idx] = d; else recipes.unshift(d);
  save.recipes();
  closeRecEditor();
  renderRecipes();
  updateBadges();
}

function deleteRecipe(id) {
  const r = recipes.find((x) => x.id === id);
  if (!confirm(`Delete “${(r && r.title) || "this recipe"}”?`)) return;
  recipes = recipes.filter((x) => x.id !== id);
  save.recipes();
  closeRecEditor();
  renderRecipes();
  updateBadges();
}

// ---- List ----
function renderRecipes() {
  const list = $("#rec-list");
  if (!list) return;
  list.innerHTML = "";
  if (!recipes.length) {
    list.append(el("div", { class: "empty", text: "No recipes yet. Add one to start tracking macros! 🥗" }));
    return;
  }
  const q = recipeQuery.toLowerCase();
  const items = recipes.filter(
    (r) => !q || (r.title + " " + (r.ingredients || []).map((i) => i.name).join(" ")).toLowerCase().includes(q)
  );
  if (!items.length) {
    list.append(el("div", { class: "empty", text: "No recipes match your search." }));
    return;
  }
  items.forEach((r) => {
    const ings = r.ingredients || [];
    const t = macroTotals(ings);
    const serv = parseInt(r.servings, 10);

    const viewRows = ings.map((i) => {
      const it = macroTotals([i]);
      return el("div", { class: "rec-view-row" }, [
        el("span", { class: "rec-view-name", text: i.name || "—" }),
        el("span", { class: "rec-view-amt", text: i.amount || "" }),
        el("span", { class: "center", text: String(round1(it.p)) }),
        el("span", { class: "center", text: String(round1(it.c)) }),
        el("span", { class: "center", text: String(round1(it.f)) }),
      ]);
    });

    const body = el("div", { class: "rec-card-body", hidden: "hidden" }, [
      ings.length
        ? el("div", { class: "rec-view-table" }, [
            el("div", { class: "rec-view-row head" }, [
              el("span", { text: "Ingredient" }), el("span", { text: "Amount" }),
              el("span", { class: "center", text: "P" }), el("span", { class: "center", text: "C" }), el("span", { class: "center", text: "F" }),
            ]),
            ...viewRows,
          ])
        : el("p", { class: "rec-empty-note", text: "No ingredients yet." }),
      el("div", { class: "rec-totals" }, [
        el("div", { class: "rec-totals-line" }, [el("span", { class: "rec-totals-label", text: "Total" }), macroChips(t)]),
        serv > 1
          ? el("div", { class: "rec-totals-line" }, [
              el("span", { class: "rec-totals-label", text: `Per serving (${serv})` }),
              macroChips({ p: t.p / serv, c: t.c / serv, f: t.f / serv }),
            ])
          : null,
      ]),
    ]);

    const head = el("div", {
      class: "rec-card-head",
      onclick: (e) => { if (e.target.closest("button")) return; body.hidden = !body.hidden; },
    }, [
      el("div", { class: "rec-card-info" }, [
        el("div", { class: "rec-card-title", text: r.title }),
        el("div", { class: "rec-card-meta", text: [
          `${ings.length} ingredient${ings.length === 1 ? "" : "s"}`,
          serv > 0 ? `${serv} serving${serv === 1 ? "" : "s"}` : "",
        ].filter(Boolean).join(" · ") }),
      ]),
      macroChips(t, { small: true }),
      el("div", { class: "rec-card-actions" }, [
        el("button", { class: "icon-btn", title: "Edit", text: "✏️", onclick: () => editRecipe(r) }),
        el("button", { class: "icon-btn", title: "Delete", text: "🗑", onclick: () => deleteRecipe(r.id) }),
      ]),
    ]);

    list.append(el("div", { class: "rec-card" }, [head, body]));
  });
}

function initRecipes() {
  const nb = $("#rec-new");
  if (nb) nb.addEventListener("click", newRecipe);
  const s = $("#rec-search");
  if (s) s.addEventListener("input", (e) => { recipeQuery = e.target.value.trim(); renderRecipes(); });
  const modal = $("#rec-modal");
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeRecEditor(); });
}

// ============================================================
//  Games to Play (shared backlog)
// ============================================================
const GAME_STATUS = {
  want: { label: "Want to play", next: "playing", cls: "want" },
  playing: { label: "Playing", next: "played", cls: "playing" },
  played: { label: "Played", next: "want", cls: "played" },
};
const GAME_ORDER = { want: 0, playing: 1, played: 2 };
let gameFilter = "all";

// Extract a Steam App ID from a store link or a raw numeric id.
function parseSteamId(input) {
  const s = (input || "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/\/app\/(\d+)/i) || s.match(/[?&]appids?=(\d+)/i);
  return m ? m[1] : "";
}

// Steam CDN header art (460×215) — hotlinks fine cross-origin.
const steamHeader = (id) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`;

// Cover image for a game: custom upload wins, else Steam art, else none.
function gameCover(g) {
  if (g.cover) return g.cover;
  if (g.steamId) return steamHeader(g.steamId);
  return "";
}

// Click a cover to set/replace its art: paste a Steam link/App ID, or upload.
function setGameArt(g) {
  const v = prompt(
    "Paste a Steam store link or App ID for the cover.\n\n(Leave blank and press OK to upload your own image instead.)",
    g.steamId || ""
  );
  if (v === null) return; // cancelled
  const id = parseSteamId(v);
  if (id) {
    g.steamId = id;
    g.cover = "";
    if (!g.platform) g.platform = "Steam";
    save.games();
    renderGames();
  } else if (v.trim() === "") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) return;
      resizeImage(file, 640, (dataUrl) => {
        g.cover = dataUrl;
        g.steamId = "";
        save.games();
        renderGames();
      });
    });
    input.click();
  } else {
    alert("Couldn't find a Steam App ID in that. Use a store link like\nhttps://store.steampowered.com/app/1245620/…  or just the number.");
  }
}

function renderGames() {
  const list = $("#game-list");
  if (!list) return;
  $$("#game-tabs .game-tab").forEach((b) => b.classList.toggle("active", b.dataset.status === gameFilter));
  list.innerHTML = "";

  if (!games.length) {
    list.append(el("div", { class: "empty", text: "No games yet. Add one you want to try! 🎮" }));
    return;
  }

  let items = [...games].sort((a, b) => GAME_ORDER[a.status] - GAME_ORDER[b.status]);
  if (gameFilter !== "all") items = items.filter((g) => g.status === gameFilter);
  if (!items.length) {
    list.append(el("div", { class: "empty", text: "No games in this category." }));
    return;
  }

  items.forEach((g) => {
    const st = GAME_STATUS[g.status] || GAME_STATUS.want;
    const src = gameCover(g);

    // Cover: image (with graceful fallback to placeholder) or a placeholder tile.
    const coverInner = src
      ? el("img", {
          src, alt: g.name, loading: "lazy",
          onerror: (e) => {
            const ph = el("div", { class: "game-cover-ph", text: "🎮" });
            e.target.replaceWith(ph);
          },
        })
      : el("div", { class: "game-cover-ph", text: "🎮" });

    const cover = el("div", {
      class: "game-cover", title: "Click to set cover art",
      onclick: () => setGameArt(g),
    }, [coverInner, el("span", { class: "game-cover-edit", text: "🖼" })]);

    const tags = [];
    if (g.platform) tags.push(el("span", { class: "tag", text: g.platform }));

    list.append(
      el("div", { class: `game-card ${g.status === "played" ? "played" : ""}` }, [
        cover,
        el("div", { class: "game-card-info" }, [
          el("div", { class: "card-title", text: g.name }),
          tags.length ? el("div", { class: "card-meta" }, tags) : null,
        ]),
        el("div", { class: "game-card-foot" }, [
          el("button", {
            class: `game-status ${st.cls}`, title: "Click to change status", text: st.label,
            onclick: () => { g.status = st.next; save.games(); renderGames(); updateBadges(); },
          }),
          el("button", {
            class: "icon-btn", title: "Delete", text: "🗑",
            onclick: () => { games = games.filter((x) => x.id !== g.id); save.games(); renderGames(); updateBadges(); },
          }),
        ]),
      ])
    );
  });
}

$("#game-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#game-name").value.trim();
  if (!name) return;
  const steamId = parseSteamId($("#game-steam").value);
  let platform = $("#game-platform").value.trim();
  if (steamId && !platform) platform = "Steam";
  games.push({
    id: uid(),
    name,
    steamId,
    cover: "",
    platform,
    status: "want",
    createdAt: new Date().toISOString(),
  });
  save.games();
  e.target.reset();
  renderGames();
  updateBadges();
});

$$("#game-tabs .game-tab").forEach((b) =>
  b.addEventListener("click", () => { gameFilter = b.dataset.status; renderGames(); })
);

// ============================================================
//  Canvas (shared freeform moodboard — images in Supabase Storage)
// ============================================================
const NOTE_COLORS = ["#fff59d", "#f6a5c0", "#a5d6a7", "#90caf9", "#ffcc80", "#ce93d8", "#ef9a9a", "#b0bec5"];
const ZOOM_MIN = 0.1, ZOOM_MAX = 4, GRID = 22, SNAP = 6;
let canvasZ = 1;
const canvasUrlCache = {}; // path -> { url, exp }

// Per-device viewport (pan/zoom) — NOT synced (like the chat nickname).
let canvasView = { panX: 0, panY: 0, zoom: 1, ...store.get("org.canvasview", {}) };
let canvasSel = new Set();       // selected item ids (multi-select)
let canvasClip = [];             // in-app clipboard (copied item snapshots)
let canvasSpace = false;         // is the space bar held (pan gesture)?
let canvasViewTimer = null;
const canvasNodes = new Map();   // id -> DOM node (rebuilt each render)
const canvasEdgeEls = new Map(); // connector id -> <path> (rebuilt each render)

// Undo/redo — per-device, in-memory snapshots of canvasItems.
const HIST_MAX = 80;
let canvasPast = [], canvasFuture = [], canvasCoalesce = null;

// --- Pure coordinate helpers (unit-tested in test/run.mjs) ---
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
// Push onto a bounded stack (drops the oldest past the cap). Used by the undo history.
const pushCapped = (arr, item, cap) => { arr.push(item); while (arr.length > cap) arr.shift(); return arr; };
const screenToWorld = (cx, cy, rectLeft, rectTop, view) => ({
  x: (cx - rectLeft - view.panX) / view.zoom,
  y: (cy - rectTop - view.panY) / view.zoom,
});
const worldToScreen = (wx, wy, rectLeft, rectTop, view) => ({
  x: rectLeft + view.panX + wx * view.zoom,
  y: rectTop + view.panY + wy * view.zoom,
});
// Do two {x,y,w,h} rects overlap? (marquee hit-testing)
const rectsOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// Snap a moving bounding box to other rects' edges/centres; returns the nudge + guide lines.
function computeSnap(box, others, threshold) {
  const mx = [box.x, box.x + box.w / 2, box.x + box.w];
  const my = [box.y, box.y + box.h / 2, box.y + box.h];
  const best = { dx: 0, dy: 0, adx: Infinity, ady: Infinity };
  others.forEach((o) => {
    const ox = [o.x, o.x + o.w / 2, o.x + o.w];
    const oy = [o.y, o.y + o.h / 2, o.y + o.h];
    mx.forEach((m) => ox.forEach((t) => { const d = t - m; if (Math.abs(d) <= threshold && Math.abs(d) < best.adx) { best.dx = d; best.adx = Math.abs(d); } }));
    my.forEach((m) => oy.forEach((t) => { const d = t - m; if (Math.abs(d) <= threshold && Math.abs(d) < best.ady) { best.dy = d; best.ady = Math.abs(d); } }));
  });
  const dx = best.adx === Infinity ? 0 : best.dx, dy = best.ady === Infinity ? 0 : best.dy;
  const vlines = [], hlines = [];
  if (best.adx !== Infinity) {
    const sx = [box.x + dx, box.x + box.w / 2 + dx, box.x + box.w + dx];
    others.forEach((o) => { const ox = [o.x, o.x + o.w / 2, o.x + o.w]; sx.forEach((s) => ox.forEach((t) => { if (Math.abs(t - s) < 0.5) vlines.push(s); })); });
  }
  if (best.ady !== Infinity) {
    const sy = [box.y + dy, box.y + box.h / 2 + dy, box.y + box.h + dy];
    others.forEach((o) => { const oy = [o.y, o.y + o.h / 2, o.y + o.h]; sy.forEach((s) => oy.forEach((t) => { if (Math.abs(t - s) < 0.5) hlines.push(s); })); });
  }
  return { dx, dy, vlines: [...new Set(vlines)], hlines: [...new Set(hlines)] };
}
// Point on a box's border along the line from its centre toward (tx,ty). (unit-tested)
function edgePoint(rect, tx, ty) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const hw = rect.w / 2, hh = rect.h / 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: cx + dx * scale, y: cy + dy * scale };
}
// el() builds HTML; SVG needs its own namespace.
const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(SVGNS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  return n;
}

function canvasReady() {
  if (!sb) { setCanvasStatus("Sync library didn't load — reload the page.", "warn"); return false; }
  if (!syncUser) { setCanvasStatus("Sign in under “Sync” to use the canvas.", "warn"); return false; }
  return true;
}
function setCanvasStatus(text, kind = "") {
  const s = $("#canvas-status");
  if (s) { s.textContent = text; s.className = "ai-status " + kind; }
}
function updateCanvasAuth() {
  const ok = !!(sb && syncUser);
  const hint = $("#canvas-hint");
  if (hint) hint.hidden = ok;
  ["#canvas-add-img", "#canvas-add-note", "#canvas-add-text", "#canvas-add-shape"].forEach((sel) => { const b = $(sel); if (b) b.disabled = !ok; });
}

async function canvasImageUrl(path) {
  if (!sb || !path) return "";
  const now = Date.now();
  const c = canvasUrlCache[path];
  if (c && c.exp > now) return c.url;
  const { data, error } = await sb.storage.from("canvas").createSignedUrl(path, 3600);
  if (error || !data) { console.error("[canvas] sign url", error); return ""; }
  canvasUrlCache[path] = { url: data.signedUrl, exp: now + 3300 * 1000 };
  return data.signedUrl;
}

function imgDims(dataUrl) {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth || i.width, h: i.naturalHeight || i.height });
    i.onerror = () => res({ w: 1, h: 1 });
    i.src = dataUrl;
  });
}

// --- Viewport (pan / zoom) ---
function boardRect() {
  const b = $("#canvas-board");
  return b ? b.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
}
function saveCanvasView() {
  clearTimeout(canvasViewTimer);
  canvasViewTimer = setTimeout(() => store.set("org.canvasview", canvasView), 300);
}
function applyViewTransform() {
  const surface = $("#canvas-surface");
  if (surface) surface.style.transform =
    `translate(${canvasView.panX}px, ${canvasView.panY}px) scale(${canvasView.zoom})`;
  const board = $("#canvas-board");
  if (board) {
    const g = GRID * canvasView.zoom;
    board.style.backgroundSize = `${g}px ${g}px`;
    board.style.backgroundPosition = `${canvasView.panX}px ${canvasView.panY}px`;
  }
  const pct = $("#canvas-zoom-pct");
  if (pct) pct.textContent = Math.round(canvasView.zoom * 100) + "%";
}
function panBy(dx, dy) { canvasView.panX += dx; canvasView.panY += dy; applyViewTransform(); }
// Zoom around a screen point, keeping the world point under it fixed.
function zoomAt(clientX, clientY, factor) {
  const r = boardRect();
  const nz = clampZoom(canvasView.zoom * factor);
  const cx = clientX - r.left, cy = clientY - r.top;
  const wx = (cx - canvasView.panX) / canvasView.zoom;
  const wy = (cy - canvasView.panY) / canvasView.zoom;
  canvasView.panX = cx - wx * nz;
  canvasView.panY = cy - wy * nz;
  canvasView.zoom = nz;
  applyViewTransform();
  saveCanvasView();
}
function zoomAtCenter(factor) {
  const r = boardRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
}
// Frame all items (or reset when empty).
function fitCanvas() {
  const r = boardRect();
  const boxes = canvasItems.filter((i) => i.type !== "connector");
  if (!boxes.length) { canvasView = { panX: 0, panY: 0, zoom: 1 }; applyViewTransform(); saveCanvasView(); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  boxes.forEach((i) => {
    minX = Math.min(minX, i.x); minY = Math.min(minY, i.y);
    maxX = Math.max(maxX, i.x + i.w); maxY = Math.max(maxY, i.y + i.h);
  });
  const pad = 60, cw = maxX - minX + pad * 2, ch = maxY - minY + pad * 2;
  const zoom = clampZoom(Math.min(r.width / cw, r.height / ch));
  canvasView.zoom = zoom;
  canvasView.panX = (r.width - (minX + maxX) * zoom) / 2;
  canvasView.panY = (r.height - (minY + maxY) * zoom) / 2;
  applyViewTransform();
  saveCanvasView();
}

// Place a new item near the centre of the current viewport, in world coords.
function canvasPlacePos(w = 200, h = 150) {
  const r = boardRect();
  const c = screenToWorld(r.left + r.width / 2, r.top + r.height / 2, r.left, r.top, canvasView);
  const n = canvasItems.length % 6;
  return { x: Math.round(c.x - w / 2 + n * 20), y: Math.round(c.y - h / 2 + n * 20) };
}

// --- Alignment guides (drawn on the overlay while dragging) ---
function clearGuides() { const g = $("#canvas-guides"); if (g) g.querySelectorAll(".cvi-guide").forEach((n) => n.remove()); }
function drawGuides(vlines, hlines) {
  const g = $("#canvas-guides");
  if (!g) return;
  clearGuides();
  vlines.forEach((wx) => g.append(el("div", { class: "cvi-guide v", style: `left:${canvasView.panX + wx * canvasView.zoom}px` })));
  hlines.forEach((wy) => g.append(el("div", { class: "cvi-guide h", style: `top:${canvasView.panY + wy * canvasView.zoom}px` })));
}

// --- Selection (multi) ---
function updateSelClasses() {
  const single = canvasSel.size === 1;
  canvasNodes.forEach((node, id) => {
    const on = canvasSel.has(id);
    node.classList.toggle("selected", on);
    node.classList.toggle("single", on && single);
  });
  canvasEdgeEls.forEach((p, id) => p.classList.toggle("selected", canvasSel.has(id)));
}
function selectOnly(id) { canvasSel = new Set(id ? [id] : []); updateSelClasses(); }
function toggleSelect(id) { if (canvasSel.has(id)) canvasSel.delete(id); else canvasSel.add(id); updateSelClasses(); }
function clearCanvasSelection() { canvasSel.clear(); updateSelClasses(); }
function selectedItems() { return canvasItems.filter((x) => canvasSel.has(x.id)); }

// --- Undo / redo ---
const canvasSnapshot = () => JSON.stringify(canvasItems);
// Snapshot the current board BEFORE a mutation. `tag` coalesces repeats of one gesture
// (e.g. holding an arrow key) into a single undo step.
function beginChange(tag = null) {
  if (tag && tag === canvasCoalesce) return;
  pushCapped(canvasPast, canvasSnapshot(), HIST_MAX);
  canvasFuture = [];
  canvasCoalesce = tag;
}
function restoreCanvas(json) {
  canvasItems = JSON.parse(json);
  canvasSel = new Set();
  canvasCoalesce = null;
  save.canvas();
  renderCanvas();
}
function undoCanvas() {
  if (!canvasPast.length) { setCanvasStatus("Nothing to undo", ""); return; }
  canvasFuture.push(canvasSnapshot());
  restoreCanvas(canvasPast.pop());
  setCanvasStatus("Undo", "");
}
function redoCanvas() {
  if (!canvasFuture.length) { setCanvasStatus("Nothing to redo", ""); return; }
  pushCapped(canvasPast, canvasSnapshot(), HIST_MAX);
  restoreCanvas(canvasFuture.pop());
  setCanvasStatus("Redo", "");
}

function bringToFront(item, node) {
  item.z = ++canvasZ;
  if (node) node.style.zIndex = item.z;
  save.canvas();
}

// --- Drag / resize (world-aware, multi-select + snapping) ---
function startItemDrag(e, item, node) {
  if (e.target.closest(".cvi-resize") || e.target.closest(".cvi-tools") || e.target.closest(".cvi-connect")) return; // handled elsewhere
  if (canvasSpace || e.button === 1) return;                    // let the board pan instead
  if ((item.type === "note" || item.type === "text") && node.classList.contains("editing")) return; // editing text
  e.stopPropagation();
  if (e.shiftKey) { toggleSelect(item.id); return; }            // shift-click toggles, no drag
  if (!canvasSel.has(item.id)) selectOnly(item.id);             // clicking outside the selection resets it
  bringToFront(item, node);
  const starts = selectedItems().filter((it) => it.type !== "connector").map((it) => ({ it, ox: it.x, oy: it.y }));
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  starts.forEach((s) => { bx0 = Math.min(bx0, s.ox); by0 = Math.min(by0, s.oy); bx1 = Math.max(bx1, s.ox + s.it.w); by1 = Math.max(by1, s.oy + s.it.h); });
  const base = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
  const others = canvasItems.filter((x) => !canvasSel.has(x.id) && x.type !== "connector");
  const sx = e.clientX, sy = e.clientY;
  let moved = false;
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
    if (!moved) beginChange();
    moved = true;
    let dx = (ev.clientX - sx) / canvasView.zoom, dy = (ev.clientY - sy) / canvasView.zoom;
    const snap = ev.altKey ? { dx: 0, dy: 0, vlines: [], hlines: [] }
      : computeSnap({ x: base.x + dx, y: base.y + dy, w: base.w, h: base.h }, others, SNAP / canvasView.zoom);
    dx += snap.dx; dy += snap.dy;
    starts.forEach((s) => {
      s.it.x = Math.round(s.ox + dx); s.it.y = Math.round(s.oy + dy);
      const n = canvasNodes.get(s.it.id);
      if (n) { n.style.left = s.it.x + "px"; n.style.top = s.it.y + "px"; }
    });
    drawGuides(snap.vlines, snap.hlines);
    redrawEdges();
  };
  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    clearGuides();
    if (moved) save.canvas();
    else if ((item.type === "note" || item.type === "text") && canvasSel.size === 1) enterNoteEdit(item, node); // a click (no drag) edits the text
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

function startResize(e, item, node) {
  e.preventDefault();
  e.stopPropagation();
  selectOnly(item.id);
  bringToFront(item, node);
  const sx = e.clientX, sy = e.clientY, ow = item.w, oh = item.h;
  let began = false;
  const move = (ev) => {
    if (!began) { beginChange(); began = true; }
    item.w = Math.max(90, Math.round(ow + (ev.clientX - sx) / canvasView.zoom));
    item.h = Math.max(60, Math.round(oh + (ev.clientY - sy) / canvasView.zoom));
    node.style.width = item.w + "px";
    node.style.height = item.h + "px";
    redrawEdges();
  };
  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    save.canvas();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

function enterNoteEdit(item, node) {
  const ta = node.querySelector(".cvi-note");
  if (!ta) return;
  node.classList.add("editing");
  ta.readOnly = false;
  ta.focus();
  const v = ta.value; ta.value = ""; ta.value = v; // caret to end
}

function duplicateItems(items) {
  items = items.filter((it) => it.type !== "connector"); // connectors follow their endpoints
  if (!items.length) return;
  beginChange();
  const ids = [];
  items.forEach((it) => { const id = uid(); ids.push(id); canvasItems.push({ ...it, id, x: it.x + 24, y: it.y + 24, z: ++canvasZ }); });
  save.canvas();
  renderCanvas();
  canvasSel = new Set(ids);
  updateSelClasses();
}
function duplicateCanvasItem(item) { duplicateItems([item]); }

function deleteItems(items) {
  if (!items.length) return;
  beginChange();
  const ids = new Set(items.map((x) => x.id));
  const paths = items.filter((x) => x.type === "image" && x.path).map((x) => x.path);
  // Drop the items AND any connector attached to one of them.
  canvasItems = canvasItems.filter((x) => !ids.has(x.id) && !(x.type === "connector" && (ids.has(x.from) || ids.has(x.to))));
  ids.forEach((id) => canvasSel.delete(id));
  save.canvas();
  // Only drop a Storage object if no remaining item still references that path.
  if (sb) paths.forEach((p) => {
    if (!canvasItems.some((x) => x.path === p)) sb.storage.from("canvas").remove([p]).catch((err) => console.error("[canvas] remove", err));
  });
  renderCanvas();
}
function deleteCanvasItem(item) { deleteItems([item]); }

function copyCanvasSelection() {
  const items = selectedItems().filter((it) => it.type !== "connector");
  if (!items.length) return;
  canvasClip = items.map((it) => ({ type: it.type, path: it.path, text: it.text, color: it.color, x: it.x, y: it.y, w: it.w, h: it.h }));
  setCanvasStatus(`Copied ${items.length} item${items.length === 1 ? "" : "s"}`, "ok");
}
function pasteCanvasClipboard() {
  if (!canvasClip.length) return;
  beginChange();
  const off = 24, ids = [];
  canvasClip.forEach((c) => { const id = uid(); ids.push(id); canvasItems.push({ ...c, id, x: c.x + off, y: c.y + off, z: ++canvasZ }); });
  canvasClip = canvasClip.map((c) => ({ ...c, x: c.x + off, y: c.y + off })); // cascade repeated pastes
  save.canvas();
  renderCanvas();
  canvasSel = new Set(ids);
  updateSelClasses();
}

function buildCanvasItem(item) {
  const body = el("div", { class: "cvi-body" }, []);
  let ta = null;
  if (item.type === "image") {
    const img = el("img", { alt: "", draggable: "false" });
    canvasImageUrl(item.path).then((u) => { if (u) img.src = u; });
    body.append(img);
  } else if (item.type === "shape") {
    body.style.background = item.fill || NOTE_COLORS[1];
    if (item.shape === "ellipse") body.style.borderRadius = "50%";
  } else { // note or text
    if (item.type === "note") body.style.background = item.color || NOTE_COLORS[0];
    ta = el("textarea", { class: "cvi-note", placeholder: item.type === "text" ? "Text…" : "Note…", readonly: "readonly" }, [item.text || ""]);
    ta.addEventListener("input", () => { item.text = ta.value; save.canvas(); });
    ta.addEventListener("blur", () => { node.classList.remove("editing"); ta.readOnly = true; save.canvas(); });
    body.append(ta);
  }

  // Floating per-item toolbar (visible only when this is the sole selection)
  const tools = el("div", { class: "cvi-tools" }, []);
  const colorKey = item.type === "shape" ? "fill" : item.type === "note" ? "color" : null;
  if (colorKey) {
    const palette = el("div", { class: "cvi-palette" }, NOTE_COLORS.map((col) =>
      el("button", { class: "cvi-swatch", style: `background:${col}`, title: col,
        onclick: (e) => { e.stopPropagation(); beginChange(); item[colorKey] = col; body.style.background = col; palette.classList.remove("open"); save.canvas(); } })));
    tools.append(el("div", { class: "cvi-color-wrap" }, [
      el("button", { class: "cvi-tool", title: "Colour", text: "🎨",
        onclick: (e) => { e.stopPropagation(); palette.classList.toggle("open"); } }),
      palette,
    ]));
  }
  if (item.type === "shape") {
    tools.append(el("button", { class: "cvi-tool", title: "Rectangle / ellipse", text: item.shape === "ellipse" ? "▭" : "⬭",
      onclick: (e) => { e.stopPropagation(); beginChange(); item.shape = item.shape === "ellipse" ? "rect" : "ellipse"; save.canvas(); renderCanvas(); selectOnly(item.id); } }));
  }
  tools.append(el("button", { class: "cvi-tool", title: "Duplicate (Ctrl/⌘+D)", text: "⧉",
    onclick: (e) => { e.stopPropagation(); duplicateCanvasItem(item); } }));
  tools.append(el("button", { class: "cvi-tool danger", title: "Delete (Del)", text: "🗑",
    onclick: (e) => { e.stopPropagation(); deleteCanvasItem(item); } }));

  const resize = el("div", { class: "cvi-resize", title: "Drag to resize" });
  const connect = el("div", { class: "cvi-connect", title: "Drag to another item to connect" });
  const sel = canvasSel.has(item.id);
  const node = el("div", {
    class: `cvi ${item.type}${sel ? " selected" : ""}${sel && canvasSel.size === 1 ? " single" : ""}`,
    style: `left:${item.x}px;top:${item.y}px;width:${item.w}px;height:${item.h}px;z-index:${item.z || 1}`,
  }, [body, tools, resize, connect]);

  node.addEventListener("pointerdown", (e) => startItemDrag(e, item, node));
  resize.addEventListener("pointerdown", (e) => startResize(e, item, node));
  connect.addEventListener("pointerdown", (e) => startConnect(e, item));
  canvasNodes.set(item.id, node);
  return node;
}

// --- Connectors (arrows between items) ---
function buildEdges(surface) {
  canvasEdgeEls.clear();
  const svg = svgEl("svg", { class: "cvi-edges" });
  const defs = svgEl("defs");
  const marker = svgEl("marker", { id: "cvi-arrow", viewBox: "0 0 10 10", refX: "8.5", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
  marker.append(svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: "cvi-arrowhead" }));
  defs.append(marker);
  svg.append(defs);
  canvasItems.filter((x) => x.type === "connector").forEach((c) => {
    const path = svgEl("path", { class: "cvi-edge", "marker-end": "url(#cvi-arrow)" });
    path.addEventListener("pointerdown", (e) => { e.stopPropagation(); selectOnly(c.id); });
    svg.append(path);
    canvasEdgeEls.set(c.id, path);
  });
  surface.append(svg);
}
function redrawEdges() {
  canvasEdgeEls.forEach((path, id) => {
    const c = canvasItems.find((x) => x.id === id);
    const a = c && canvasItems.find((x) => x.id === c.from);
    const b = c && canvasItems.find((x) => x.id === c.to);
    if (!a || !b) { path.setAttribute("d", ""); return; }
    const p1 = edgePoint(a, b.x + b.w / 2, b.y + b.h / 2);
    const p2 = edgePoint(b, a.x + a.w / 2, a.y + a.h / 2);
    path.setAttribute("d", `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`);
    path.classList.toggle("selected", canvasSel.has(id));
  });
}
// Drag from a selected item's connect handle onto another item to create an arrow.
function startConnect(e, item) {
  e.preventDefault();
  e.stopPropagation();
  const r = boardRect();
  const svg = $(".cvi-edges");
  const temp = svgEl("path", { class: "cvi-edge temp", "marker-end": "url(#cvi-arrow)" });
  if (svg) svg.append(temp);
  const move = (ev) => {
    const w = screenToWorld(ev.clientX, ev.clientY, r.left, r.top, canvasView);
    const p1 = edgePoint(item, w.x, w.y);
    temp.setAttribute("d", `M ${p1.x} ${p1.y} L ${w.x} ${w.y}`);
  };
  const up = (ev) => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    temp.remove();
    const w = screenToWorld(ev.clientX, ev.clientY, r.left, r.top, canvasView);
    const target = canvasItems.filter((x) => x.type !== "connector")
      .reverse().find((x) => w.x >= x.x && w.x <= x.x + x.w && w.y >= x.y && w.y <= x.y + x.h);
    if (target && target.id !== item.id &&
        !canvasItems.some((x) => x.type === "connector" && x.from === item.id && x.to === target.id)) {
      beginChange();
      canvasItems.push({ id: uid(), type: "connector", from: item.id, to: target.id, z: 0 });
      save.canvas();
      renderCanvas();
      setCanvasStatus("Connected", "ok");
    }
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

function renderCanvas() {
  const surface = $("#canvas-surface");
  if (!surface) return;
  updateCanvasAuth();
  canvasZ = canvasItems.reduce((m, i) => Math.max(m, i.z || 1), 1);
  canvasNodes.clear();
  surface.innerHTML = "";
  canvasItems.filter((it) => it.type !== "connector").forEach((item) => surface.append(buildCanvasItem(item)));
  buildEdges(surface);
  redrawEdges();
  applyViewTransform();
}

function handleCanvasFile(file) {
  if (!file || !file.type.startsWith("image/")) { setCanvasStatus("Only images can go on the canvas.", "warn"); return; }
  if (!canvasReady()) return;
  setCanvasStatus("Uploading…", "");
  resizeImage(file, 1600, async (dataUrl) => {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const path = uid() + ".jpg";
      const { error } = await sb.storage.from("canvas").upload(path, blob, { contentType: "image/jpeg" });
      if (error) { console.error("[canvas] upload", error); setCanvasStatus("Upload failed: " + error.message, "warn"); return; }
      const dim = await imgDims(dataUrl);
      const w = 280;
      const h = Math.max(80, Math.round(w * (dim.h / (dim.w || 1))));
      const pos = canvasPlacePos(w, h);
      const id = uid();
      beginChange();
      canvasItems.push({ id, type: "image", path, x: pos.x, y: pos.y, w, h, z: ++canvasZ });
      save.canvas();
      renderCanvas();
      selectOnly(id);
      setCanvasStatus("Added ✓", "ok");
    } catch (err) {
      console.error("[canvas] add", err);
      setCanvasStatus("Upload failed: " + err.message, "warn");
    }
  });
}

function addCanvasNote() {
  if (!canvasReady()) return;
  beginChange();
  const pos = canvasPlacePos(200, 150);
  const item = { id: uid(), type: "note", text: "", color: NOTE_COLORS[0], x: pos.x, y: pos.y, w: 200, h: 150, z: ++canvasZ };
  canvasItems.push(item);
  save.canvas();
  renderCanvas();
  selectOnly(item.id);
  const node = canvasNodes.get(item.id);
  if (node) enterNoteEdit(item, node);
}

function addText() {
  if (!canvasReady()) return;
  beginChange();
  const pos = canvasPlacePos(220, 64);
  const item = { id: uid(), type: "text", text: "", x: pos.x, y: pos.y, w: 220, h: 64, z: ++canvasZ };
  canvasItems.push(item);
  save.canvas();
  renderCanvas();
  selectOnly(item.id);
  const node = canvasNodes.get(item.id);
  if (node) enterNoteEdit(item, node);
}

function addShape() {
  if (!canvasReady()) return;
  beginChange();
  const pos = canvasPlacePos(170, 120);
  const item = { id: uid(), type: "shape", shape: "rect", fill: NOTE_COLORS[1], x: pos.x, y: pos.y, w: 170, h: 120, z: ++canvasZ };
  canvasItems.push(item);
  save.canvas();
  renderCanvas();
  selectOnly(item.id);
}

function onCanvasKeyDown(e) {
  const view = $("#view-canvas");
  if (!view || !view.classList.contains("active")) return;
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  const typing = /^(input|textarea|select)$/i.test(tag);
  if (e.key === "Escape") {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    clearCanvasSelection();
    return;
  }
  if (typing) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); if (e.shiftKey) redoCanvas(); else undoCanvas(); return; }
  if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redoCanvas(); return; }
  if (mod && (e.key === "a" || e.key === "A")) { e.preventDefault(); canvasSel = new Set(canvasItems.map((x) => x.id)); updateSelClasses(); return; }
  if (mod && (e.key === "c" || e.key === "C")) { e.preventDefault(); copyCanvasSelection(); return; }
  if (!canvasSel.size) return;
  const items = selectedItems();
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteItems(items); }
  else if (mod && (e.key === "d" || e.key === "D")) { e.preventDefault(); duplicateItems(items); }
  else if (e.key.startsWith("Arrow")) {
    e.preventDefault();
    beginChange("nudge");
    const s = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0;
    const dy = e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0;
    items.filter((it) => it.type !== "connector").forEach((it) => {
      it.x += dx; it.y += dy;
      const node = canvasNodes.get(it.id);
      if (node) { node.style.left = it.x + "px"; node.style.top = it.y + "px"; }
    });
    redrawEdges();
    save.canvas();
  }
}

function initCanvas() {
  $("#canvas-add-img").addEventListener("click", () => $("#canvas-file").click());
  $("#canvas-file").addEventListener("change", () => {
    const f = $("#canvas-file").files[0];
    if (f) handleCanvasFile(f);
    $("#canvas-file").value = "";
  });
  $("#canvas-add-note").addEventListener("click", addCanvasNote);
  const at = $("#canvas-add-text"), as = $("#canvas-add-shape");
  if (at) at.addEventListener("click", addText);
  if (as) as.addEventListener("click", addShape);

  const zi = $("#canvas-zoom-in"), zo = $("#canvas-zoom-out"), zf = $("#canvas-fit"), zp = $("#canvas-zoom-pct");
  if (zi) zi.addEventListener("click", () => zoomAtCenter(1.2));
  if (zo) zo.addEventListener("click", () => zoomAtCenter(1 / 1.2));
  if (zp) zp.addEventListener("click", () => zoomAtCenter(1 / canvasView.zoom)); // reset to 100%
  if (zf) zf.addEventListener("click", fitCanvas);

  const board = $("#canvas-board");

  // Pan (Space-drag / middle mouse) vs. marquee-select (drag empty space, left button).
  function startPan(ev0) {
    const sx = ev0.clientX, sy = ev0.clientY, opx = canvasView.panX, opy = canvasView.panY;
    board.classList.add("panning");
    const move = (ev) => { canvasView.panX = opx + (ev.clientX - sx); canvasView.panY = opy + (ev.clientY - sy); applyViewTransform(); };
    const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); board.classList.remove("panning"); saveCanvasView(); };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }
  function startMarquee(ev0) {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const r = boardRect();
    const start = screenToWorld(ev0.clientX, ev0.clientY, r.left, r.top, canvasView);
    const additive = ev0.shiftKey;
    const base = new Set(canvasSel);
    const layer = $("#canvas-guides");
    const box = el("div", { class: "canvas-marquee" });
    if (layer) layer.append(box);
    let moved = false;
    const move = (ev) => {
      const cur = screenToWorld(ev.clientX, ev.clientY, r.left, r.top, canvasView);
      const x = Math.min(start.x, cur.x), y = Math.min(start.y, cur.y), w = Math.abs(cur.x - start.x), h = Math.abs(cur.y - start.y);
      if (!moved && (w + h) * canvasView.zoom < 4) return;
      moved = true;
      box.style.left = (canvasView.panX + x * canvasView.zoom) + "px";
      box.style.top = (canvasView.panY + y * canvasView.zoom) + "px";
      box.style.width = (w * canvasView.zoom) + "px";
      box.style.height = (h * canvasView.zoom) + "px";
      const marq = { x, y, w, h };
      const hit = canvasItems.filter((it) => it.type !== "connector" && rectsOverlap(marq, it)).map((it) => it.id);
      canvasSel = additive ? new Set([...base, ...hit]) : new Set(hit);
      updateSelClasses();
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      box.remove();
      if (!moved && !additive) clearCanvasSelection(); // a plain empty click deselects
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }
  board.addEventListener("pointerdown", (e) => {
    const onItem = e.target.closest(".cvi");
    const wantPan = canvasSpace || e.button === 1;
    if (onItem && !wantPan) return;   // the item handles its own gesture
    if (wantPan) { e.preventDefault(); startPan(e); return; }
    if (e.button !== 0) return;        // ignore right/aux clicks on empty space
    startMarquee(e);
  });

  // Wheel: Ctrl/⌘ = zoom to cursor; plain = pan; Shift = pan horizontally.
  board.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    else if (e.shiftKey) { panBy(-(e.deltaY + e.deltaX), 0); saveCanvasView(); }
    else { panBy(-e.deltaX, -e.deltaY); saveCanvasView(); }
  }, { passive: false });

  board.addEventListener("dragover", (e) => e.preventDefault());
  board.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleCanvasFile(f);
  });

  window.addEventListener("keydown", (e) => {
    const view = $("#view-canvas");
    const active = view && view.classList.contains("active");
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    const typing = /^(input|textarea|select)$/i.test(tag);
    if (e.code === "Space" && active && !typing) { canvasSpace = true; e.preventDefault(); }
    onCanvasKeyDown(e);
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") canvasSpace = false; });

  window.addEventListener("paste", (e) => {
    const view = $("#view-canvas");
    if (!view || !view.classList.contains("active")) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (/^(input|textarea)$/i.test(tag)) return; // editing text — let the field handle it
    const items = e.clipboardData && e.clipboardData.items;
    let handledImage = false;
    if (items) for (const it of items) {
      if (it.type && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) { handleCanvasFile(f); e.preventDefault(); handledImage = true; }
        break;
      }
    }
    if (!handledImage && canvasClip.length) { e.preventDefault(); pasteCanvasClipboard(); } // paste copied items
  });

  applyViewTransform();
  updateCanvasAuth();
}

// ============================================================
//  Garden (co-op idle game — "Our Garden")
// ============================================================
// Plant types: cost in sunlight, grow in seconds, yield in coins, unlock in coins.
const PLANTS = {
  sprout:    { name: "Sprout",    emoji: "🌱", cost: 15,  grow: 30,  yield: 12,  unlock: 0 },
  flower:    { name: "Flower",    emoji: "🌸", cost: 60,  grow: 180, yield: 70,  unlock: 120 },
  sunflower: { name: "Sunflower", emoji: "🌻", cost: 180, grow: 600, yield: 260, unlock: 600 },
};
const PLANT_ORDER = ["sprout", "flower", "sunflower"];
const PLANT_COLORS = { sprout: "#8bd17c", flower: "#f6a5c0", sunflower: "#ffd23f" };
const GARDEN_TICK = 1000; // UI refresh cadence while the view is open

// --- Pure helpers (unit-tested in test/run.mjs) ---
const sunGain = (rate, elapsedMs) => (rate * Math.max(0, elapsedMs)) / 1000;
const growProgress = (growSec, planted, now) =>
  planted == null ? 0 : Math.max(0, Math.min(1, (now - planted) / (growSec * 1000)));
const isRipe = (growSec, planted, now) => planted != null && now - planted >= growSec * 1000;
const plotCost = (nPlots) => Math.round(50 * Math.pow(1.6, nPlots));      // rising coin price
const sunLampCost = (rate) => Math.round(60 * Math.pow(1.7, rate - 1));   // rising coin price
// Which plot does a canvas x-coordinate fall on? (unit-tested)
const plotIndexAtX = (x, w, n, pad) =>
  (n <= 0 || x < pad || x > w - pad) ? -1 : Math.min(n - 1, Math.floor((x - pad) / ((w - 2 * pad) / n)));

function seedGarden() {
  return {
    sun: 0, coins: 0, sunRate: 1, lastTick: Date.now(),
    plots: Array.from({ length: 3 }, () => ({ id: uid(), plant: null, planted: null })),
    unlocked: ["sprout"],
    createdAt: new Date().toISOString(),
  };
}

// Award sunlight accrued since the last settle (works across reloads / offline).
function settleSun() {
  if (!garden) return;
  const now = Date.now();
  garden.sun += sunGain(garden.sunRate, now - garden.lastTick);
  garden.lastTick = now;
}

let gardenSelSeed = "sprout"; // which seed a plot-click plants (per device)
let gardenTickCount = 0;
let gardenCanvas = null, gardenCtx = null, gardenRaf = 0, gardenHover = -1;

function fmtDuration(sec) {
  if (sec <= 0) return "ready";
  if (sec < 60) return sec + "s";
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + "m" + (s ? " " + s + "s" : "");
}
function setGardenMsg(text) {
  const m = $("#garden-msg");
  if (m) m.textContent = text || "";
}

// --- Actions (each settles sun first, then saves + re-renders) ---
function plantSeed(plot, type) {
  const p = PLANTS[type];
  if (!garden || !p || plot.plant) return;
  settleSun();
  if (garden.sun < p.cost) { setGardenMsg(`Need ☀️ ${p.cost} to plant a ${p.name}.`); return; }
  garden.sun -= p.cost;
  plot.plant = type; plot.planted = Date.now();
  save.idle(); renderGarden(); updateBadges();
}
function harvest(plot) {
  if (!garden || !plot.plant) return;
  const p = PLANTS[plot.plant];
  if (!isRipe(p.grow, plot.planted, Date.now())) return;
  settleSun();
  garden.coins += p.yield;
  plot.plant = null; plot.planted = null;
  save.idle(); renderGarden(); updateBadges();
  setGardenMsg(`Harvested a ${p.name} for 🪙 ${p.yield}!`);
}
function buyPlot() {
  if (!garden) return;
  settleSun();
  const cost = plotCost(garden.plots.length);
  if (garden.coins < cost) { setGardenMsg(`Need 🪙 ${cost} for a new plot.`); return; }
  garden.coins -= cost;
  garden.plots.push({ id: uid(), plant: null, planted: null });
  save.idle(); renderGarden();
}
function buySunLamp() {
  if (!garden) return;
  settleSun();
  const cost = sunLampCost(garden.sunRate);
  if (garden.coins < cost) { setGardenMsg(`Need 🪙 ${cost} for a sun lamp.`); return; }
  garden.coins -= cost; garden.sunRate += 1;
  save.idle(); renderGarden();
}
function unlockPlant(type) {
  const p = PLANTS[type];
  if (!garden || !p || garden.unlocked.includes(type)) return;
  settleSun();
  if (garden.coins < p.unlock) { setGardenMsg(`Need 🪙 ${p.unlock} to unlock the ${p.name}.`); return; }
  garden.coins -= p.unlock; garden.unlocked.push(type); gardenSelSeed = type;
  save.idle(); renderGarden();
}

// --- Rendering ---
// (plots are drawn on the canvas now — see drawGarden/drawPlant)
function renderGardenSeedbar() {
  const bar = $("#garden-seedbar");
  if (!bar) return;
  bar.innerHTML = "";
  PLANT_ORDER.forEach((key) => {
    const p = PLANTS[key];
    if (garden.unlocked.includes(key)) {
      bar.append(el("button", {
        class: "garden-seed" + (gardenSelSeed === key ? " sel" : ""),
        title: `Plant costs ☀️ ${p.cost} · grows in ${fmtDuration(p.grow)} · yields 🪙 ${p.yield}`,
        onclick: () => { gardenSelSeed = key; renderGarden(); },
      }, [el("span", { text: p.emoji }), el("span", { class: "garden-seed-cost", text: `☀️${p.cost}` })]));
    } else {
      bar.append(el("button", { class: "garden-seed locked", title: `Unlock the ${p.name}`,
        onclick: () => unlockPlant(key) }, [el("span", { text: "🔒" + p.emoji }), el("span", { class: "garden-seed-cost", text: `🪙${p.unlock}` })]));
    }
  });
}
function renderGardenShop() {
  const shop = $("#garden-shop");
  if (!shop) return;
  shop.innerHTML = "";
  shop.append(
    el("button", { class: "garden-buy", onclick: buyPlot, text: `＋ Plot (🪙 ${plotCost(garden.plots.length)})` }),
    el("button", { class: "garden-buy", onclick: buySunLamp, title: "Increase sunlight per second",
      text: `☀️ Sun lamp (🪙 ${sunLampCost(garden.sunRate)})` }),
  );
}
function renderGarden() {
  if (!garden) return;
  const stats = $("#garden-stats");
  if (stats) {
    stats.innerHTML = "";
    stats.append(
      el("span", { class: "garden-stat", text: `☀️ ${Math.floor(garden.sun)}` }),
      el("span", { class: "garden-stat", text: `🪙 ${garden.coins}` }),
      el("span", { class: "garden-stat muted", text: `+${garden.sunRate}/s` }),
    );
  }
  renderGardenSeedbar();
  renderGardenShop();
  if (gardenCtx && gardenViewActive()) drawGarden(Date.now());
  startGardenAnim();
}

// Count of ripe plots (drives the sidebar badge nudge).
function gardenRipeCount() {
  if (!garden) return 0;
  const now = Date.now();
  return garden.plots.filter((pl) => pl.plant && isRipe(PLANTS[pl.plant].grow, pl.planted, now)).length;
}

// --- Canvas scene (side-on garden bed, drawn with 2D primitives — no assets) ---
const gardenDark = () => document.documentElement.getAttribute("data-theme") === "dark";
function gardenViewActive() { const v = $("#view-garden"); return !!(v && v.classList.contains("active")); }

function sizeGardenCanvas() {
  if (!gardenCanvas || !gardenCtx) return;
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.round(gardenCanvas.clientWidth * dpr), bh = Math.round(gardenCanvas.clientHeight * dpr);
  if (bw && bh && (gardenCanvas.width !== bw || gardenCanvas.height !== bh)) { gardenCanvas.width = bw; gardenCanvas.height = bh; }
  gardenCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawLeaf(ctx, x, y, size, angle) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.beginPath(); ctx.ellipse(size * 0.6, 0, size, size * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPlant(ctx, x, baseY, slot, plot, i, now, dark) {
  if (gardenHover === i) {
    ctx.fillStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.4)";
    ctx.beginPath(); ctx.ellipse(x, baseY + 6, slot * 0.4, 10, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (!plot.plant) {
    ctx.fillStyle = dark ? "#4a3626" : "#8a5f38";
    ctx.beginPath(); ctx.ellipse(x, baseY + 4, slot * 0.22, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.35)";
    ctx.font = "16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("＋", x, baseY - 10);
    return;
  }
  const p = PLANTS[plot.plant];
  const ripe = isRipe(p.grow, plot.planted, now);
  const prog = growProgress(p.grow, plot.planted, now);
  const stemH = Math.min(slot * 0.95, 96) * (ripe ? 1 : Math.max(0.12, prog));
  const sway = Math.sin(now / 700 + i) * (2 + 4 * prog);
  const bob = ripe ? Math.sin(now / 300 + i) * 3 : 0;
  const topX = x + sway, topY = baseY - stemH + bob;
  ctx.strokeStyle = dark ? "#3f8f4f" : "#3fa14a"; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x, baseY); ctx.quadraticCurveTo((x + topX) / 2 + sway, baseY - stemH * 0.5, topX, topY); ctx.stroke();
  if (prog > 0.25 || ripe) {
    ctx.fillStyle = dark ? "#3f8f4f" : "#5cb85c";
    const lx = (x + topX) / 2, ly = baseY - stemH * 0.5, ls = 8 + 6 * prog;
    drawLeaf(ctx, lx, ly, ls, -0.6); drawLeaf(ctx, lx, ly, ls, Math.PI + 0.6);
  }
  const col = PLANT_COLORS[plot.plant] || "#f6a5c0";
  const headR = ripe ? 13 : 4 + 8 * prog;
  if (ripe) {
    const g = ctx.createRadialGradient(topX, topY, 2, topX, topY, headR * 2.4);
    g.addColorStop(0, "rgba(255,255,190,0.55)"); g.addColorStop(1, "rgba(255,255,190,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(topX, topY, headR * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + now / 2200; ctx.beginPath(); ctx.ellipse(topX + Math.cos(a) * headR, topY + Math.sin(a) * headR, headR * 0.62, headR * 0.34, a, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = plot.plant === "sunflower" ? "#7a4a1e" : "#ffd23f";
    ctx.beginPath(); ctx.arc(topX, topY, headR * 0.68, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(topX, topY, headR, 0, Math.PI * 2); ctx.fill();
    const remain = Math.ceil((p.grow * 1000 - (now - plot.planted)) / 1000);
    ctx.fillStyle = dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.45)";
    ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(fmtDuration(remain), x, baseY + 8);
  }
}

function drawGarden(now) {
  if (!gardenCtx || !gardenCanvas) return;
  sizeGardenCanvas();
  const w = gardenCanvas.clientWidth, h = gardenCanvas.clientHeight;
  if (!w || !h || !garden) return;
  const ctx = gardenCtx, dark = gardenDark();
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  if (dark) { sky.addColorStop(0, "#1b2340"); sky.addColorStop(1, "#28374f"); }
  else { sky.addColorStop(0, "#bfe6ff"); sky.addColorStop(1, "#eaf7ef"); }
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  // sun
  const sunX = w * 0.84, sunY = h * 0.24, sunR = Math.min(w, h) * 0.09;
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3);
  glow.addColorStop(0, dark ? "rgba(255,220,150,0.5)" : "rgba(255,230,120,0.85)"); glow.addColorStop(1, "rgba(255,230,120,0)");
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 3, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(sunX, sunY); ctx.rotate((now / 5000) % (Math.PI * 2));
  ctx.strokeStyle = dark ? "rgba(255,220,150,0.35)" : "rgba(255,200,60,0.7)"; ctx.lineWidth = 2;
  for (let k = 0; k < 12; k++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(sunR * 1.3, 0); ctx.lineTo(sunR * 1.95, 0); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = dark ? "#ffd98a" : "#ffd23f"; ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
  // soil
  const soilY = h * 0.66;
  ctx.fillStyle = dark ? "#3a2a1e" : "#7a5230"; ctx.beginPath(); ctx.moveTo(0, soilY);
  for (let x = 0; x <= w; x += w / 8) ctx.quadraticCurveTo(x + w / 16, soilY - 6, x + w / 8, soilY);
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = dark ? "#2f5133" : "#6cbf59"; ctx.fillRect(0, soilY - 4, w, 6);
  // plants
  const n = garden.plots.length, pad = Math.max(24, w * 0.06), slot = (w - 2 * pad) / n;
  garden.plots.forEach((plot, i) => drawPlant(ctx, pad + (i + 0.5) * slot, soilY, slot, plot, i, now, dark));
}

function gardenLoop() {
  gardenRaf = 0;
  if (gardenCtx && gardenViewActive()) { drawGarden(Date.now()); gardenRaf = requestAnimationFrame(gardenLoop); }
}
function startGardenAnim() { if (!gardenRaf && gardenCtx && gardenViewActive()) gardenRaf = requestAnimationFrame(gardenLoop); }

function gardenPlotFromEvent(e) {
  if (!garden || !gardenCanvas) return -1;
  const rect = gardenCanvas.getBoundingClientRect();
  const w = gardenCanvas.clientWidth, pad = Math.max(24, w * 0.06);
  return plotIndexAtX(e.clientX - rect.left, w, garden.plots.length, pad);
}
function onGardenCanvasClick(e) {
  const i = gardenPlotFromEvent(e);
  if (i < 0) return;
  const plot = garden.plots[i];
  if (!plot.plant) plantSeed(plot, gardenSelSeed);
  else if (isRipe(PLANTS[plot.plant].grow, plot.planted, Date.now())) harvest(plot);
}
function onGardenCanvasHover(e) { gardenHover = gardenPlotFromEvent(e); }

function initGarden() {
  if (!garden) garden = seedGarden();
  settleSun();          // award sunlight accrued while away
  save.idle();
  gardenCanvas = $("#garden-canvas");
  gardenCtx = gardenCanvas && gardenCanvas.getContext ? gardenCanvas.getContext("2d") : null;
  if (gardenCanvas) {
    gardenCanvas.addEventListener("click", onGardenCanvasClick);
    gardenCanvas.addEventListener("pointermove", onGardenCanvasHover);
    gardenCanvas.addEventListener("pointerleave", () => { gardenHover = -1; });
  }
  const navBtn = document.querySelector('.menu-item[data-view="garden"]');
  if (navBtn) navBtn.addEventListener("click", () => startGardenAnim());
  renderGarden();
  setInterval(() => {
    if (!garden) return;
    settleSun();                                   // keep sunlight current (in-memory)
    gardenTickCount = (gardenTickCount + 1) % 20;
    if (gardenTickCount === 0) save.idle();        // ~20 s autosave so offline math stays correct
    const v = $("#view-garden");
    if (v && v.classList.contains("active")) renderGarden();
    updateBadges();
  }, GARDEN_TICK);
}

// ============================================================
//  Init
// ============================================================
if (!raids.length) {
  raids = seedRaids();
  save.raids();
}
renderTodos();
renderShopping();
renderCalLegend();
renderCalendar();
renderReminders();
renderRaids();
renderTCG();
renderRecipes();
renderGames();
renderCanvas();
initAiConfigUI();
renderAiSuggestions();
renderAiChat();
updateBadges();
initRecipes();
initCanvas();
initChat();
initGarden();
initSync();
refreshNotifNotice();

checkReminders();
setInterval(checkReminders, 20000); // poll every 20s while the tab is open
