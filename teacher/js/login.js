(() => {
  const form = document.getElementById("login-form");
  const usernameInput = document.getElementById("email");
  const password = document.getElementById("password");
  const toggle = document.getElementById("toggle-password");
  const error = document.getElementById("login-error");
  const submit = document.getElementById("login-submit");

  toggle.addEventListener("click", () => {
    const showing = password.type === "text";
    password.type = showing ? "password" : "text";
    toggle.textContent = showing ? "نمایش" : "پنهان";
    toggle.setAttribute("aria-label", showing ? "نمایش رمز عبور" : "پنهان کردن رمز عبور");
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    error.textContent = "";
    const username = usernameInput.value.trim();
    const secret = password.value;
    if (!username || !secret) {
      error.textContent = "ایمیل و رمز عبور را وارد کنید.";
      return;
    }
    submit.disabled = true;
    submit.textContent = "در حال بررسی اطلاعات…";
    try {
      const response = await fetch("/api/teacher/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: secret })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "ورود ناموفق بود.");
      window.location.href = "index.html";
    } catch (err) {
      error.textContent = err instanceof TypeError
        ? "اتصال به سرور برقرار نشد. ابتدا بک‌اند FileVault را راه‌اندازی کنید."
        : err.message;
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'ورود به پنل <span>←</span>';
    }
  });
})();
