/* Dashboard: today's numbers from the stored bills */
(function () {
  "use strict";
  if (!SR.initShell()) return;
  const { db, $, esc, money, num, fmtDate, fmtTime, sameDay, can, currentUser, createTable } = SR;

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const h = now.getHours();
  $("#greeting").textContent = `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, ${currentUser().name.split(" ")[0]}`;
  $("#today").textContent = fmtDate(now);

  const paidOn = (d) => db.bills.filter((b) => b.status === "paid" && sameDay(b.createdAt, d));
  const today = paidOn(now);
  // compare with yesterday up to the same time of day
  const prev = paidOn(yesterday).filter((b) => new Date(b.createdAt) <= new Date(yesterday));

  const sum = (list, fn) => list.reduce((s, b) => s + fn(b), 0);
  const sales = (list) => sum(list, (b) => b.total);
  const items = (list) => sum(list, (b) => b.items.reduce((s, i) => s + i.qty, 0));

  function trend(el, cur, before, isPercent) {
    if (!before) { el.innerHTML = "&nbsp;"; return; }
    const diff = cur - before;
    const sign = diff >= 0 ? "+" : "−";
    const text = isPercent ? `${sign}${Math.abs((diff / before) * 100).toFixed(1)}%` : `${sign}${num(Math.abs(diff))}`;
    el.innerHTML = `<b>${text}</b> vs this time yesterday`;
  }

  $("#st-sales").textContent = money(sales(today));
  trend($("#st-sales-trend"), sales(today), sales(prev), true);
  $("#st-bills").textContent = num(today.length);
  trend($("#st-bills-trend"), today.length, prev.length);
  $("#st-customers").textContent = num(db.customers.length);
  const newToday = db.customers.filter((c) => sameDay(c.createdAt, now)).length;
  $("#st-customers-trend").innerHTML = `<b>+${newToday}</b> new today`;
  $("#st-items").textContent = num(items(today));
  trend($("#st-items-trend"), items(today), items(prev), true);

  // today's bills (any status): search + sort + pages
  const canOpenBills = can("bills");
  const dSearch = $("#d-search");
  const todayTable = createTable({
    tbody: $("#recent-bills"),
    data: () => db.bills.filter((b) => sameDay(b.createdAt, now)),
    filter: (b) => {
      const q = dSearch.value.trim().toLowerCase().replace(/^#/, "");
      return !q || b.no.toLowerCase().includes(q) || b.customerName.toLowerCase().includes(q) || b.mobile.includes(q);
    },
    sorters: {
      no: (b) => b.no, customer: (b) => b.customerName, amount: (b) => b.total,
      time: (b) => new Date(b.createdAt).getTime(), status: (b) => b.status,
    },
    sort: { key: "time", dir: "desc" },
    perPage: 5,
    info: $("#d-page-info"),
    pager: $("#d-pager"),
    noun: "bills",
    render: (b) => `<tr>
      <td class="fw-600">#${esc(b.no)}</td>
      <td>${esc(b.customerName)}</td>
      <td class="num">${money(b.total)}</td>
      <td class="muted">${fmtTime(b.createdAt)}</td>
      <td>${b.status === "paid" ? '<span class="badge success">Paid</span>' : '<span class="badge danger">Cancelled</span>'}</td>
      <td>${canOpenBills ? `<a href="bills.html?view=${encodeURIComponent(b.id)}" class="btn btn-soft btn-sm">View</a>` : "—"}</td>
    </tr>`,
    empty: (filtered) => filtered ? "No bills today match your search." : "No bills yet today. Create the first one from Billing.",
  });
  dSearch.addEventListener("input", () => todayTable.refresh(true));
  todayTable.refresh();

  // top selling today
  const counts = {};
  today.forEach((b) => b.items.forEach((i) => { counts[i.name] = (counts[i.name] || 0) + i.qty; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = top.length ? top[0][1] : 1;
  $("#top-items").innerHTML = top.length
    ? top.map(([name, qty], i) => `<li>
        <span class="rank-no">${i + 1}</span>
        <span class="name">${esc(name)}</span>
        <span class="qty">${num(qty)} <small>sold</small></span>
        <div class="progress"><span style="width:${Math.round((qty / max) * 100)}%"></span></div>
      </li>`).join("")
    : `<li style="display:block"><div class="empty">${SR.icon("bag")}<span>No items sold yet today.</span></div></li>`;
})();
