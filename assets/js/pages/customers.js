/* Customers: search, add, edit, delete */
(function () {
  "use strict";
  if (!SR.initShell()) return;
  const { db, $, esc, fmtDate, fmtMobile, initials, icon, toast, openModal, closeModal,
    confirmDialog, fieldError, clearErrors, validMobile, uid, save, can, query, createTable } = SR;

  let editing = null;
  const search = $("#c-search");
  if (query.get("q")) search.value = query.get("q");
  const canEdit = can("customers", "edit");
  const canDelete = can("customers", "delete");

  const table = createTable({
    tbody: $("#cust-rows"),
    data: () => db.customers,
    filter: (c) => {
      const q = search.value.trim().toLowerCase();
      return !q || c.name.toLowerCase().includes(q) || c.mobile.includes(q.replace(/\s/g, ""));
    },
    sorters: { name: (c) => c.name, mobile: (c) => c.mobile, created: (c) => new Date(c.createdAt).getTime() },
    sort: { key: "created", dir: "desc" },
    perPage: 8,
    info: $("#page-info"),
    pager: $("#pager"),
    noun: "customers",
    render: (c) => `<tr data-id="${esc(c.id)}">
        <td><div class="cell-user"><span class="avatar soft">${esc(initials(c.name))}</span><b>${esc(c.name)}</b></div></td>
        <td>${esc(fmtMobile(c.mobile))}</td>
        <td class="muted">${fmtDate(c.createdAt)}</td>
        <td><div class="actions">
          ${canEdit ? `<button type="button" class="icon-btn" data-act="edit" aria-label="Edit ${esc(c.name)}">${icon("edit")}</button>` : ""}
          ${canDelete ? `<button type="button" class="icon-btn danger" data-act="delete" aria-label="Delete ${esc(c.name)}">${icon("trash")}</button>` : ""}
          ${!canEdit && !canDelete ? '<span class="muted">—</span>' : ""}
        </div></td>
      </tr>`,
    empty: (filtered) => filtered ? `No customers match "${search.value.trim()}".` : "No customers yet. Add your first customer.",
    onRender: (list) => { $("#c-count").textContent = `${list.length} customer${list.length === 1 ? "" : "s"}`; },
  });
  const render = (reset) => table.refresh(reset);

  search.addEventListener("input", () => render(true));
  $("#cust-filters").addEventListener("submit", (e) => e.preventDefault());

  /* ---------- add / edit ---------- */
  const form = $("#cust-form");
  const nameIn = $("#c-name");
  const mobileIn = $("#c-mobile");
  mobileIn.addEventListener("input", () => { mobileIn.value = mobileIn.value.replace(/\D/g, "").slice(0, 10); });

  function openForm(c) {
    editing = c || null;
    clearErrors(form);
    $("#cust-form-title").textContent = c ? "Edit Customer" : "Add Customer";
    $("#cust-form-submit").lastChild.textContent = c ? " Update Customer" : " Save Customer";
    nameIn.value = c ? c.name : "";
    mobileIn.value = c ? c.mobile : "";
    openModal("add-customer");
  }
  $("#add-btn").addEventListener("click", () => openForm(null));
  // opened directly with customers.html#add-customer (e.g. from the dashboard)
  if (location.hash === "#add-customer") {
    if (can("customers", "create")) openForm(null); else closeModal();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(form);
    const name = nameIn.value.trim();
    const mobile = mobileIn.value.trim();
    const dup = db.customers.find((c) => c.mobile === mobile && c !== editing);
    let ok = fieldError(nameIn, name ? "" : "Enter the customer's name");
    ok = fieldError(mobileIn, !validMobile(mobile) ? "Enter a valid 10-digit mobile number"
      : dup ? `This number belongs to ${dup.name}` : "") && ok;
    if (!ok) return;

    if (editing) {
      editing.name = name;
      editing.mobile = mobile;
      // keep old bills readable with the new details
      db.bills.forEach((b) => { if (b.customerId === editing.id) { b.customerName = name; b.mobile = mobile; } });
      toast(`${name} updated`);
    } else {
      db.customers.push({ id: uid("c"), name, mobile, createdAt: new Date().toISOString() });
      table.state.page = 1;
      toast(`${name} added`);
    }
    save();
    closeModal();
    render();
  });

  /* ---------- row actions ---------- */
  $("#cust-rows").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const c = db.customers.find((x) => x.id === btn.closest("tr").dataset.id);
    if (btn.dataset.act === "edit") openForm(c);
    if (btn.dataset.act === "delete") {
      const count = db.bills.filter((b) => b.customerId === c.id).length;
      confirmDialog({
        title: `Delete ${c.name}?`,
        message: count
          ? `${c.name} will be removed from your customer list. Their ${count} past bill${count === 1 ? "" : "s"} will be kept.`
          : `${c.name} will be removed from your customer list.`,
        onConfirm: () => {
          db.customers = db.customers.filter((x) => x !== c);
          save();
          toast(`${c.name} deleted`);
          render();
        },
      });
    }
  });

  render();
})();
