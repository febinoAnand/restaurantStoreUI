/* Stock / Food: menu items with price and stock */
(function () {
  "use strict";
  if (!SR.initShell()) return;
  const { db, $, esc, money, icon, toast, openModal, closeModal, confirmDialog,
    fieldError, clearErrors, uid, save, can, foodStatus, query, createTable } = SR;

  let editing = null;
  const search = $("#s-search");
  const cat = $("#s-cat");
  const status = $("#s-status");
  if (query.get("q")) search.value = query.get("q");

  const categories = () => [...new Set(db.foods.map((f) => f.category))];

  function renderStats() {
    const st = db.foods.map(foodStatus);
    $("#st-total").textContent = db.foods.length;
    $("#st-cats").textContent = `across ${categories().length} categories`;
    $("#st-ok").textContent = st.filter((s) => s.key === "ok").length;
    $("#st-low").textContent = st.filter((s) => s.key === "low").length;
    $("#st-out").textContent = st.filter((s) => s.key === "out").length;
    const keep = cat.value;
    cat.innerHTML = '<option value="">All categories</option>' + categories().map((c) => `<option>${esc(c)}</option>`).join("");
    cat.value = categories().includes(keep) ? keep : "";
    $("#cat-list").innerHTML = categories().map((c) => `<option value="${esc(c)}">`).join("");
  }

  const canEdit = can("stock", "edit");
  const canDelete = can("stock", "delete");
  const STATUS_ORDER = { ok: 0, low: 1, out: 2, off: 3 };
  const table = createTable({
    tbody: $("#food-rows"),
    data: () => db.foods,
    filter: (f) => {
      const q = search.value.trim().toLowerCase();
      return (!q || f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)) &&
        (!cat.value || f.category === cat.value) &&
        (!status.value || foodStatus(f).key === status.value);
    },
    sorters: {
      name: (f) => f.name, category: (f) => f.category, price: (f) => f.price,
      stock: (f) => f.stock, status: (f) => STATUS_ORDER[foodStatus(f).key],
    },
    sort: { key: "name", dir: "asc" },
    perPage: 10,
    info: $("#page-info"),
    pager: $("#pager"),
    noun: "items",
    render: (f) => {
      const s = foodStatus(f);
      return `<tr data-id="${esc(f.id)}">
        <td class="fw-600">${esc(f.name)}</td>
        <td class="muted">${esc(f.category)}</td>
        <td class="num">${money(f.price)}</td>
        <td class="num">${f.stock === null ? '<span class="muted">Not tracked</span>' : f.stock}</td>
        <td><span class="badge ${s.cls}">${s.label}</span></td>
        <td><div class="actions">
          ${canEdit ? `<button type="button" class="icon-btn" data-act="edit" aria-label="Edit ${esc(f.name)}">${icon("edit")}</button>` : ""}
          ${canDelete ? `<button type="button" class="icon-btn danger" data-act="delete" aria-label="Delete ${esc(f.name)}">${icon("trash")}</button>` : ""}
          ${!canEdit && !canDelete ? '<span class="muted">—</span>' : ""}
        </div></td>
      </tr>`;
    },
    empty: (filtered) => filtered ? "No food items match these filters." : "No food items yet. Add your first item.",
    onRender: (list) => { $("#s-count").textContent = `${list.length} of ${db.foods.length} items`; },
  });
  const render = (reset) => table.refresh(reset);

  [search, cat, status].forEach((el) => el.addEventListener("input", () => render(true)));
  $("#food-filters").addEventListener("submit", (e) => e.preventDefault());

  /* ---------- add / edit ---------- */
  const form = $("#food-form");
  const fName = $("#f-name"), fCat = $("#f-cat"), fPrice = $("#f-price"), fQty = $("#f-qty"), fAvail = $("#f-available");

  function openForm(f) {
    editing = f || null;
    clearErrors(form);
    $("#food-form-title").textContent = f ? "Edit Food Item" : "Add Food Item";
    $("#food-form-submit").lastChild.textContent = f ? " Update Item" : " Save Item";
    fName.value = f ? f.name : "";
    fCat.value = f ? f.category : "";
    fPrice.value = f ? f.price : "";
    fQty.value = f && f.stock !== null ? f.stock : "";
    fAvail.checked = f ? f.available : true;
    openModal("add-food");
  }
  $("#add-btn").addEventListener("click", () => openForm(null));
  if (location.hash === "#add-food") {
    if (can("stock", "create")) openForm(null); else closeModal();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(form);
    const name = fName.value.trim();
    const category = fCat.value.trim();
    const price = Number(fPrice.value);
    const qtyText = fQty.value.trim();
    const qty = qtyText === "" ? null : Number(qtyText);
    const dup = db.foods.find((f) => f.name.toLowerCase() === name.toLowerCase() && f !== editing);
    let ok = fieldError(fName, !name ? "Enter the food name" : dup ? "This item already exists" : "");
    ok = fieldError(fCat, category ? "" : "Enter a category") && ok;
    ok = fieldError(fPrice, price > 0 && Number.isInteger(price) ? "" : "Enter a price in whole rupees") && ok;
    ok = fieldError(fQty, qty === null || (qty >= 0 && Number.isInteger(qty)) ? "" : "Enter 0 or more, or leave empty") && ok;
    if (!ok) return;

    if (editing) {
      Object.assign(editing, { name, category, price, stock: qty, available: fAvail.checked });
      toast(`${name} updated`);
    } else {
      db.foods.push({ id: uid("f"), name, category, price, stock: qty, available: fAvail.checked });
      toast(`${name} added to the menu`);
    }
    save();
    closeModal();
    renderStats();
    render();
  });

  /* ---------- row actions ---------- */
  $("#food-rows").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const f = db.foods.find((x) => x.id === btn.closest("tr").dataset.id);
    if (btn.dataset.act === "edit") openForm(f);
    if (btn.dataset.act === "delete") {
      confirmDialog({
        title: `Delete ${f.name}?`,
        message: `${f.name} will be removed from the menu and won't appear in billing. Past bills are kept.`,
        onConfirm: () => {
          db.foods = db.foods.filter((x) => x !== f);
          save();
          toast(`${f.name} deleted`);
          renderStats();
          render();
        },
      });
    }
  });

  renderStats();
  render();
})();
