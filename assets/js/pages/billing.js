/* Billing: build a bill, auto-fill customers, live totals, save & print */
(function () {
  "use strict";
  if (!SR.initShell()) return;
  const { db, $, esc, money, fmtDateTime, initials, fmtMobile, fmtDate, icon, renderRows, toast, openModal, closeModal,
    confirmDialog, fieldError, clearErrors, validMobile, createBill, nextBillNo, receiptHTML, printBill, defaultPrinter, printerConnected, btSupported, can, uid, save } = SR;

  let cart = [];          // [{ foodId, name, price, qty }]
  let lastBill = null;

  const nameIn = $("#b-name");
  const mobileIn = $("#b-mobile");
  const foodSel = $("#b-food");
  const qtyIn = $("#b-qty");

  /* ---------- header ---------- */
  function renderHeader() {
    const no = "#" + nextBillNo();
    $("#bill-no").textContent = no;
    $("#bill-no-badge").textContent = no;
    $("#bill-date").textContent = fmtDateTime(new Date());
    renderPrinterLine();
  }

  function renderPrinterLine() {
    const p = defaultPrinter();
    const setup = can("settings") ? ' &middot; <a href="settings.html" class="text-accent">Set up</a>' : "";
    $("#printer-line").innerHTML = !btSupported()
      ? `Bluetooth printing needs Chrome or Edge${setup}`
      : !p ? `No Bluetooth printer paired${setup}`
      : printerConnected(p) ? `Printer: ${esc(p.name)} (${esc(p.paper)}) &middot; <span style="color:var(--success)">Connected</span>`
      : `Printer: ${esc(p.name)} (${esc(p.paper)}) &middot; connects when you print`;
  }
  document.addEventListener("printer-status", renderPrinterLine);

  /* ---------- customers ---------- */
  function renderCustomerLists() {
    const list = [...db.customers].sort((a, b) => a.name.localeCompare(b.name));
    $("#customer-list").innerHTML = list.map((c) => `<option value="${esc(c.name)}">${esc(fmtMobile(c.mobile))}</option>`).join("");
    $("#mobile-list").innerHTML = list.map((c) => `<option value="${esc(c.mobile)}">${esc(c.name)}</option>`).join("");
  }
  const byName = (n) => db.customers.find((c) => c.name.toLowerCase() === n.trim().toLowerCase());
  const byMobile = (m) => db.customers.find((c) => c.mobile === m.trim());

  function showCustomerCard() {
    const name = nameIn.value.trim();
    const mobile = mobileIn.value.trim();
    const existing = (validMobile(mobile) && byMobile(mobile)) || (name && !mobile && byName(name));
    const card = $("#customer-pick");
    if (existing) {
      const bills = db.bills.filter((b) => b.customerId === existing.id && b.status === "paid");
      const last = bills.length ? bills[bills.length - 1].createdAt : null;
      $("#cp-avatar").textContent = initials(existing.name);
      $("#cp-name").textContent = existing.name;
      $("#cp-meta").textContent = `Returning customer · ${bills.length} bill${bills.length === 1 ? "" : "s"}` + (last ? ` · last visit ${fmtDate(last)}` : "");
      card.hidden = false;
    } else if (name && validMobile(mobile)) {
      $("#cp-avatar").textContent = initials(name);
      $("#cp-name").textContent = name;
      $("#cp-meta").textContent = "New customer · will be saved with this bill";
      card.hidden = false;
    } else {
      card.hidden = true;
    }
  }

  nameIn.addEventListener("input", () => {
    fieldError(nameIn, "");
    const c = byName(nameIn.value);
    if (c) { mobileIn.value = c.mobile; fieldError(mobileIn, ""); }
    showCustomerCard();
  });
  mobileIn.addEventListener("input", () => {
    mobileIn.value = mobileIn.value.replace(/\D/g, "").slice(0, 10);
    fieldError(mobileIn, "");
    const c = mobileIn.value.length === 10 && byMobile(mobileIn.value);
    if (c) { nameIn.value = c.name; fieldError(nameIn, ""); }
    showCustomerCard();
  });

  // returns: null (walk-in) | customer object | false (invalid)
  function resolveCustomer() {
    const name = nameIn.value.trim();
    const mobile = mobileIn.value.trim();
    if (!name && !mobile) return null;
    if (mobile && !validMobile(mobile)) { fieldError(mobileIn, "Enter a valid 10-digit mobile number"); mobileIn.focus(); return false; }
    const existing = mobile ? byMobile(mobile) : byName(name);
    if (existing) return existing;
    if (!name) { fieldError(nameIn, "Enter the customer's name"); nameIn.focus(); return false; }
    if (!mobile) { fieldError(mobileIn, "Enter a mobile number to save this new customer"); mobileIn.focus(); return false; }
    const c = { id: uid("c"), name, mobile, createdAt: new Date().toISOString() };
    db.customers.push(c);
    save();
    return c;
  }

  /* ---------- food items ---------- */
  function inCart(foodId) { const l = cart.find((x) => x.foodId === foodId); return l ? l.qty : 0; }
  function stockLeft(food) { return food.stock === null ? Infinity : food.stock - inCart(food.id); }

  function renderFoodSelect() {
    const keep = foodSel.value;
    const groups = {};
    db.foods.filter((f) => f.available).forEach((f) => { (groups[f.category] = groups[f.category] || []).push(f); });
    foodSel.innerHTML = Object.keys(groups).map((cat) =>
      `<optgroup label="${esc(cat)}">${groups[cat].map((f) => {
        const left = stockLeft(f);
        const note = f.stock === null ? "" : left <= 0 ? " (out of stock)" : ` (${left} left)`;
        return `<option value="${f.id}" ${left <= 0 ? "disabled" : ""}>${esc(f.name)} — ₹${f.price}${note}</option>`;
      }).join("")}</optgroup>`).join("");
    if (keep && foodSel.querySelector(`option[value="${keep}"]:not([disabled])`)) foodSel.value = keep;
    else {
      const first = foodSel.querySelector("option:not([disabled])");
      if (first) foodSel.value = first.value;
    }
  }

  $("#add-item-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const food = db.foods.find((f) => f.id === foodSel.value);
    const qty = parseInt(qtyIn.value, 10);
    if (!food) { toast("Select a food item first.", "error"); return; }
    if (!qty || qty < 1 || qty > 99) { fieldError(qtyIn, "1–99"); qtyIn.focus(); return; }
    fieldError(qtyIn, "");
    if (qty > stockLeft(food)) {
      toast(`Only ${Math.max(0, stockLeft(food))} ${food.name} left in stock.`, "error");
      return;
    }
    const line = cart.find((x) => x.foodId === food.id);
    if (line) line.qty += qty;
    else cart.push({ foodId: food.id, name: food.name, price: food.price, qty });
    qtyIn.value = 1;
    render();
    foodSel.focus();
  });

  $("#bill-lines").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const line = cart[Number(btn.closest("tr").dataset.index)];
    const food = db.foods.find((f) => f.id === line.foodId);
    if (btn.dataset.act === "inc") {
      if (food && stockLeft(food) <= 0) { toast(`No more ${line.name} in stock.`, "error"); return; }
      line.qty += 1;
      render();
    } else if (btn.dataset.act === "dec") {
      if (line.qty > 1) { line.qty -= 1; render(); } else askRemove(line);
    } else if (btn.dataset.act === "remove") {
      askRemove(line);
    }
  });

  function askRemove(line) {
    confirmDialog({
      title: `Remove ${line.name}?`,
      message: `${line.qty} × ${line.name} will be removed from this bill.`,
      ok: "Remove",
      onConfirm: () => { cart = cart.filter((x) => x !== line); render(); },
    });
  }

  /* ---------- totals ---------- */
  function totals() {
    return { total: cart.reduce((s, l) => s + l.price * l.qty, 0), qty: cart.reduce((s, l) => s + l.qty, 0) };
  }

  function render() {
    renderRows($("#bill-lines"), cart.map((l, i) => `<tr data-index="${i}">
        <td class="fw-600">${esc(l.name)}</td>
        <td class="num">${money(l.price)}</td>
        <td><div class="qty-ctrl"><button type="button" data-act="dec" aria-label="Decrease">&minus;</button><span>${l.qty}</span><button type="button" data-act="inc" aria-label="Increase">+</button></div></td>
        <td class="num fw-600">${money(l.price * l.qty)}</td>
        <td><button type="button" class="icon-btn danger" data-act="remove" aria-label="Remove ${esc(l.name)}">${icon("trash")}</button></td>
      </tr>`), "No items yet. Select a food item above and press Add Item.", 5);

    const t = totals();
    $("#item-count").textContent = `${cart.length} item${cart.length === 1 ? "" : "s"}`;
    $("#sum-items").textContent = cart.length;
    $("#sum-qty").textContent = t.qty;
    $("#sum-total").textContent = money(t.total);
    $("#save-bill").disabled = !cart.length;
    $("#print-bill").disabled = !cart.length;
    renderFoodSelect();
  }

  /* ---------- save / print / clear ---------- */
  function saveBill(andPrint) {
    if (!cart.length) { toast("Add at least one food item.", "error"); return; }
    clearErrors($(".content"));
    const customer = resolveCustomer();
    if (customer === false) return;
    const payment = document.querySelector('input[name="pay"]:checked').value;
    lastBill = createBill({ items: cart, customer, payment });

    cart = [];
    nameIn.value = "";
    mobileIn.value = "";
    $("#pay-cash").checked = true;
    showCustomerCard();
    renderCustomerLists();
    renderHeader();
    render();

    $("#done-title").textContent = `Bill #${lastBill.no} saved`;
    $("#done-receipt").innerHTML = receiptHTML(lastBill);
    openModal("bill-done");
    toast(`Bill #${lastBill.no} saved · ${money(lastBill.total)}`);
    if (andPrint || db.settings.autoPrint) printBill(lastBill);
  }

  $("#save-bill").addEventListener("click", () => saveBill(false));
  $("#print-bill").addEventListener("click", () => saveBill(true));
  $("#done-print").addEventListener("click", () => lastBill && printBill(lastBill));
  $("#clear-bill").addEventListener("click", () => {
    if (!cart.length && !nameIn.value && !mobileIn.value) return;
    confirmDialog({
      title: "Clear this bill?",
      message: "All items and customer details on this bill will be cleared.",
      ok: "Clear bill", tone: "warning", iconName: "alert",
      onConfirm: () => {
        cart = [];
        nameIn.value = "";
        mobileIn.value = "";
        clearErrors($(".content"));
        showCustomerCard();
        render();
      },
    });
  });

  /* ---------- add new customer (modal) ---------- */
  const addForm = $("#add-customer-form");
  const nName = $("#n-name");
  const nMobile = $("#n-mobile");
  nMobile.addEventListener("input", () => { nMobile.value = nMobile.value.replace(/\D/g, "").slice(0, 10); });
  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(addForm);
    const name = nName.value.trim();
    const mobile = nMobile.value.trim();
    let ok = fieldError(nName, name ? "" : "Enter the customer's name");
    ok = fieldError(nMobile, !validMobile(mobile) ? "Enter a valid 10-digit mobile number"
      : byMobile(mobile) ? `Already saved as ${byMobile(mobile).name}` : "") && ok;
    if (!ok) return;
    db.customers.push({ id: uid("c"), name, mobile, createdAt: new Date().toISOString() });
    save();
    renderCustomerLists();
    nameIn.value = name;
    mobileIn.value = mobile;
    showCustomerCard();
    addForm.reset();
    closeModal();
    toast(`${name} added and selected for this bill`);
  });

  /* ---------- start ---------- */
  renderHeader();
  renderCustomerLists();
  render();
  setInterval(() => { $("#bill-date").textContent = fmtDateTime(new Date()); }, 30000);
})();
