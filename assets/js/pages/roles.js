/* Roles & Permissions: roles and the permission matrix */
(function () {
  "use strict";
  if (!SR.initShell()) return;
  const { db, MODULES, ACTIONS, $, $$, esc, icon, initials, renderRows, toast, openModal, closeModal,
    confirmDialog, fieldError, clearErrors, uid, save, can, currentUser, roleOf, query } = SR;

  const me = currentUser();
  const canCreate = can("roles", "create");
  const canEdit = can("roles", "edit");
  const canDelete = can("roles", "delete");

  /* ---------- stats + role picker ---------- */
  function renderStats() {
    $("#st-roles").textContent = db.roles.length;
    $("#st-custom").textContent = db.roles.filter((r) => !r.locked && !["r-manager", "r-cashier", "r-waiter"].includes(r.id)).length;
    $("#st-users").textContent = db.users.length;
    $("#st-modules").textContent = MODULES.length;
    $("#tc-roles").textContent = db.roles.length;
    const roleOptions = db.roles.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("");
    const keepPerm = $("#perm-role").value || query.get("role");
    $("#perm-role").innerHTML = roleOptions;
    $("#perm-role").value = db.roles.some((r) => r.id === keepPerm) ? keepPerm : (db.roles.find((r) => !r.locked) || db.roles[0]).id;
  }

  /* ---------- roles ---------- */
  function renderRoles() {
    $("#role-grid").innerHTML = db.roles.map((r) => {
      const members = db.users.filter((u) => u.roleId === r.id);
      return `<div class="card role-card" data-id="${esc(r.id)}">
        <div class="top">
          <div class="stat-icon">${icon(r.locked ? "shield" : "users")}</div>
          <div class="actions">
            ${canEdit ? `<button type="button" class="icon-btn" data-act="edit" aria-label="Edit ${esc(r.name)}">${icon("edit")}</button>` : ""}
            ${canDelete && !r.locked ? `<button type="button" class="icon-btn danger" data-act="delete" aria-label="Delete ${esc(r.name)}">${icon("trash")}</button>` : ""}
          </div>
        </div>
        <h4>${esc(r.name)}</h4>
        <p>${esc(r.description || "No description")}</p>
        <div class="meta">
          <div class="avatars">${members.slice(0, 4).map((u) => `<span class="avatar ${r.locked ? "" : "soft"}" title="${esc(u.name)}">${esc(initials(u.name))}</span>`).join("")}</div>
          <span class="muted">${members.length} user${members.length === 1 ? "" : "s"}</span>
        </div>
      </div>`;
    }).join("") + (canCreate ? `<button type="button" class="card role-card add" data-act="add"><div class="stat-icon">${icon("plus")}</div>Create new role</button>` : "");
  }

  $("#role-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "add") { openRoleForm(null); return; }
    const r = db.roles.find((x) => x.id === btn.closest("[data-id]").dataset.id);
    if (btn.dataset.act === "edit") openRoleForm(r);
    if (btn.dataset.act === "delete") {
      const count = db.users.filter((u) => u.roleId === r.id).length;
      if (count) { toast(`Move the ${count} user${count === 1 ? "" : "s"} with the ${r.name} role to another role first.`, "error"); return; }
      confirmDialog({
        title: `Delete ${r.name} role?`,
        message: "This role and its permissions will be removed.",
        onConfirm: () => { db.roles = db.roles.filter((x) => x !== r); delete db.perms[r.id]; save(); refresh(); toast(`${r.name} role deleted`); },
      });
    }
  });

  const rf = { form: $("#role-form"), name: $("#rm-name"), desc: $("#rm-desc") };
  let editingRole = null;
  function openRoleForm(r) {
    editingRole = r || null;
    clearErrors(rf.form);
    $("#rm-title").textContent = r ? "Edit Role" : "Add Role";
    $("#rm-submit").lastChild.textContent = r ? " Update Role" : " Save Role";
    $("#rm-hint").hidden = !!r;
    rf.name.value = r ? r.name : "";
    rf.desc.value = r ? r.description : "";
    rf.name.disabled = !!(r && r.locked);
    openModal("role-modal");
  }
  $("#add-role-btn").addEventListener("click", () => openRoleForm(null));

  rf.form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(rf.form);
    const name = rf.name.value.trim();
    const dup = db.roles.find((x) => x.name.toLowerCase() === name.toLowerCase() && x !== editingRole);
    if (!fieldError(rf.name, !name ? "Enter a role name" : dup ? "This role already exists" : "")) return;
    if (editingRole) {
      editingRole.name = name;
      editingRole.description = rf.desc.value.trim();
      toast(`${name} role updated`);
    } else {
      const id = uid("r-");
      db.roles.push({ id, name, description: rf.desc.value.trim() });
      db.perms[id] = {};
      MODULES.forEach((m) => { db.perms[id][m.key] = Object.fromEntries(ACTIONS.map((a) => [a, false])); });
      toast(`${name} role added. Set its permissions next.`);
      $("#perm-role").value = id;
    }
    save();
    closeModal();
    refresh();
    if (!editingRole) {
      $("#perm-role").value = db.roles[db.roles.length - 1].id;
      renderPerms();
      $("#tab-perms").checked = true;
    }
  });

  /* ---------- permissions ---------- */
  function renderPerms() {
    const role = db.roles.find((r) => r.id === $("#perm-role").value);
    if (!role) return;
    const locked = !!role.locked || !canEdit;
    const p = db.perms[role.id] || {};
    renderRows($("#perm-rows"), MODULES.map((m) => `<tr data-mod="${m.key}">
        <td><div class="module"><span class="stat-icon">${icon(m.icon)}</span>${esc(m.name)}</div></td>
        ${ACTIONS.map((a) => m.actions.includes(a)
          ? `<td><input type="checkbox" class="check" data-action="${a}" aria-label="${esc(m.name)}: ${a}"
              ${role.locked || (p[m.key] && p[m.key][a]) ? "checked" : ""} ${locked ? "disabled" : ""}></td>`
          : '<td class="na">—</td>').join("")}
      </tr>`), "", 6);
    $("#perm-note").textContent = role.locked ? "Admin always has full access" : canEdit ? "Tick what this role is allowed to do" : "You can view permissions but not change them";
    $("#perm-save").disabled = locked;
    $("#perm-reset").disabled = locked;
  }
  $("#perm-role").addEventListener("change", renderPerms);
  $("#perm-filters").addEventListener("submit", (e) => e.preventDefault());

  // ticking any action also ticks View; unticking View clears the row
  $("#perm-rows").addEventListener("change", (e) => {
    const box = e.target.closest("input[data-action]");
    if (!box) return;
    const row = box.closest("tr");
    if (box.dataset.action === "view" && !box.checked) $$("input[data-action]", row).forEach((b) => { b.checked = false; });
    if (box.dataset.action !== "view" && box.checked) { const v = $('input[data-action="view"]', row); if (v) v.checked = true; }
  });

  $("#perm-reset").addEventListener("click", () => { renderPerms(); toast("Changes discarded", "info"); });
  $("#perm-save").addEventListener("click", () => {
    const role = db.roles.find((r) => r.id === $("#perm-role").value);
    if (!role || role.locked) return;
    const p = {};
    $$("#perm-rows tr").forEach((tr) => {
      p[tr.dataset.mod] = Object.fromEntries(ACTIONS.map((a) => {
        const box = $(`input[data-action="${a}"]`, tr);
        return [a, !!(box && box.checked)];
      }));
    });
    db.perms[role.id] = p;
    save();
    toast(`Permissions for ${role.name} saved`);
    if (roleOf(me) && roleOf(me).id === role.id) setTimeout(() => location.reload(), 900);
  });

  function refresh() { renderStats(); renderRoles(); renderPerms(); }
  if (location.hash === "#permissions" || query.get("tab") === "permissions") $("#tab-perms").checked = true;
  refresh();
})();
