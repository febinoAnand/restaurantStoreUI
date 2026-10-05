/* Select View page (and the mobile placeholder): needs a logged-in user */
(function () {
  "use strict";
  const { $, $$, currentUser, logout, initials } = SR;
  const root = document.body.dataset.root || "";

  const user = currentUser();
  if (!user) { location.replace(root + "index.html"); return; }

  if ($("#welcome-name")) {
    $("#welcome-name").textContent = "Welcome, " + user.name;
    $("#welcome-avatar").textContent = initials(user.name);
  }
  $$("[data-logout]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    logout();
    location.href = root + "index.html";
  }));
  // web view opens the first page this user is allowed to see
  $$('a[href$="web/dashboard.html"]').forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    SR.goHome();
  }));
})();
