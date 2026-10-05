/* Bills: history with filters, view receipt, reprint, cancel */
(function () {
  "use strict";
  if (!SR.initShell()) return;
  const { db, $, esc, money, fmtDateTime, fmtMobile, isoDay, icon, toast, openModal,
    confirmDialog, receiptHTML, printBill, cancelBill, can, query, createTable } = SR;

  let current = null;

  const search = $("#f-search");
  const date = $("#f-date");
  const status = $("#f-status");
  const pay = $("#f-pay");

  if (query.get("q")) search.value = query.get("q");
  else date.value = isoDay(new Date());

  const canCancel = can("bills", "delete");
  const canPrint = can("bills", "print");
  const table = createTable({
    tbody: $("#bill-rows"),
    data: () => db.bills,
    filter: (b) => {
      const q = search.value.trim().toLowerCase().replace(/^#/, "");
      return (!q || b.no.toLowerCase().includes(q) || b.customerName.toLowerCase().includes(q) || b.mobile.includes(q)) &&
        (!date.value || isoDay(b.createdAt) === date.value) &&
        (!status.value || b.status === status.value) &&
        (!pay.value || b.payment === pay.value);
    },
    sorters: {
      no: (b) => b.no, customer: (b) => b.customerName, items: (b) => b.items.reduce((s, i) => s + i.qty, 0),
      amount: (b) => b.total, payment: (b) => b.payment, date: (b) => new Date(b.createdAt).getTime(), status: (b) => b.status,
    },
    sort: { key: "date", dir: "desc" },
    perPage: 10,
    info: $("#page-info"),
    pager: $("#pager"),
    noun: "bills",
    render: (b) => `<tr data-id="${esc(b.id)}">
        <td class="fw-600">#${esc(b.no)}</td>
        <td><div><b>${esc(b.customerName)}</b><div class="muted" style="font-size:12px">${esc(fmtMobile(b.mobile))}</div></div></td>
        <td class="num">${b.items.reduce((s, i) => s + i.qty, 0)}</td>
        <td class="num fw-600">${money(b.total)}</td>
        <td>${esc(b.payment)}</td>
        <td class="muted">${fmtDateTime(b.createdAt)}</td>
        <td>${b.status === "paid" ? '<span class="badge success">Paid</span>' : '<span class="badge danger">Cancelled</span>'}</td>
        <td><div class="actions">
          <button type="button" class="icon-btn" data-act="view" aria-label="View bill ${esc(b.no)}">${icon("eye")}</button>
          ${canPrint ? `<button type="button" class="icon-btn" data-act="print" aria-label="Reprint bill ${esc(b.no)}">${icon("printer")}</button>` : ""}
          ${canCancel && b.status === "paid" ? `<button type="button" class="icon-btn danger" data-act="cancel" aria-label="Cancel bill ${esc(b.no)}">${icon("ban")}</button>` : ""}
        </div></td>
      </tr>`,
    empty: () => "No bills match these filters.",
    onRender: (list) => {
      const paid = list.filter((b) => b.status === "paid");
      $("#f-count").textContent = `${list.length} bill${list.length === 1 ? "" : "s"} · ${money(paid.reduce((s, b) => s + b.total, 0))}`;
    },
  });
  const render = (reset) => table.refresh(reset);

  [search, date, status, pay].forEach((el) => el.addEventListener("input", () => render(true)));
  $("#bill-filters").addEventListener("submit", (e) => e.preventDefault());

  $("#bill-rows").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const bill = db.bills.find((b) => b.id === btn.closest("tr").dataset.id);
    if (btn.dataset.act === "view") openBill(bill);
    if (btn.dataset.act === "print") printBill(bill);
    if (btn.dataset.act === "cancel") askCancel(bill);
  });

  function openBill(bill) {
    current = bill;
    $("#vb-title").textContent = `Bill #${bill.no}`;
    $("#vb-body").innerHTML = receiptHTML(bill) +
      (bill.status === "cancelled" ? `<p class="form-hint" style="text-align:center;margin-top:12px">Cancelled: ${esc(bill.cancelReason || "—")}</p>` : "");
    $("#vb-cancel").hidden = !can("bills", "delete") || bill.status !== "paid";
    openModal("view-bill");
  }
  $("#vb-print").addEventListener("click", () => current && printBill(current));
  $("#vb-cancel").addEventListener("click", () => current && askCancel(current));

  function askCancel(bill) {
    confirmDialog({
      title: `Cancel bill #${bill.no}?`,
      message: `${money(bill.total)} will be removed from sales and the items go back to stock.`,
      ok: "Cancel Bill", iconName: "ban",
      extraHTML: `<label class="form-label" for="cancel-reason">Reason</label>
        <select class="form-control" id="cancel-reason">
          <option>Customer cancelled order</option><option>Wrong items billed</option>
          <option>Duplicate bill</option><option>Other</option>
        </select>`,
      onConfirm: (extra) => {
        cancelBill(bill, extra.querySelector("#cancel-reason").value);
        toast(`Bill #${bill.no} cancelled`);
        render();
      },
    });
  }

  render();
  const openId = query.get("view");
  if (openId) {
    const b = db.bills.find((x) => x.id === openId);
    if (b) { date.value = isoDay(b.createdAt); render(); openBill(b); }
  }
})();
