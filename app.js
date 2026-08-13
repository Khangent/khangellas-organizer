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
    localStorage.setItem(key, JSON.stringify(value));
  },
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- App state ----------
let todos = store.get("org.todos", []);
let shopping = store.get("org.shopping", []);
let events = store.get("org.events", []);
let reminders = store.get("org.reminders", []);
let raids = store.get("org.raids", []);

const save = {
  todos: () => store.set("org.todos", todos),
  shopping: () => store.set("org.shopping", shopping),
  events: () => store.set("org.events", events),
  reminders: () => store.set("org.reminders", reminders),
  raids: () => store.set("org.raids", raids),
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

function itemsForDate(iso) {
  const evts = events.filter((e) => e.date === iso).map((e) => ({ type: "event", title: e.title }));
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
      .forEach((it) =>
        cell.append(el("div", { class: `cal-event ${it.type}`, text: it.title }))
      );
    cell.addEventListener("click", () => promptEvent(iso));
    grid.append(cell);
  }
}

function promptEvent(iso) {
  const title = prompt(`Add an event on ${fmtDate(iso)}:`);
  if (title && title.trim()) {
    events.push({ id: uid(), date: iso, title: title.trim() });
    save.events();
    renderCalendar();
  }
}

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
const mkRaids = () => RAID_DEFAULTS.map((n) => ({ id: uid(), name: n, done: false }));
const mkChar = (i) => ({ id: uid(), name: `Character ${i}`, cls: "", ilvl: "", raids: mkRaids() });
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
  overall.append(
    el("span", { class: "raid-count", text: `${all.done} / ${all.total} raids cleared` }),
    progressBar(all.done, all.total)
  );

  const wrap = $("#raid-people");
  wrap.innerHTML = "";

  if (!raids.length) {
    wrap.append(el("div", { class: "empty", text: "No players yet. Add one to get started. ⚔️" }));
  }

  raids.forEach((person) => {
    const ps = raidStats(person.characters);

    const head = el("div", { class: "person-head" }, [
      el("input", {
        class: "person-name", value: person.name, placeholder: "Player name",
        onchange: (e) => { person.name = e.target.value; save.raids(); },
      }),
      el("span", { class: "raid-count small", text: `${ps.done}/${ps.total}` }),
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

    const grid = el("div", { class: "char-grid" });
    person.characters.forEach((ch) => {
      const cs = raidStats([ch]);

      const rows = el("div", { class: "raid-rows" });
      ch.raids.forEach((r) => {
        rows.append(el("div", { class: `raid-row ${r.done ? "done" : ""}` }, [
          el("button", {
            class: `check ${r.done ? "on" : ""}`, title: "Toggle cleared",
            onclick: () => { r.done = !r.done; save.raids(); renderRaids(); updateBadges(); },
          }),
          el("input", {
            class: "raid-name", value: r.name, placeholder: "Raid name",
            onchange: (e) => { r.name = e.target.value; save.raids(); },
          }),
          el("button", {
            class: "icon-btn tiny", title: "Remove raid", text: "✕",
            onclick: () => {
              ch.raids = ch.raids.filter((x) => x.id !== r.id);
              save.raids(); renderRaids(); updateBadges();
            },
          }),
        ]));
      });

      grid.append(el("div", { class: "char-card" }, [
        el("div", { class: "char-head" }, [
          el("input", {
            class: "char-name", value: ch.name, placeholder: "Character",
            onchange: (e) => { ch.name = e.target.value; save.raids(); },
          }),
          el("span", {
            class: `char-count ${cs.done === cs.total && cs.total > 0 ? "complete" : ""}`,
            text: `${cs.done}/${cs.total}`,
          }),
        ]),
        el("div", { class: "char-meta" }, [
          el("input", {
            class: "char-cls", value: ch.cls, placeholder: "Class",
            onchange: (e) => { ch.cls = e.target.value; save.raids(); },
          }),
          el("input", {
            class: "char-ilvl", value: ch.ilvl, placeholder: "Item lvl",
            onchange: (e) => { ch.ilvl = e.target.value; save.raids(); },
          }),
        ]),
        rows,
        el("div", { class: "char-actions" }, [
          el("button", {
            class: "btn-ghost tiny", text: "+ Raid",
            onclick: () => {
              ch.raids.push({ id: uid(), name: `Raid ${ch.raids.length + 1}`, done: false });
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
      ]));
    });

    wrap.append(el("div", { class: "person-card" }, [head, grid]));
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
//  Init
// ============================================================
if (!raids.length) {
  raids = seedRaids();
  save.raids();
}
renderTodos();
renderShopping();
renderCalendar();
renderReminders();
renderRaids();
updateBadges();
refreshNotifNotice();

checkReminders();
setInterval(checkReminders, 20000); // poll every 20s while the tab is open
