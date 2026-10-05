/* Settings: pair and manage Bluetooth thermal printers, receipt details */
(function () {
  "use strict";
  if (!SR.initShell()) return;
  const { db, $, esc, icon, toast, openModal, closeModal, confirmDialog, fieldError, clearErrors, save, can,
    btSupported, defaultPrinter, printerConnected, choosePrinterDevice, connectDevice, disconnectPrinter, rememberDevice, testPrint } = SR;

  const canEdit = can("settings", "edit");
  const supported = btSupported();
  $("#bt-unsupported").hidden = supported;

  /* ---------- pairing / connecting (browser shows its device list) ---------- */
  async function pickAndConnect(makeDefault) {
    if (!supported) { toast("Bluetooth printing needs Chrome or Edge.", "error"); return; }
    let device;
    try {
      device = await choosePrinterDevice();
    } catch (e) {
      if (e.name !== "NotFoundError") toast("Couldn't open the Bluetooth device list.", "error");
      return; // list closed without choosing
    }
    toast(`Connecting to ${device.name || "printer"}...`, "info");
    try {
      await connectDevice(device);
    } catch (e) {
      toast(e.message === "NOT_PRINTER" ? "That device doesn't accept print data. Choose your thermal printer." : "Couldn't connect. Make sure the printer is on and close by.", "error");
      return;
    }
    const isNew = !db.printers.some((p) => p.deviceId === device.id);
    const p = rememberDevice(device, makeDefault ? { isDefault: true } : {});
    renderAll();
    toast(isNew ? `${p.name} paired and connected` : `${p.name} connected`);
  }

  $("#btn-pair").addEventListener("click", () => pickAndConnect(true));
  $("#btn-connect").addEventListener("click", () => pickAndConnect(false));
  $("#btn-disconnect").addEventListener("click", () => {
    const p = defaultPrinter();
    disconnectPrinter();
    toast(`${p ? p.name : "Printer"} disconnected`, "info");
  });
  $("#btn-test").addEventListener("click", () => testPrint());
  document.addEventListener("printer-status", () => { renderStatus(); renderSaved(); });

  /* ---------- default printer card ---------- */
  const pName = $("#p-name"), pId = $("#p-id"), pPaper = $("#p-paper"), pEnc = $("#p-enc"), pAuto = $("#p-auto");

  function fillPrinterForm() {
    const p = defaultPrinter();
    clearErrors($("#printer-form"));
    $("#printer-fields").hidden = !p;
    if (p) {
      pName.value = p.name;
      pId.value = p.deviceId;
      pPaper.value = p.paper;
      pEnc.value = p.encoding;
    }
    [pName, pPaper, pEnc, pAuto].forEach((el) => { el.disabled = !canEdit; });
    pAuto.checked = db.settings.autoPrint;
  }

  function renderStatus() {
    const p = defaultPrinter();
    const on = !!p && printerConnected(p);
    $("#cs-name").textContent = p ? p.name : "No printer paired yet";
    $("#cs-meta").textContent = p ? `${p.paper} paper · used for bills` : "Press Pair New Printer to add your Bluetooth printer";
    $("#cs-dot").textContent = on ? "Connected" : "Not connected";
    $("#cs-dot").classList.toggle("off", !on);
    $("#conn-badge").className = "badge " + (on ? "success" : "neutral");
    $("#conn-badge").textContent = on ? "Connected" : p ? "Not connected" : "Not paired";
    $("#btn-connect").disabled = !supported || !p || on;
    $("#btn-disconnect").disabled = !on;
    $("#btn-test").disabled = !supported || !p;
  }

  $("#printer-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = defaultPrinter();
    clearErrors(e.target);
    if (p) {
      if (!fieldError(pName, pName.value.trim() ? "" : "Enter a printer name")) return;
      Object.assign(p, { name: pName.value.trim(), paper: pPaper.value, encoding: pEnc.value });
    }
    db.settings.autoPrint = pAuto.checked;
    save();
    renderAll();
    toast("Printer settings saved");
  });
  $("#btn-reset").addEventListener("click", () => { fillPrinterForm(); toast("Changes discarded", "info"); });

  /* ---------- saved printers ---------- */
  function renderSaved() {
    $("#saved-count").textContent = db.printers.length ? `${db.printers.length} saved` : "";
    $("#saved-list").innerHTML = db.printers.length ? db.printers.map((p) => `<li data-id="${esc(p.id)}">
        <div class="stat-icon">${icon("printer")}</div>
        <div class="info"><b>${esc(p.name)}</b><span>${esc(p.paper)}${p.isDefault ? " · Used for bills" : ""}${printerConnected(p) ? " · Connected" : ""}</span></div>
        <div class="actions">
          ${canEdit && !p.isDefault ? '<button type="button" class="btn btn-soft btn-sm" data-act="default">Use</button>' : ""}
          ${canEdit ? `<button type="button" class="icon-btn" data-act="edit" aria-label="Edit ${esc(p.name)}">${icon("edit")}</button>` : ""}
          ${can("settings", "delete") ? `<button type="button" class="icon-btn danger" data-act="delete" aria-label="Delete ${esc(p.name)}">${icon("trash")}</button>` : ""}
        </div>
      </li>`).join("")
      : `<li style="display:block"><div class="empty">${icon("bluetooth")}<span>No printers yet. Press Pair New Printer.</span></div></li>`;
  }

  $("#saved-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const p = db.printers.find((x) => x.id === btn.closest("li").dataset.id);
    if (btn.dataset.act === "default") {
      db.printers.forEach((x) => { x.isDefault = x === p; });
      save();
      renderAll();
      toast(`${p.name} will be used for bills`);
    }
    if (btn.dataset.act === "edit") openEdit(p);
    if (btn.dataset.act === "delete") {
      confirmDialog({
        title: `Delete ${p.name}?`,
        message: "This printer will be removed. You can pair it again any time.",
        onConfirm: () => {
          if (printerConnected(p)) disconnectPrinter();
          db.printers = db.printers.filter((x) => x !== p);
          if (p.isDefault && db.printers[0]) db.printers[0].isDefault = true;
          save();
          renderAll();
          toast(`${p.name} deleted`);
        },
      });
    }
  });

  /* ---------- edit printer modal ---------- */
  let editing = null;
  const pm = { form: $("#pm-form"), name: $("#pm-name"), paper: $("#pm-paper"), enc: $("#pm-enc"), def: $("#pm-default") };
  function openEdit(p) {
    editing = p;
    clearErrors(pm.form);
    pm.name.value = p.name;
    pm.paper.value = p.paper;
    pm.enc.value = p.encoding;
    pm.def.checked = p.isDefault;
    openModal("printer-modal");
  }
  pm.form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(pm.form);
    const name = pm.name.value.trim();
    if (!fieldError(pm.name, name ? "" : "Enter a printer name")) return;
    Object.assign(editing, { name, paper: pm.paper.value, encoding: pm.enc.value });
    if (pm.def.checked) db.printers.forEach((x) => { x.isDefault = x === editing; });
    save();
    closeModal();
    renderAll();
    toast(`${name} updated`);
  });

  /* ---------- receipt details ---------- */
  const r = { name: $("#r-name"), phone: $("#r-phone"), addr: $("#r-addr"), foot: $("#r-foot") };
  function fillReceipt() {
    const s = db.settings.restaurant;
    r.name.value = s.name; r.phone.value = s.phone || ""; r.addr.value = s.address; r.foot.value = s.footer;
    Object.values(r).forEach((el) => { el.disabled = !canEdit; });
  }
  $("#receipt-form").addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(e.target);
    if (!fieldError(r.name, r.name.value.trim() ? "" : "Enter the restaurant name")) return;
    db.settings.restaurant = { name: r.name.value.trim(), phone: r.phone.value.trim(), address: r.addr.value.trim(), footer: r.foot.value.trim() };
    save();
    toast("Receipt details saved");
  });

  function renderAll() { renderStatus(); renderSaved(); fillPrinterForm(); }
  renderAll();
  fillReceipt();
})();
