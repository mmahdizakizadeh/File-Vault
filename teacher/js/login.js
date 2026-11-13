(() => {
  "use strict";

  const API_BASE = "/api/v1";

  const form = document.getElementById("login-form");
  const usernameInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const togglePassword = document.getElementById("toggle-password");
  const errorElement = document.getElementById("login-error");
  const submitButton = document.getElementById("login-submit");

  if (
    !form ||
    !usernameInput ||
    !passwordInput ||
    !togglePassword ||
    !errorElement ||
    !submitButton
  ) {
    console.error("FileVault login: Required HTML elements were not found.");
    return;
  }

  let isSubmitting = false;

  function getCookie(name) {
    const cookies = document.cookie
      ? document.cookie.split(";")
      : [];

    for (const cookie of cookies) {
      const trimmedCookie = cookie.trim();

      if (trimmedCookie.startsWith(`${name}=`)) {
        return decodeURIComponent(
          trimmedCookie.substring(name.length + 1)
        );
      }
    }

    return null;
  }

  function showError(message) {
    errorElement.textContent = message;
  }

  function clearError() {
    errorElement.textContent = "";
  }

  function setLoading(loading) {
    isSubmitting = loading;
    submitButton.disabled = loading;

    const label = submitButton.querySelector(".submit-label");

    if (label) {
      label.textContent = loading
        ? "در حال ورود..."
        : "ورود به پنل";
    }

    submitButton.setAttribute(
      "aria-busy",
      String(loading)
    );
  }

  async function getCsrfToken() {
    let token = getCookie("csrftoken");

    if (token) {
      return token;
    }

    const response = await fetch(`${API_BASE}/csrf/`, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("دریافت اطلاعات امنیتی ورود ناموفق بود.");
    }

    token = getCookie("csrftoken");

    if (!token) {
      throw new Error("توکن امنیتی CSRF دریافت نشد.");
    }

    return token;
  }

  async function login(username, password) {
    const csrfToken = await getCsrfToken();

    const response = await fetch(`${API_BASE}/auth/login/`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRFToken": csrfToken
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        throw new Error(
          data.detail ||
          data.message ||
          "نام کاربری یا رمز عبور صحیح نیست."
        );
      }

      if (response.status === 403) {
        throw new Error(
          "درخواست ورود توسط سرور رد شد. لطفاً صفحه را تازه‌سازی کنید."
        );
      }

      if (response.status >= 500) {
        throw new Error(
          "خطای داخلی سرور رخ داده است. لطفاً بعداً دوباره تلاش کنید."
        );
      }

      throw new Error(
        data.detail ||
        data.message ||
        "ورود به سامانه انجام نشد."
      );
    }

    return data;
  }

  togglePassword.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";

    passwordInput.type = isPassword ? "text" : "password";

    togglePassword.textContent = isPassword
      ? "مخفی"
      : "نمایش";

    togglePassword.setAttribute(
      "aria-label",
      isPassword
        ? "مخفی کردن رمز عبور"
        : "نمایش رمز عبور"
    );

    togglePassword.setAttribute(
      "aria-pressed",
      String(isPassword)
    );
  });

  usernameInput.addEventListener("input", clearError);
  passwordInput.addEventListener("input", clearError);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    clearError();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showError("لطفاً نام کاربری و رمز عبور را وارد کنید.");
      return;
    }

    setLoading(true);

    try {
      await login(username, password);

      window.location.replace("index.html");

    } catch (error) {
      console.error("FileVault login error:", error);

      showError(
        error instanceof Error
          ? error.message
          : "ارتباط با سرور برقرار نشد."
      );

    } finally {
      setLoading(false);
    }
  });

})();