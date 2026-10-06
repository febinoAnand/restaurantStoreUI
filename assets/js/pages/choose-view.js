/* Choose View (first page): mobile or web, then always the login page */
(function () {
  "use strict";
  const { $$, setView } = SR;

  $$("[data-view]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    setView(a.dataset.view);
    location.href = "login.html";
  }));
})();
