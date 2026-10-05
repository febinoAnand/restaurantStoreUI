/* Users & Roles: users, roles and the permission matrix on one page */
(function () {
  "use strict";
  if (!SR.initShell()) return;
  const { db, MODULES, ACTIONS, $, $$, esc, icon, initials, fmtMobile, lastLoginText, renderRows, toast, openModal, closeModal,
    confirmDialog, fieldError, clearErrors, validMobile, uid, save, can, currentUser, roleOf, createTable } = SR;

  const me = currentUser();
  const canCreate = can("users", "create");
  const canEdit = can("users", "edit");
  const canDelete = can("users", "delete");
  const roleName = (id) => (db.roles.find((r) => r.id === id) || { name: "—" }).name;
  const isAdminRole = (id) => !!(db.roles.find((r) => r.id === id) || {}).locked;
  const activeAdmins = () => db.users.filter((u) => u.active && isAdminRole(u.roleId));

  /* ---------- stats ---------- */
  function renderStats() {
    const active = db.users.filter((u) => u.active).length;
    $("#st-users").textContent = db.users.length;
    $("#st-users-note").innerHTML = `<b>${active}</b> active`;
    $("#st-active").textContent = active;
    $("#st-inactive").textContent = db.users.length - active;
    $("#st-roles").textContent = db.roles.length;
    $("#tc-users").textContent = db.users.length;
    $("#tc-roles").textContent = db.roles.length;
    const roleOptions = db.roles.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("");
    const keep = $("#u-role-filter").value;
    $("#u-role-filter").innerHTML = '<option value="">All roles</option>' + roleOptions;
    $("#u-role-filter").value = db.roles.some((r) => r.id === keep) ? keep : "";
    $("#um-role").innerHTML = roleOptions;
    const keepPerm = $("#perm-role").value;
    $("#perm-role").innerHTML = roleOptions;
    $("#perm-role").value = db.roles.some((r) => r.id === keepPerm) ? keepPerm : (db.roles.find((r) => !r.locked) || db.roles[0]).id;
  }

  /* ---------- users ---------- */
  const uSearch = $("#u-search"), uRole = $("#u-role-filter"), uStatus = $("#u-status-filter");
  const usersTable = createTable({
    tbody: $("#user-rows"),
    data: () => db.users,
    filter: (u) => {
      const q = uSearch.value.trim().toLowerCase();
      return (!q || u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || (u.mobile || "").includes(q) ||
          roleName(u.roleId).toLowerCase().includes(q)) &&
        (!uRole.value || u.roleId === uRole.value) &&
        (!uStatus.value || (uStatus.value === "active") === u.active);
    },
    sorters: {
      name: (u) => u.name, username: (u) => u.username, role: (u) => roleName(u.roleId), mobile: (u) => u.mobile || "",
      status: (u) => (u.active ? 0 : 1), login: (u) => (u.lastLogin ? new Date(u.lastLogin).getTime() : null),
    },
    sort: { key: "name", dir: "asc" },
    perPage: 8,
    info: $("#u-page-info"),
    pager: $("#u-pager"),
    noun: "users",
    render: (u) => {
      const deletable = canDelete && u.id !== me.id && !(isAdminRole(u.roleId) && activeAdmins().length <= 1 && u.active);
      return `<tr data-id="${esc(u.id)}">
        <td><div class="cell-user"><span class="avatar ${isAdminRole(u.roleId) ? "" : "soft"}">${esc(initials(u.name))}</span><b>${esc(u.name)}${u.id === me.id ? ' <span class="muted" style="font-weight:500">(you)</span>' : ""}</b></div></td>
        <td>${esc(u.username)}</td>
        <td><span class="badge plain">${esc(roleName(u.roleId))}</span></td>
        <td>${esc(fmtMobile(u.mobile))}</td>
        <td>${u.active ? '<span class="badge success">Active</span>' : '<span class="badge neutral">Inactive</span>'}</td>
        <td class="muted">${lastLoginText(u.lastLogin)}</td>
        <td><div class="actions">
          ${canEdit ? `<button type="button" class="icon-btn" data-act="edit" aria-label="Edit ${esc(u.name)}">${icon("edit")}</button>` : ""}
          ${deletable ? `<button type="button" class="icon-btn danger" data-act="delete" aria-label="Delete ${esc(u.name)}">${icon("trash")}</button>` : ""}
          ${!canEdit && !deletable ? '<span class="muted">—</span>' : ""}
        </div></td>
      </tr>`;
    },
    empty: () => "No users match these filters.",
    onRender: (list) => { $("#u-count").textContent = `${list.length} user${list.length === 1 ? "" : "s"}`; },
  });
  const renderUsers = (reset) => usersTable.refresh(reset);

  [uSearch, uRole, uStatus].forEach((el) => el.addEventListener("input", () => renderUsers(true)));
  $("#user-filters").addEventListener("submit", (e) => e.preventDefault());

  $("#user-rows").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const u = db.users.find((x) => x.id === btn.closest("tr").dataset.id);
    if (btn.dataset.act === "edit") openUserForm(u);
    if (btn.dataset.act === "delete") {
      confirmDialog({
        title: `Delete ${u.name}?`,
        message: `${u.name} will no longer be able to log in. Bills created by this user are kept.`,
        onConfirm: () => { db.users = db.users.filter((x) => x !== u); save(); refresh(); toast(`${u.name} deleted`); },
      });
    }
  });

  /* ---------- user form ---------- */
  const uf = { form: $("#user-form"), name: $("#um-name"), username: $("#um-username"), mobile: $("#um-mobile"), role: $("#um-role"), pass: $("#um-pass"), pass2: $("#um-pass2"), active: $("#um-active") };
  let editingUser = null;
  uf.mobile.addEventListener("input", () => { uf.mobile.value = uf.mobile.value.replace(/\D/g, "").slice(0, 10); });

  function openUserForm(u) {
    editingUser = u || null;
    clearErrors(uf.form);
    $("#um-title").textContent = u ? "Edit User" : "Add User";
    $("#um-submit").lastChild.textContent = u ? " Update User" : " Save User";
    $("#um-pass-label").textContent = u ? "New Password" : "Password *";
    uf.pass.placeholder = u ? "Leave empty to keep current" : "Min. 4 characters";
    uf.name.value = u ? u.name : "";
    uf.username.value = u ? u.username : "";
    uf.mobile.value = u ? u.mobile || "" : "";
    uf.role.value = u ? u.roleId : (db.roles.find((r) => !r.locked) || db.roles[0]).id;
    uf.pass.value = "";
    uf.pass2.value = "";
    uf.active.checked = u ? u.active : true;
    const self = u && u.id === me.id;
    uf.active.disabled = self;
    uf.role.disabled = self;
    $("#um-active-hint").textContent = self ? "You can't deactivate or change the role of your own account" : "Inactive users can't log in";
    openModal("user-modal");
  }
  $("#add-user-btn").addEventListener("click", () => openUserForm(null));

  uf.form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(uf.form);
    const name = uf.name.value.trim();
    const username = uf.username.value.trim().toLowerCase();
    const mobile = uf.mobile.value.trim();
    const dup = db.users.find((x) => x.username.toLowerCase() === username && x !== editingUser);
    let ok = fieldError(uf.name, name ? "" : "Enter the full name");
    ok = fieldError(uf.username, !username ? "Enter a username" : !/^[a-z0-9._]{3,20}$/.test(username) ? "3–20 letters, numbers, dots or underscores" : dup ? "This username is taken" : "") && ok;
    ok = fieldError(uf.mobile, mobile && !validMobile(mobile) ? "Enter a valid 10-digit mobile number" : "") && ok;
    const needPass = !editingUser || uf.pass.value;
    ok = fieldError(uf.pass, needPass && uf.pass.value.length < 4 ? "Use at least 4 characters" : "") && ok;
    ok = fieldError(uf.pass2, needPass && uf.pass.value !== uf.pass2.value ? "Passwords don't match" : "") && ok;
    // keep at least one active admin
    if (editingUser && isAdminRole(editingUser.roleId) && editingUser.active && activeAdmins().length <= 1 &&
        (!uf.active.checked || !isAdminRole(uf.role.value))) {
      ok = fieldError(uf.role, "There must be at least one active Admin") && false;
    }
    if (!ok) return;

    const data = { name, username, mobile, roleId: uf.role.value, active: uf.active.checked };
    if (editingUser) {
      Object.assign(editingUser, data);
      if (uf.pass.value) editingUser.password = uf.pass.value;
      toast(`${name} updated`);
    } else {
      db.users.push({ id: uid("u"), ...data, password: uf.pass.value, lastLogin: null });
      toast(`${name} added`);
    }
    save();
    closeModal();
    refresh();
    if (editingUser && editingUser.id === me.id) $("#user-name").textContent = name;
  });

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

  function refresh() { renderStats(); renderUsers(); renderRoles(); renderPerms(); }
  refresh();
})();
