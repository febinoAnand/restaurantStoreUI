/* =========================================================
   Spice Route - shared script
   Data store (browser localStorage), login/session, permissions,
   modals, toasts, formatting and printing helpers.
   ========================================================= */
(function () {
  "use strict";

  const DATA_KEY = "spiceRoute.data.v1";
  const SESSION_KEY = "spiceRoute.session";
  const VIEW_KEY = "spiceRoute.view";
  const LOW_STOCK = 10;

  /* ---------- storage (safe: works even when storage is blocked) ---------- */
  const memory = {};
  const storage = {
    get(key) {
      try { return localStorage.getItem(key); } catch (e) { return memory[key] ?? null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { memory[key] = value; }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { delete memory[key]; }
    },
  };

  /* ---------- modules & permissions ---------- */
  const ACTIONS = ["view", "create", "edit", "delete", "print"];
  const MODULES = [
    { key: "dashboard", name: "Dashboard", icon: "home", actions: ["view"] },
    { key: "billing", name: "Billing", icon: "receipt", actions: ["view", "create", "print"] },
    { key: "bills", name: "Bills", icon: "file", actions: ["view", "delete", "print"] },
    { key: "customers", name: "Customers", icon: "users", actions: ["view", "create", "edit", "delete"] },
    { key: "stock", name: "Stock / Food", icon: "utensils", actions: ["view", "create", "edit", "delete"] },
    { key: "reports", name: "Reports", icon: "chart", actions: ["view", "print"] },
    { key: "settings", name: "Settings (Printer)", icon: "printer", actions: ["view", "create", "edit", "delete", "print"] },
    { key: "users", name: "Users", icon: "users", actions: ["view", "create", "edit", "delete"] },
    { key: "roles", name: "Roles & Permissions", icon: "shield", actions: ["view", "create", "edit", "delete"] },
  ];

  function permSet(spec) {
    // spec: { module: "vcedp" letters }
    const out = {};
    MODULES.forEach((m) => {
      const letters = spec[m.key] || "";
      out[m.key] = {};
      ACTIONS.forEach((a) => { out[m.key][a] = m.actions.includes(a) && letters.includes(a[0]); });
    });
    return out;
  }

  /* ---------- seed data ---------- */
  function seed() {
    const now = new Date();
    const day = (n, h = 10, m = 0) => {
      const d = new Date(now);
      d.setDate(d.getDate() - n);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };

    const customers = [
      ["Anand Kumar", "9876543210", 24], ["Anitha", "9123456789", 21], ["Anbu", "9988776655", 18],
      ["Babu", "9988776600", 15], ["Deepa", "9090909090", 12], ["Lakshmi", "9444012345", 9],
      ["Priya", "9840054321", 6], ["Ramesh", "9789011223", 4], ["Suresh", "9940077881", 3],
      ["Karthik", "9841122334", 1],
    ].map(([name, mobile, ago], i) => ({ id: "c" + (i + 1), name, mobile, createdAt: day(ago, 11) }));

    const foods = [
      ["Idly", "Breakfast", 30, 120], ["Dosa", "Breakfast", 50, 80], ["Poori", "Breakfast", 45, 0],
      ["Pongal", "Breakfast", 50, 40], ["Vada", "Snacks", 15, 5], ["Samosa", "Snacks", 20, 30],
      ["Parotta", "Main Course", 40, 60], ["Fried Rice", "Main Course", 120, 8], ["Meals", "Main Course", 100, 35],
      ["Veg Biryani", "Main Course", 130, 25], ["Tea", "Beverages", 20, null], ["Coffee", "Beverages", 25, null],
      ["Fresh Lime", "Beverages", 30, null],
    ].map(([name, category, price, stock], i) => ({ id: "f" + (i + 1), name, category, price, stock, available: true }));

    const roles = [
      { id: "r-admin", name: "Admin", description: "Full access to every module, including users, roles and settings.", locked: true },
      { id: "r-manager", name: "Manager", description: "Manages billing, stock, customers and reports. No user management." },
      { id: "r-cashier", name: "Cashier", description: "Creates and prints bills, adds customers and views bills." },
      { id: "r-waiter", name: "Waiter", description: "Takes orders and creates bills. Cannot cancel bills or see reports." },
    ];
    const perms = {
      "r-admin": permSet({ dashboard: "v", billing: "vcp", bills: "vdp", customers: "vced", stock: "vced", reports: "vp", settings: "vcedp", users: "vced", roles: "vced" }),
      "r-manager": permSet({ dashboard: "v", billing: "vcp", bills: "vdp", customers: "vced", stock: "vced", reports: "vp", settings: "vcedp" }),
      "r-cashier": permSet({ dashboard: "v", billing: "vcp", bills: "vp", customers: "vce", stock: "v", settings: "vp" }),
      "r-waiter": permSet({ dashboard: "v", billing: "vc", bills: "v", customers: "vc" }),
    };

    const users = [
      ["Admin", "admin", "admin123", "9840000001", "r-admin", true],
      ["Ravi Kumar", "ravi", "1234", "9840000002", "r-manager", true],
      ["Meena S", "meena", "1234", "9840000003", "r-cashier", true],
      ["Karthik V", "karthik", "1234", "9840000004", "r-cashier", true],
      ["Selvam M", "selvam", "1234", "9840000005", "r-waiter", true],
      ["Prakash R", "prakash", "1234", "9840000006", "r-waiter", true],
      ["Divya N", "divya", "1234", "9840000007", "r-waiter", true],
      ["Gopal T", "gopal", "1234", "9840000008", "r-waiter", false],
    ].map(([name, username, password, mobile, roleId, active], i) => ({
      id: "u" + (i + 1), name, username, password, mobile, roleId, active, lastLogin: i < 7 ? day(i % 3, 9 + i) : day(15),
    }));

    // a week of sample bills (deterministic pseudo-random)
    let seedN = 20261005;
    const rnd = () => ((seedN = (seedN * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const sellable = foods.filter((f) => f.stock !== 0);
    const bills = [];
    let no = 0;
    for (let ago = 6; ago >= 0; ago--) {
      const dow = new Date(now.getTime() - ago * 864e5).getDay();
      const count = 12 + Math.floor(rnd() * 8) + (dow === 0 || dow === 6 ? 6 : 0);
      const times = Array.from({ length: count }, () => 7 * 60 + Math.floor(rnd() * (14.5 * 60))).sort((a, b) => a - b);
      times.forEach((mins) => {
        const at = new Date(day(ago, 0, 0));
        at.setMinutes(mins);
        if (at > now) return;
        const items = [];
        const n = 1 + Math.floor(rnd() * 4);
        for (let k = 0; k < n; k++) {
          const f = pick(sellable);
          const line = items.find((x) => x.foodId === f.id);
          const qty = 1 + Math.floor(rnd() * 3);
          if (line) line.qty += qty; else items.push({ foodId: f.id, name: f.name, price: f.price, qty });
        }
        const cust = rnd() < 0.7 ? pick(customers.filter((c) => new Date(c.createdAt) <= at)) : null;
        const pay = rnd();
        const bill = makeBill({
          no: ++no, items, customer: cust || null,
          payment: pay < 0.45 ? "Cash" : pay < 0.85 ? "UPI" : "Card",
          createdAt: at.toISOString(), createdBy: "u" + (1 + Math.floor(rnd() * 4)),
        });
        if (rnd() < 0.04) { bill.status = "cancelled"; bill.cancelReason = "Customer cancelled order"; }
        bills.push(bill);
      });
    }

    return {
      version: 2,
      customers, foods, roles, perms, users, bills,
      printers: [], // paired Bluetooth printers: { id, name, deviceId, paper, encoding, isDefault }
      settings: {
        autoPrint: false,
        restaurant: { name: "Spice Route", address: "12, Anna Salai, Chennai", phone: "044 2345 6789", footer: "Thank you! Visit again." },
      },
      counters: { bill: no },
    };
  }

  function makeBill({ no, items, customer, payment, createdAt, createdBy }) {
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    return {
      id: "b" + no,
      no: "B" + String(no).padStart(5, "0"),
      customerId: customer ? customer.id : null,
      customerName: customer ? customer.name : "Walk-in",
      mobile: customer ? customer.mobile : "",
      items: items.map((i) => ({ ...i })),
      total,
      payment, status: "paid", cancelReason: "",
      createdAt, createdBy,
    };
  }

  /* ---------- load / save ---------- */
  let db;
  try { db = JSON.parse(storage.get(DATA_KEY)); } catch (e) { db = null; }
  if (!db || db.version !== 2) { db = seed(); storage.set(DATA_KEY, JSON.stringify(db)); }

  function save() { storage.set(DATA_KEY, JSON.stringify(db)); }
  function resetData() { db = seed(); save(); }

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const money = (n, dec = 0) => "₹ " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const num = (n) => Number(n).toLocaleString("en-IN");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const pad = (n) => String(n).padStart(2, "0");
  const fmtDate = (d) => { d = new Date(d); return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const fmtTime = (d) => { d = new Date(d); const h = d.getHours() % 12 || 12; return `${h}:${pad(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`; };
  const fmtDateTime = (d) => `${fmtDate(d)}, ${fmtTime(d)}`;
  const isoDay = (d) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const sameDay = (a, b) => isoDay(a) === isoDay(b);
  const initials = (name) => String(name || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const fmtMobile = (m) => (m && m.length === 10 ? m.slice(0, 5) + " " + m.slice(5) : m || "—");
  const icon = (name, cls = "") => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const lastLoginText = (d) => {
    if (!d) return "Never";
    const diff = (Date.now() - new Date(d)) / 6e4;
    if (diff < 2) return "Just now";
    if (sameDay(d, new Date())) return "Today, " + fmtTime(d);
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (sameDay(d, y)) return "Yesterday, " + fmtTime(d);
    return fmtDate(d);
  };

  /* ---------- session & permissions ---------- */
  function currentUser() {
    const id = storage.get(SESSION_KEY);
    const u = id && db.users.find((x) => x.id === id);
    return u && u.active ? u : null;
  }
  function login(username, password) {
    const u = db.users.find((x) => x.username.toLowerCase() === String(username).trim().toLowerCase());
    if (!u || u.password !== password) return { error: "Wrong username or password." };
    if (!u.active) return { error: "This account is inactive. Please contact the admin." };
    u.lastLogin = new Date().toISOString();
    save();
    storage.set(SESSION_KEY, u.id);
    return { user: u };
  }
  function logout() { storage.remove(SESSION_KEY); }

  /* ---------- chosen view: "mobile" or "web" (asked before login) ---------- */
  function getView() {
    const v = storage.get(VIEW_KEY);
    return v === "mobile" || v === "web" ? v : null;
  }
  function setView(v) { storage.set(VIEW_KEY, v === "mobile" ? "mobile" : "web"); }
  function roleOf(user) { return db.roles.find((r) => r.id === (user && user.roleId)); }
  function can(module, action = "view", user = currentUser()) {
    if (!user) return false;
    const role = roleOf(user);
    if (role && role.locked) return true;
    const p = db.perms[user.roleId];
    return !!(p && p[module] && p[module][action]);
  }

  /* ---------- toasts ---------- */
  function toast(message, type = "success") {
    const box = $("#toasts");
    if (!box) return;
    const el = document.createElement("div");
    el.className = "toast " + type;
    const ic = type === "error" ? "alert" : type === "info" ? "bluetooth" : "check";
    el.innerHTML = `${icon(ic)}<span>${esc(message)}</span>`;
    box.appendChild(el);
    setTimeout(() => { el.classList.add("hide"); setTimeout(() => el.remove(), 300); }, 3200);
  }

  /* ---------- modals (CSS :target based, opened by hash) ---------- */
  function openModal(id) {
    if (location.hash === "#" + id) {
      // re-trigger :target when the same modal is opened again
      history.replaceState(null, "", "#close");
    }
    location.hash = id;
    setTimeout(() => {
      const first = $(`#${id} input:not([type=hidden]):not([disabled]), #${id} select, #${id} textarea`);
      if (first) first.focus();
    }, 60);
  }
  function closeModal() {
    if (location.hash && location.hash !== "#close") location.hash = "close";
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.querySelector(".modal:target")) closeModal();
  });

  let confirmHandler = null;
  function confirmDialog({ title, message, ok = "Delete", tone = "danger", iconName = "trash", extraHTML = "", onConfirm }) {
    $("#confirm-title").textContent = title;
    $("#confirm-msg").textContent = message;
    const ic = $("#confirm-icon");
    ic.className = "stat-icon " + tone;
    ic.innerHTML = icon(iconName);
    const okBtn = $("#confirm-ok");
    okBtn.textContent = ok;
    okBtn.className = "btn " + (tone === "danger" || tone === "warning" ? "btn-danger" : "btn-primary");
    const extra = $("#confirm-extra");
    extra.innerHTML = extraHTML;
    extra.hidden = !extraHTML;
    $("#confirm-cancel").hidden = false;
    confirmHandler = onConfirm;
    openModal("confirm");
  }
  // a single message with one OK button
  function noticeDialog({ title, message, ok = "OK", tone = "success", iconName = "check" }) {
    confirmDialog({ title, message, ok, tone, iconName, onConfirm: null });
    $("#confirm-ok").className = "btn btn-primary";
    $("#confirm-cancel").hidden = true;
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("#confirm-ok")) {
      const fn = confirmHandler;
      confirmHandler = null;
      closeModal();
      if (fn) fn($("#confirm-extra"));
    }
  });

  /* ---------- forms ---------- */
  function fieldError(input, message) {
    const group = input.closest(".form-group") || input.parentElement;
    input.classList.toggle("is-invalid", !!message);
    let msg = group.querySelector(".form-error");
    if (message) {
      if (!msg) { msg = document.createElement("p"); msg.className = "form-error"; group.appendChild(msg); }
      msg.textContent = message;
    } else if (msg) msg.remove();
    return !message;
  }
  function clearErrors(form) {
    $$(".is-invalid", form).forEach((el) => el.classList.remove("is-invalid"));
    $$(".form-error", form).forEach((el) => el.remove());
  }
  const validMobile = (m) => /^[6-9]\d{9}$/.test(m);

  /* ---------- tables ---------- */
  function labelRows(table) {
    const names = $$("thead th", table).map((th) => th.textContent.trim());
    $$("tbody tr, tfoot tr", table).forEach((tr) => {
      Array.from(tr.children).forEach((cell, i) => cell.setAttribute("data-label", names[i] || ""));
    });
  }
  function renderRows(tbody, rowsHTML, emptyText, cols) {
    tbody.innerHTML = rowsHTML.length
      ? rowsHTML.join("")
      : `<tr class="empty-row"><td colspan="${cols}"><div class="empty">${icon("search")}<span>${esc(emptyText)}</span></div></td></tr>`;
    labelRows(tbody.closest("table"));
  }
  function paginate(list, page, perPage) {
    const pages = Math.max(1, Math.ceil(list.length / perPage));
    const p = Math.min(Math.max(1, page), pages);
    return { page: p, pages, items: list.slice((p - 1) * perPage, p * perPage), from: list.length ? (p - 1) * perPage + 1 : 0, to: Math.min(p * perPage, list.length) };
  }
  function renderPager(nav, page, pages, onGo) {
    if (!nav) return;
    const btn = (label, target, extra = "") =>
      `<button type="button" data-go="${target}" ${extra}>${label}</button>`;
    let html = btn("&lsaquo;", page - 1, `aria-label="Previous page" ${page <= 1 ? "disabled" : ""}`);
    const start = Math.max(1, Math.min(page - 1, pages - 2));
    for (let i = start; i <= Math.min(pages, start + 2); i++) {
      html += btn(i, i, i === page ? 'class="active" aria-current="page"' : "");
    }
    html += btn("&rsaquo;", page + 1, `aria-label="Next page" ${page >= pages ? "disabled" : ""}`);
    nav.innerHTML = html;
    nav.onclick = (e) => {
      const b = e.target.closest("button[data-go]");
      if (b && !b.disabled) onGo(Number(b.dataset.go));
    };
  }

  /* ---------- smart table: search + sort + pagination ----------
     Headers marked <th data-sort="key"> become sort buttons.
     opts: tbody, data() -> rows, filter(row) -> bool, sorters { key: row -> value },
           sort { key, dir }, perPage (number or function), render(row) -> "<tr>",
           empty(isFiltered) -> text, info el, pager el, onRender(list) */
  function createTable(opts) {
    const table = opts.tbody.closest("table");
    const cols = $$("thead th", table).length;
    const state = { page: 1, key: opts.sort ? opts.sort.key : null, dir: opts.sort ? opts.sort.dir : "asc" };
    const heads = $$("thead th[data-sort]", table);

    heads.forEach((th) => {
      const label = th.textContent.trim();
      th.innerHTML = `<button type="button" class="th-sort">${esc(label)}<span class="sort-ic" aria-hidden="true"></span></button>`;
      th.querySelector("button").addEventListener("click", () => {
        const key = th.dataset.sort;
        if (state.key === key) state.dir = state.dir === "asc" ? "desc" : "asc";
        else { state.key = key; state.dir = th.dataset.sortFirst || "asc"; }
        state.page = 1;
        refresh();
      });
    });

    // phones/tablets: headings are hidden when rows become cards, so offer a "Sort by" dropdown
    let mobileSel = null;
    if (heads.length) {
      const words = { text: ["A to Z", "Z to A"], num: ["low to high", "high to low"], date: ["oldest first", "newest first"] };
      const opt = (th) => {
        const type = th.dataset.type || (th.classList.contains("num") ? "num" : "text");
        const label = th.textContent.trim();
        return ["asc", "desc"].map((dir, i) => `<option value="${th.dataset.sort}:${dir}">${esc(label)} (${words[type][i]})</option>`).join("");
      };
      const box = document.createElement("div");
      box.className = "mobile-sort";
      const id = "sort-" + Math.random().toString(36).slice(2, 7);
      box.innerHTML = `<label class="form-label" for="${id}">Sort by</label><select class="form-control" id="${id}">${heads.map(opt).join("")}</select>`;
      (table.closest(".table-wrap") || table).before(box);
      mobileSel = box.querySelector("select");
      mobileSel.addEventListener("change", () => {
        const [key, dir] = mobileSel.value.split(":");
        state.key = key; state.dir = dir; state.page = 1;
        refresh();
      });
    }

    const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    function compare(a, b) {
      if (a === b) return 0;
      if (a === null || a === undefined || a === "") return 1;   // blanks always last
      if (b === null || b === undefined || b === "") return -1;
      if (typeof a === "number" && typeof b === "number") return a - b;
      return collator.compare(String(a), String(b));
    }

    function refresh(resetPage) {
      if (resetPage) state.page = 1;
      let list = opts.data().filter((row) => !opts.filter || opts.filter(row));
      if (state.key && opts.sorters[state.key]) {
        const get = opts.sorters[state.key];
        const sign = state.dir === "asc" ? 1 : -1;
        list = list.map((row, i) => ({ row, i, v: get(row) }))
          .sort((x, y) => {
            const c = compare(x.v, y.v);
            if (x.v === null || x.v === undefined || x.v === "" || y.v === null || y.v === undefined || y.v === "") return c || x.i - y.i;
            return c * sign || x.i - y.i;
          })
          .map((x) => x.row);
      }
      const per = typeof opts.perPage === "function" ? opts.perPage() : opts.perPage;
      const pg = paginate(list, state.page, per || 10);
      state.page = pg.page;

      renderRows(opts.tbody, pg.items.map(opts.render), opts.empty ? opts.empty(list.length !== opts.data().length) : "Nothing to show.", cols);
      heads.forEach((th) => {
        const active = th.dataset.sort === state.key;
        th.classList.toggle("sorted", active);
        if (active) th.setAttribute("aria-sort", state.dir === "asc" ? "ascending" : "descending");
        else th.removeAttribute("aria-sort");
      });
      if (mobileSel && state.key) mobileSel.value = `${state.key}:${state.dir}`;
      if (opts.info) {
        const noun = opts.noun || "rows";
        opts.info.textContent = list.length ? `Showing ${pg.from}–${pg.to} of ${list.length} ${noun}` : `0 ${noun}`;
      }
      renderPager(opts.pager, pg.page, pg.pages, (p) => { state.page = p; refresh(); });
      if (opts.onRender) opts.onRender(list, pg);
      return list;
    }

    return { refresh, state };
  }

  /* ---------- receipts & printing ---------- */
  function receiptHTML(bill) {
    const r = db.settings.restaurant;
    const lines = bill.items.map((i) =>
      `<div class="line"><span>${esc(i.name)} x${i.qty}</span><span>${(i.price * i.qty).toFixed(2)}</span></div>`).join("");
    return `<div class="receipt">
      <div class="center"><h4>${esc(r.name)}</h4><div>${esc(r.address)}</div>${r.phone ? `<div>Ph: ${esc(r.phone)}</div>` : ""}</div>
      <hr>
      <div class="line"><span>Bill: #${esc(bill.no)}</span><span>${isoDay(bill.createdAt).split("-").reverse().join("-")}</span></div>
      <div class="line"><span>Customer: ${esc(bill.customerName)}</span><span>${fmtTime(bill.createdAt)}</span></div>
      ${bill.status === "cancelled" ? '<div class="center" style="font-weight:700;margin-top:6px">*** CANCELLED ***</div>' : ""}
      <hr>${lines}<hr>
      <div class="line"><span>Items</span><span>${bill.items.reduce((s, i) => s + i.qty, 0)}</span></div>
      <div class="line total"><span>TOTAL</span><span>₹${bill.total.toFixed(2)}</span></div>
      <hr>
      <div class="center">Paid by ${esc(bill.payment)}<br>${esc(r.footer)}</div>
    </div>`;
  }
  function printHTML(html) {
    const area = $("#print-area");
    area.innerHTML = html;
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => { window.print(); setTimeout(done, 500); }, 50);
  }
  /* ---------- Bluetooth thermal printer (Web Bluetooth + ESC/POS) ----------
     Works in Chrome / Edge on Windows, macOS, ChromeOS and Android.
     The browser shows its own device list; a page keeps the connection until it is closed or reloaded. */
  const PRINTER_SERVICES = [
    "000018f0-0000-1000-8000-00805f9b34fb", // most generic BLE thermal printers
    "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
    "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC / Microchip
    "0000ff00-0000-1000-8000-00805f9b34fb",
    "0000ffe0-0000-1000-8000-00805f9b34fb",
    "0000fee7-0000-1000-8000-00805f9b34fb",
    "0000ae30-0000-1000-8000-00805f9b34fb",
  ];
  const bt = { device: null, char: null };
  const btSupported = () => !!(navigator.bluetooth && window.isSecureContext);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const printerStatusChanged = () => document.dispatchEvent(new CustomEvent("printer-status"));

  function defaultPrinter() { return db.printers.find((p) => p.isDefault) || db.printers[0] || null; }
  function printerConnected(printer) {
    return !!(bt.char && bt.device && bt.device.gatt.connected && (!printer || bt.device.id === printer.deviceId));
  }

  // opens the browser's Bluetooth device list (must be called from a click)
  function choosePrinterDevice() {
    return navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
  }
  async function connectDevice(device) {
    const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
    let found = null;
    for (const service of await server.getPrimaryServices()) {
      let chars = [];
      try { chars = await service.getCharacteristics(); } catch (e) { /* skip */ }
      found = chars.find((c) => c.properties.writeWithoutResponse || c.properties.write);
      if (found) break;
    }
    if (!found) { device.gatt.disconnect(); throw new Error("NOT_PRINTER"); }
    if (bt.device && bt.device !== device && bt.device.gatt.connected) bt.device.gatt.disconnect();
    bt.device = device;
    bt.char = found;
    device.addEventListener("gattserverdisconnected", () => {
      if (bt.device === device) { bt.char = null; printerStatusChanged(); }
    }, { once: true });
    printerStatusChanged();
    return device;
  }
  function disconnectPrinter() {
    if (bt.device && bt.device.gatt.connected) bt.device.gatt.disconnect();
    bt.char = null;
    printerStatusChanged();
  }
  // saves (or updates) a paired device as a printer
  function rememberDevice(device, extra = {}) {
    let p = db.printers.find((x) => x.deviceId === device.id);
    if (!p) {
      p = { id: uid("p"), name: device.name || "Bluetooth Printer", deviceId: device.id, paper: "58mm", encoding: "CP437", isDefault: !db.printers.length };
      db.printers.push(p);
    }
    Object.assign(p, extra);
    if (p.isDefault) db.printers.forEach((x) => { x.isDefault = x === p; });
    save();
    return p;
  }
  // makes sure the default printer is connected on this page
  async function ensurePrinter() {
    const printer = defaultPrinter();
    if (!btSupported()) throw new Error("UNSUPPORTED");
    if (!printer) throw new Error("NO_PRINTER");
    if (printerConnected(printer)) return printer;
    const device = await choosePrinterDevice();
    await connectDevice(device);
    return db.printers.find((p) => p.deviceId === device.id) || rememberDevice(device);
  }
  async function writeBytes(bytes) {
    const CHUNK = 100;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const part = bytes.slice(i, i + CHUNK);
      if (bt.char.properties.writeWithoutResponse) await bt.char.writeValueWithoutResponse(part);
      else await bt.char.writeValue(part);
      await sleep(25);
    }
  }

  /* ESC/POS receipt text (thermal printers can't show the rupee sign, so it prints "Rs.") */
  function escpos(printer) {
    const width = printer && printer.paper === "80mm" ? 48 : 32;
    const out = [];
    const ascii = (t) => String(t).replace(/₹/g, "Rs.").replace(/[–—]/g, "-").replace(/[^\x20-\x7E\n]/g, "?");
    const api = {
      width,
      raw: (...b) => { out.push(...b); return api; },
      text: (t) => { for (const ch of ascii(t)) out.push(ch.charCodeAt(0)); return api; },
      line: (t = "") => api.text(t + "\n"),
      center: (on = true) => api.raw(0x1b, 0x61, on ? 1 : 0),
      bold: (on = true) => api.raw(0x1b, 0x45, on ? 1 : 0),
      big: (on = true) => api.raw(0x1d, 0x21, on ? 0x11 : 0x00),
      rule: () => api.line("-".repeat(width)),
      cols: (left, right) => {
        left = ascii(left);
        right = ascii(right);
        const room = width - right.length - 1;
        const l = left.length > room ? left.slice(0, room) : left;
        return api.line(l + " ".repeat(Math.max(1, width - l.length - right.length)) + right);
      },
      feed: (n = 3) => api.raw(0x1b, 0x64, n),
      cut: () => api.raw(0x1d, 0x56, 0x42, 0x00),
      bytes: () => new Uint8Array(out),
    };
    api.raw(0x1b, 0x40); // initialise
    const codePage = { CP437: 0, "ISO-8859-1": 16 }[(printer && printer.encoding) || "CP437"];
    if (codePage !== undefined) api.raw(0x1b, 0x74, codePage);
    return api;
  }
  function billBytes(bill, printer) {
    const r = db.settings.restaurant;
    const p = escpos(printer);
    p.center().bold().big().line(r.name).big(false).bold(false);
    if (r.address) p.line(r.address);
    if (r.phone) p.line("Ph: " + r.phone);
    p.center(false).rule();
    p.cols("Bill: #" + bill.no, isoDay(bill.createdAt).split("-").reverse().join("-"));
    p.cols("Customer: " + bill.customerName, fmtTime(bill.createdAt));
    if (bill.status === "cancelled") p.center().bold().line("*** CANCELLED ***").bold(false).center(false);
    p.rule();
    bill.items.forEach((i) => p.cols(`${i.name} x${i.qty}`, (i.price * i.qty).toFixed(2)));
    p.rule().bold().cols("TOTAL", "Rs." + bill.total.toFixed(2)).bold(false).rule();
    p.center().line("Paid by " + bill.payment);
    if (r.footer) p.line(r.footer);
    return p.feed(4).cut().bytes();
  }
  function testBytes(printer) {
    const p = escpos(printer);
    p.center().bold().big().line(db.settings.restaurant.name).big(false).line("*** TEST PRINT ***").bold(false).center(false).rule();
    p.cols("Printer", printer.name).cols("Paper", printer.paper).cols("Encoding", printer.encoding).rule();
    p.center().line("If you can read this,").line("printing works.");
    return p.feed(4).cut().bytes();
  }

  function printProblem(e, fallbackHTML) {
    const offerBrowser = (title, message) => confirmDialog({
      title, message, ok: "Print with browser", tone: "warning", iconName: "printer",
      onConfirm: () => printHTML(fallbackHTML),
    });
    if (e && e.name === "NotFoundError") toast("No printer was selected.", "error"); // device list was closed
    else if (e && e.message === "UNSUPPORTED") offerBrowser("Bluetooth printing not available", "This browser can't connect to Bluetooth printers. Use Google Chrome or Microsoft Edge on a computer or Android phone. Print with the normal print window instead?");
    else if (e && e.message === "NO_PRINTER") offerBrowser("No printer paired", "Pair your Bluetooth printer in Settings first. Print with the normal print window for now?");
    else if (e && e.message === "NOT_PRINTER") toast("That device doesn't accept print data. Choose your thermal printer.", "error");
    else toast("Couldn't print. Check the printer is on, has paper and is close by.", "error");
  }

  async function printBill(bill) {
    if (!can("billing", "print") && !can("bills", "print")) { toast("You don't have permission to print bills.", "error"); return false; }
    try {
      const printer = await ensurePrinter();
      toast(`Printing bill #${bill.no} on ${printer.name}...`, "info");
      await writeBytes(billBytes(bill, printer));
      toast(`Bill #${bill.no} printed`);
      return true;
    } catch (e) {
      printProblem(e, receiptHTML(bill));
      return false;
    }
  }
  async function testPrint() {
    try {
      const printer = await ensurePrinter();
      await writeBytes(testBytes(printer));
      toast(`Test page printed on ${printer.name}`);
    } catch (e) {
      printProblem(e, `<div class="receipt"><div class="center"><h4>${esc(db.settings.restaurant.name)}</h4>*** TEST PRINT ***</div></div>`);
    }
  }

  function downloadCSV(filename, rows) {
    const csv = rows.map((r) => r.map((c) => {
      const s = String(c ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- bills ---------- */
  function createBill({ items, customer, payment }) {
    db.counters.bill += 1;
    const bill = makeBill({
      no: db.counters.bill, items, customer, payment,
      createdAt: new Date().toISOString(), createdBy: (currentUser() || {}).id,
    });
    db.bills.push(bill);
    bill.items.forEach((i) => {
      const f = db.foods.find((x) => x.id === i.foodId);
      if (f && f.stock !== null) f.stock = Math.max(0, f.stock - i.qty);
    });
    save();
    return bill;
  }
  function cancelBill(bill, reason) {
    if (bill.status === "cancelled") return;
    bill.status = "cancelled";
    bill.cancelReason = reason;
    bill.items.forEach((i) => {
      const f = db.foods.find((x) => x.id === i.foodId);
      if (f && f.stock !== null) f.stock += i.qty;
    });
    save();
  }
  function nextBillNo() { return "B" + String(db.counters.bill + 1).padStart(5, "0"); }
  function foodStatus(f) {
    if (!f.available) return { key: "off", label: "Not for sale", cls: "neutral" };
    if (f.stock === 0) return { key: "out", label: "Out of stock", cls: "danger" };
    if (f.stock !== null && f.stock <= LOW_STOCK) return { key: "low", label: "Low stock", cls: "warning" };
    return { key: "ok", label: "Available", cls: "success" };
  }

  /* ---------- page shell ---------- */
  const root = document.body.dataset.root || "";
  const page = document.body.dataset.page || "";

  function goHome() {
    const first = MODULES.find((m) => can(m.key));
    location.href = root + (getView() || "web") + "/" + (first ? first.key : "dashboard") + ".html";
  }

  function initShell() {
    // opening a mobile/ or web/ page makes that the remembered view
    if (document.body.dataset.view) setView(document.body.dataset.view);
    const user = currentUser();
    if (!user) { location.replace(root + "login.html"); return false; }
    const role = roleOf(user);

    if ($("#user-name")) {
      $("#user-name").textContent = user.name;
      $("#user-role").textContent = role ? role.name : "";
      $("#user-avatar").textContent = initials(user.name);
    }
    // menu: hide modules this role can't open
    $$("[data-module]").forEach((el) => { el.hidden = !can(el.dataset.module); });
    $$("[data-module-any]").forEach((el) => { el.hidden = !el.dataset.moduleAny.split(",").some((m) => can(m)); });
    // buttons that need a permission: data-perm="module:action"
    $$("[data-perm]").forEach((el) => {
      const [m, a] = el.dataset.perm.split(":");
      if (!can(m, a)) el.hidden = true;
    });
    $$("[data-logout]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      logout();
      location.href = root + "login.html";
    }));
    // "switch to web/mobile view" links keep the same page
    $$("[data-switch-view]").forEach((a) => a.addEventListener("click", () => setView(a.dataset.switchView)));

    // topbar search: filters this page's list if it has one, otherwise searches bills
    const gs = $("#global-search");
    if (gs) {
      gs.addEventListener("submit", (e) => {
        const q = gs.q.value.trim();
        const local = $("[data-search]");
        if (local) {
          e.preventDefault();
          local.value = q;
          local.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (!can("bills")) {
          e.preventDefault();
        }
      });
    }

    if (MODULES.some((m) => m.key === page) && !can(page)) {
      toast("You don't have access to that page.", "error");
      goHome();
      return false;
    }
    return true;
  }

  window.SR = {
    get db() { return db; }, save, resetData,
    MODULES, ACTIONS, LOW_STOCK,
    $, $$, esc, uid, money, num, fmtDate, fmtTime, fmtDateTime, isoDay, sameDay, initials, fmtMobile, icon,
    lastLoginText, DAYS, MONTHS,
    currentUser, login, logout, roleOf, can, goHome, initShell, getView, setView,
    toast, openModal, closeModal, confirmDialog, noticeDialog, fieldError, clearErrors, validMobile,
    labelRows, renderRows, paginate, renderPager, createTable,
    receiptHTML, printHTML, printBill, testPrint, downloadCSV,
    btSupported, defaultPrinter, printerConnected, choosePrinterDevice, connectDevice, disconnectPrinter, rememberDevice,
    createBill, cancelBill, nextBillNo, foodStatus,
    query: new URLSearchParams(location.search),
  };
})();
