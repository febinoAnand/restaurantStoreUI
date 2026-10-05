/* Reports: sales for a date range, chart, top items, daily table, export */
(function () {
  "use strict";
  if (!SR.initShell()) return;
  const { db, $, esc, money, num, fmtDate, isoDay, DAYS, labelRows, toast, fieldError, clearErrors, downloadCSV, createTable,
    openModal, closeModal, noticeDialog } = SR;

  const MAX_DAYS = 92;
  let printing = false;
  const from = $("#r-from");
  const to = $("#r-to");
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);
  from.value = isoDay(weekAgo);
  to.value = isoDay(today);
  from.max = to.max = isoDay(today);

  let report = null;

  function build(start, end) {
    const days = [];
    for (let d = new Date(start + "T00:00:00"); isoDay(d) <= end; d.setDate(d.getDate() + 1)) {
      days.push({ key: isoDay(d), date: new Date(d), bills: 0, items: 0, Cash: 0, UPI: 0, Card: 0, cancelled: 0, total: 0 });
    }
    const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
    const itemCounts = {};
    const customers = new Set();
    db.bills.forEach((b) => {
      const day = byKey[isoDay(b.createdAt)];
      if (!day) return;
      if (b.status === "cancelled") { day.cancelled += 1; return; }
      day.bills += 1;
      day.total += b.total;
      day[b.payment] += b.total;
      b.items.forEach((i) => { day.items += i.qty; itemCounts[i.name] = (itemCounts[i.name] || 0) + i.qty; });
      if (b.customerId) customers.add(b.customerId);
    });
    const sum = (k) => days.reduce((s, d) => s + d[k], 0);
    const totals = { bills: sum("bills"), items: sum("items"), Cash: sum("Cash"), UPI: sum("UPI"), Card: sum("Card"), cancelled: sum("cancelled"), total: sum("total") };
    const top = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { start, end, days, totals, top, customers: customers.size };
  }

  function niceMax(v) {
    if (v <= 0) return 1000;
    const step = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= v) return m * step;
    return 10 * step;
  }
  const short = (v) => (v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0).replace(/\.0$/, "") + "K" : String(v));

  function render() {
    const r = report;
    const t = r.totals;
    $("#range-label").textContent = `${fmtDate(r.start)} – ${fmtDate(r.end)}`;
    $("#r-sales").textContent = money(t.total);
    $("#r-sales-note").innerHTML = `<b>${money(t.Cash)}</b> cash · <b>${money(t.UPI + t.Card)}</b> UPI/card`;
    $("#r-bills").textContent = num(t.bills);
    $("#r-cancelled").textContent = `${t.cancelled} cancelled`;
    $("#r-customers").textContent = num(r.customers);
    $("#r-avg").textContent = money(t.bills ? Math.round(t.total / t.bills) : 0);

    // chart
    const peak = Math.max(0, ...r.days.map((d) => d.total));
    const max = niceMax(peak);
    $("#chart-y").innerHTML = [0, 0.25, 0.5, 0.75, 1].map((f) => `<span>${short(Math.round(max * f))}</span>`).join("");
    const long = r.days.length > 10;
    $("#chart-plot").innerHTML = r.days.map((d) => {
      const label = long ? String(d.date.getDate()) : DAYS[d.date.getDay()];
      return `<div class="bar${d.total === peak && peak > 0 ? " peak" : ""}" style="--h:${((d.total / max) * 100).toFixed(2)}%"
        data-day="${label}" data-value="${fmtDate(d.date).slice(0, 6)}: ₹${num(d.total)}" title="${fmtDate(d.date)}: ₹${num(d.total)}"></div>`;
    }).join("");

    // top items
    const topMax = r.top.length ? r.top[0][1] : 1;
    $("#r-top").innerHTML = r.top.length
      ? r.top.map(([name, qty], i) => `<li><span class="rank-no">${i + 1}</span><span class="name">${esc(name)}</span>
          <span class="qty">${num(qty)} <small>sold</small></span>
          <div class="progress"><span style="width:${Math.round((qty / topMax) * 100)}%"></span></div></li>`).join("")
      : `<li style="display:block"><div class="empty">${SR.icon("bag")}<span>No sales in this period.</span></div></li>`;

    renderTable();
  }

  // daily table: search + sort + pages; the Total row always covers the whole range
  const rSearch = $("#r-search");
  const dayLabel = (d) => `${fmtDate(d.date)}, ${DAYS[d.date.getDay()]}`;
  const daysTable = createTable({
    tbody: $("#r-rows"),
    data: () => (report ? report.days : []),
    filter: (d) => {
      const q = rSearch.value.trim().toLowerCase();
      return !q || dayLabel(d).toLowerCase().includes(q) || d.key.includes(q);
    },
    sorters: {
      date: (d) => d.key, bills: (d) => d.bills, items: (d) => d.items, cash: (d) => d.Cash, upi: (d) => d.UPI,
      card: (d) => d.Card, cancelled: (d) => d.cancelled, total: (d) => d.total,
    },
    sort: { key: "date", dir: "desc" },
    perPage: () => (printing ? Math.max(1, report ? report.days.length : 1) : 10),
    info: $("#r-page-info"),
    pager: $("#r-pager"),
    noun: "days",
    render: (d) => `<tr>
        <td>${dayLabel(d)}</td>
        <td class="num">${num(d.bills)}</td><td class="num">${num(d.items)}</td>
        <td class="num">${money(d.Cash)}</td><td class="num">${money(d.UPI)}</td><td class="num">${money(d.Card)}</td>
        <td class="num">${d.cancelled}</td><td class="num fw-600">${money(d.total)}</td>
      </tr>`,
    empty: (filtered) => filtered ? "No days match your search." : "No days in this range.",
    onRender: () => {
      const t = report.totals;
      $("#r-foot").innerHTML = `<tr><th>Total</th><th class="num">${num(t.bills)}</th><th class="num">${num(t.items)}</th>
        <th class="num">${money(t.Cash)}</th><th class="num">${money(t.UPI)}</th><th class="num">${money(t.Card)}</th>
        <th class="num">${t.cancelled}</th><th class="num">${money(t.total)}</th></tr>`;
      labelRows($("#r-rows").closest("table"));
    },
  });
  const renderTable = (reset) => daysTable.refresh(reset);
  rSearch.addEventListener("input", () => renderTable(true));

  function generate(showToast) {
    clearErrors($("#report-form"));
    const a = from.value, b = to.value;
    let ok = fieldError(from, a ? "" : "Pick a start date");
    ok = fieldError(to, !b ? "Pick an end date" : a && b < a ? "End date is before the start date" : "") && ok;
    if (!ok) return;
    const span = (new Date(b) - new Date(a)) / 864e5 + 1;
    if (span > MAX_DAYS) { fieldError(to, `Pick a range of ${MAX_DAYS} days or less`); return; }
    report = build(a, b);
    renderTable(true);
    render();
    if (showToast) toast(`Report generated for ${span} day${span === 1 ? "" : "s"}`);
  }

  $("#report-form").addEventListener("submit", (e) => { e.preventDefault(); generate(true); });

  /* ---------- export: ask for dates, create the file, then one message ---------- */
  let exportType = "pdf";
  const exFrom = $("#ex-from");
  const exTo = $("#ex-to");
  exFrom.max = exTo.max = isoDay(today);

  function openExport(type) {
    exportType = type;
    clearErrors($("#export-form"));
    $("#ex-title").textContent = type === "pdf" ? "Export PDF" : "Export Excel";
    $("#ex-hint").textContent = `Choose the dates to include in the ${type === "pdf" ? "PDF" : "Excel"} file.`;
    exFrom.value = from.value;
    exTo.value = to.value;
    openModal("export-modal");
  }
  $("#export-pdf").addEventListener("click", () => openExport("pdf"));
  $("#export-excel").addEventListener("click", () => openExport("excel"));

  $("#export-form").addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(e.target);
    const a = exFrom.value, b = exTo.value;
    let ok = fieldError(exFrom, a ? "" : "Pick a start date");
    ok = fieldError(exTo, !b ? "Pick an end date" : a && b < a ? "End date is before the start date" : "") && ok;
    if (!ok) return;
    const span = (new Date(b) - new Date(a)) / 864e5 + 1;
    if (span > MAX_DAYS) { fieldError(exTo, `Pick a range of ${MAX_DAYS} days or less`); return; }

    const data = build(a, b);
    const name = `sales-report_${a}_to_${b}.${exportType === "pdf" ? "pdf" : "csv"}`;
    if (exportType === "pdf") downloadBlob(name, makePDF(reportLines(data)), "application/pdf");
    else downloadCSV(name, csvRows(data));
    closeModal();
    setTimeout(() => noticeDialog({
      title: exportType === "pdf" ? "PDF exported" : "Excel exported",
      message: `Sales report for ${fmtDate(a)} – ${fmtDate(b)} was saved as ${name}.`,
      iconName: "download",
    }), 80);
  });

  function csvRows(r) {
    const t = r.totals;
    return [
      [`Sales Report ${fmtDate(r.start)} - ${fmtDate(r.end)}`],
      [],
      ["Date", "Day", "Bills", "Items Sold", "Cash", "UPI", "Card", "Cancelled", "Total Sales"],
      ...r.days.map((d) => [d.key, DAYS[d.date.getDay()], d.bills, d.items, d.Cash, d.UPI, d.Card, d.cancelled, d.total]),
      ["Total", "", t.bills, t.items, t.Cash, t.UPI, t.Card, t.cancelled, t.total],
      [],
      ["Top Selling Items"],
      ["Item", "Qty Sold"],
      ...r.top,
    ];
  }

  // report as lines of text: [style, text]  (style: "h1" | "h2" | "b" | "t")
  function reportLines(r) {
    const t = r.totals;
    const rs = (n) => "Rs. " + num(n);
    const pad = (v, w, right) => { v = String(v); v = v.length > w ? v.slice(0, w) : v; return right ? v.padStart(w) : v.padEnd(w); };
    const row = (c) => pad(c[0], 18) + pad(c[1], 7, 1) + pad(c[2], 8, 1) + pad(c[3], 12, 1) + pad(c[4], 12, 1) + pad(c[5], 12, 1) + pad(c[6], 7, 1) + pad(c[7], 14, 1);
    const L = [];
    L.push(["h1", db.settings.restaurant.name]);
    L.push(["h2", `Sales Report: ${fmtDate(r.start)} - ${fmtDate(r.end)}`]);
    L.push(["t", `Generated on ${fmtDate(new Date())}`]);
    L.push(["t", ""]);
    L.push(["b", "Summary"]);
    L.push(["t", `Total sales      ${rs(t.total)}`]);
    L.push(["t", `Paid bills       ${num(t.bills)}   (cancelled: ${t.cancelled})`]);
    L.push(["t", `Customers        ${num(r.customers)}`]);
    L.push(["t", `Avg. bill        ${rs(t.bills ? Math.round(t.total / t.bills) : 0)}`]);
    L.push(["t", `Cash ${rs(t.Cash)}   UPI ${rs(t.UPI)}   Card ${rs(t.Card)}`]);
    L.push(["t", ""]);
    L.push(["b", "Daily Breakdown"]);
    L.push(["b", row(["Date", "Bills", "Items", "Cash", "UPI", "Card", "Canc.", "Total"])]);
    [...r.days].reverse().forEach((d) => L.push(["t", row([`${fmtDate(d.date)} ${DAYS[d.date.getDay()]}`, d.bills, d.items, num(d.Cash), num(d.UPI), num(d.Card), d.cancelled, num(d.total)])]));
    L.push(["b", row(["Total", t.bills, t.items, num(t.Cash), num(t.UPI), num(t.Card), t.cancelled, num(t.total)])]);
    L.push(["t", ""]);
    L.push(["b", "Top Selling Items"]);
    if (r.top.length) r.top.forEach(([n, q], i) => L.push(["t", `${i + 1}. ${pad(n, 30)}${pad(q, 6, 1)} sold`]));
    else L.push(["t", "No sales in this period."]);
    return L;
  }

  // minimal PDF writer (A4, built-in Helvetica-Bold + Courier, no libraries needed)
  function makePDF(lines) {
    const W = 595, H = 842, M = 40;
    const style = { h1: ["F2", 18, 26], h2: ["F2", 12, 20], b: ["F3", 9, 14], t: ["F1", 9, 13] };
    const clean = (s) => String(s).replace(/₹/g, "Rs.").replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, "?").replace(/([\\()])/g, "\\$1");
    const pages = [];
    let cur = [], y = H - M;
    lines.forEach(([st, text]) => {
      const [font, size, lead] = style[st];
      if (y - lead < M) { pages.push(cur); cur = []; y = H - M; }
      y -= lead;
      if (text) cur.push(`BT /${font} ${size} Tf ${M} ${y} Td (${clean(text)}) Tj ET`);
    });
    pages.push(cur);
    pages.forEach((p, i) => p.push(`BT /F1 8 Tf ${W - M - 60} ${M / 2} Td (Page ${i + 1} of ${pages.length}) Tj ET`));

    const objs = [];
    const add = (body) => { objs.push(body); return objs.length; };
    const catalog = add(null), pagesObj = add(null);
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const f3 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>");
    const kids = pages.map((ops) => {
      const stream = ops.join("\n");
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> >> /Contents ${content} 0 R >>`);
    });
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;

    let pdf = "%PDF-1.4\n";
    const offsets = objs.map((body, i) => { const at = pdf.length; pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return pdf;
  }

  function downloadBlob(filename, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  const printPage = () => { if (report) window.print(); };
  $("#print-report").addEventListener("click", printPage);

  // print / PDF shows every day, not just the current page
  window.addEventListener("beforeprint", () => { if (report) { printing = true; renderTable(); } });
  window.addEventListener("afterprint", () => { if (report) { printing = false; renderTable(); } });

  generate(false);
})();
