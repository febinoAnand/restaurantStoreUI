/* Login page */
(function () {
  "use strict";
  const { $, login, currentUser, fieldError, clearErrors } = SR;

  if (currentUser()) { location.replace("select-view.html"); return; }

  const form = $("#login-form");
  const user = $("#username");
  const pass = $("#password");
  const errorBox = $("#login-error");

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
    location.href = "select-view.html";
  });

  user.focus();
})();
