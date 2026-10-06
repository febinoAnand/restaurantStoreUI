/* Login page (opened after choosing mobile or web view) */
(function () {
  "use strict";
  const { $, login, logout, fieldError, clearErrors, getView, goHome } = SR;

  // the view is chosen first; the login form always shows (any old session is ended)
  if (!getView()) { location.replace("index.html"); return; }
  logout();

  const form = $("#login-form");
  const user = $("#username");
  const pass = $("#password");
  const errorBox = $("#login-error");

  // the page takes the chosen view's layout, and shows a link back to change it
  const mobile = getView() === "mobile";
  document.body.classList.toggle("m-view", mobile);
  $("#view-chip span").textContent = mobile ? "Mobile view" : "Web view";
  $("#view-chip use").setAttribute("href", mobile ? "#i-phone" : "#i-monitor");

  $("#pass-toggle").addEventListener("click", () => {
    const show = pass.type === "password";
    pass.type = show ? "text" : "password";
    $("#pass-toggle").setAttribute("aria-label", show ? "Hide password" : "Show password");
    pass.focus();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(form);
    errorBox.hidden = true;
    let ok = fieldError(user, user.value.trim() ? "" : "Enter your username");
    ok = fieldError(pass, pass.value ? "" : "Enter your password") && ok;
    if (!ok) return;

    const res = login(user.value, pass.value);
    if (res.error) {
      errorBox.querySelector("span").textContent = res.error;
      errorBox.hidden = false;
      pass.value = "";
      pass.focus();
      return;
    }
    goHome();
  });

  user.focus();
})();
