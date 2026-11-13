
(() => {
  "use strict";

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  const API_BASE = "/api/v1";

  const state = {
    universities: [],
    courses: [],
    exercises: [],
    submissions: [],
    teacher: null,
    csrfToken: ""
  };

  let selectedFiles = [];

  // --------------------------------------------------
  // API & SECURITY
  // --------------------------------------------------

  function getCookie(name) {
    const cookie = document.cookie
      .split("; ")
      .find(item => item.startsWith(`${name}=`));

    return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
  }

  async function initializeCSRF() {
    const response = await fetch(`${API_BASE}/csrf/`, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error("دریافت توکن امنیتی انجام نشد.");
    }

    state.csrfToken = getCookie("csrftoken");

    if (!state.csrfToken) {
      throw new Error("توکن CSRF در مرورگر دریافت نشد.");
    }
  }

  function getErrorMessage(payload, status) {
    if (typeof payload?.detail === "string") return payload.detail;
    if (typeof payload?.message === "string") return payload.message;
    if (typeof payload?.error === "string") return payload.error;

    if (payload && typeof payload === "object") {
      const messages = Object.values(payload)
        .flat()
        .filter(value => typeof value === "string");

      if (messages.length) return messages.join("، ");
    }

    return `خطای سرور (${status})`;
  }

  async function api(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const isFormData = options.body instanceof FormData;

    const headers = {
      Accept: "application/json",
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    };

    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const token = state.csrfToken || getCookie("csrftoken");

      if (token) {
        headers["X-CSRFToken"] = token;
      }
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      method,
      credentials: "same-origin",
      headers
    });

    if (response.status === 204) return null;

    const payload = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.href = "login.html";
      throw new Error("نشست کاربری منقضی شده است.");
    }

    if (!response.ok) {
      throw new Error(getErrorMessage(payload, response.status));
    }

    return payload;
  }

  function normalizeList(payload, keys = []) {
    if (Array.isArray(payload)) return payload;

    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.items)) return payload.items;

    for (const key of keys) {
      if (Array.isArray(payload?.[key])) return payload[key];
    }

    return [];
  }

  // --------------------------------------------------
  // GENERAL HELPERS
  // --------------------------------------------------

  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function faNumber(value) {
    return new Intl.NumberFormat("fa-IR").format(value);
  }

  function formatDate(value) {
    if (!value) return "تعیین نشده";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "long",
      day: "numeric",
      ...(String(value).includes("T")
        ? { hour: "2-digit", minute: "2-digit" }
        : {})
    }).format(date);
  }

  function normalizeDigits(value) {
    return String(value)
      .replace(/[۰-۹]/g, digit =>
        String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
      )
      .replace(/[٠-٩]/g, digit =>
        String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))
      )
      .trim();
  }

  function jalaliParts(date) {
    const parts = new Intl.DateTimeFormat(
      "en-US-u-ca-persian-nu-latn",
      {
        year: "numeric",
        month: "numeric",
        day: "numeric"
      }
    ).formatToParts(date);

    return Object.fromEntries(
      parts
        .filter(part => ["year", "month", "day"].includes(part.type))
        .map(part => [part.type, Number(part.value)])
    );
  }

  function jalaliInputToISO(value) {
    if (!value.trim()) return "";

    const normalized = normalizeDigits(value).replace(/-/g, "/");

    const match = normalized.match(
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/
    );

    if (!match) {
      throw new Error(
        "مهلت را به شکل سال/ماه/روز ساعت:دقیقه وارد کنید؛ مانند ۱۴۰۵/۰۸/۳۰ ۲۳:۵۹."
      );
    }

    const [, ys, ms, ds, hs = "23", mins = "59"] = match;

    const jy = Number(ys);
    const jm = Number(ms);
    const jd = Number(ds);
    const hour = Number(hs);
    const minute = Number(mins);

    if (
      jm < 1 || jm > 12 ||
      jd < 1 || jd > 31 ||
      hour < 0 || hour > 23 ||
      minute < 0 || minute > 59
    ) {
      throw new Error("تاریخ یا ساعت واردشده معتبر نیست.");
    }

    const start = new Date(jy + 621, 2, 18, 12, 0, 0);
    let found = null;

    for (let i = 0; i < 370; i++) {
      const candidate = new Date(start);
      candidate.setDate(start.getDate() + i);

      const parts = jalaliParts(candidate);

      if (
        parts.year === jy &&
        parts.month === jm &&
        parts.day === jd
      ) {
        found = candidate;
        break;
      }
    }

    if (!found) {
      throw new Error("تاریخ شمسی واردشده معتبر نیست.");
    }

    found.setHours(hour, minute, 0, 0);

    const pad = number => String(number).padStart(2, "0");

    return `${found.getFullYear()}-${pad(found.getMonth() + 1)}-${pad(found.getDate())}T${pad(found.getHours())}:${pad(found.getMinutes())}`;
  }

  function isoToJalaliInput(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const parts = jalaliParts(date);

    const format = number =>
      new Intl.NumberFormat("fa-IR").format(number);

    const pad = number =>
      format(number).padStart(2, "۰");

    return `${format(parts.year)}/${pad(parts.month)}/${pad(parts.day)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatSize(bytes = 0) {
    if (bytes < 1024) {
      return `${faNumber(bytes)} بایت`;
    }

    if (bytes < 1024 * 1024) {
      return `${faNumber(Math.round(bytes / 1024))} کیلوبایت`;
    }

    return `${faNumber((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
  }

  function showToast(message, type = "success") {
    const region = $("#toast-region");
    if (!region) return;

    const item = document.createElement("div");
    item.className = `toast ${type}`;
    item.textContent = message;

    region.appendChild(item);

    setTimeout(() => item.remove(), 4200);
  }

  function openModal(title, content) {
    $("#modal-title").textContent = title;
    $("#modal-content").innerHTML = content;
    $("#modal-backdrop").classList.remove("hidden");
  }

  function closeModal() {
    $("#modal-backdrop").classList.add("hidden");
  }

  function fillSelect(
    select,
    items,
    placeholder,
    valueKey = "id",
    labelKey = "name"
  ) {
    if (!select) return;

    const current = select.value;

    select.innerHTML =
      `<option value="">${escapeHTML(placeholder)}</option>` +
      items.map(item => `
        <option value="${escapeHTML(item[valueKey] ?? "")}">
          ${escapeHTML(item[labelKey] ?? "")}
        </option>
      `).join("");

    if (
      items.some(item => String(item[valueKey]) === current)
    ) {
      select.value = current;
    }
  }

  function universityName(id) {
    return state.universities.find(
      item => String(item.id) === String(id)
    )?.name || "—";
  }

  function courseName(id) {
    return state.courses.find(
      item => String(item.id) === String(id)
    )?.name || "—";
  }

  function exerciseById(id) {
    return state.exercises.find(
      item => String(item.id) === String(id)
    );
  }

  function studentName(submission) {
    return submission.studentName ||
      [
        submission.studentFirstName,
        submission.studentLastName
      ].filter(Boolean).join(" ") ||
      "—";
  }

  // --------------------------------------------------
  // DATA LOADING
  // --------------------------------------------------

  async function loadUniversities() {
    const payload = await api("/universities/");

    state.universities = normalizeList(
      payload,
      ["universities"]
    );

    [
      "#exercise-university",
      "#filter-university",
      "#submission-university"
    ].forEach(selector => {
      const placeholder = selector === "#exercise-university"
        ? "انتخاب دانشگاه"
        : "همه دانشگاه‌ها";

      fillSelect(
        $(selector),
        state.universities,
        placeholder
      );
    });
  }

  async function loadCourseCatalogs() {
    const catalogs = await Promise.all(
      state.universities.map(async university => {
        const payload = await api(
          `/universities/${encodeURIComponent(university.id)}/courses/`
        );

        const items = normalizeList(payload, ["courses"]);

        return items.map(course => ({
          ...course,
          universityId: course.universityId ?? university.id
        }));
      })
    );

    state.courses = catalogs.flat();

    fillSelect(
      $("#filter-course"),
      state.courses,
      "همه درس‌ها"
    );

    fillSelect(
      $("#submission-course"),
      state.courses,
      "همه درس‌ها"
    );
  }

  async function loadCourses(universityId) {
    let courses = [];

    if (universityId) {
      const payload = await api(
        `/universities/${encodeURIComponent(universityId)}/courses/`
      );

      courses = normalizeList(payload, ["courses"]);
    }

    fillSelect(
      $("#exercise-course"),
      courses,
      universityId
        ? "انتخاب درس"
        : "ابتدا دانشگاه را انتخاب کنید"
    );

    $("#exercise-course").disabled = !universityId;
  }

  async function loadExercises() {
    const payload = await api(
      "/teacher/exercise-series/?status=published"
    );

    const items = normalizeList(
      payload,
      ["exerciseSeries"]
    );

    state.exercises = items.filter(
      item => item.status === "published" || item.status == null
    );

    fillSelect(
      $("#submission-exercise"),
      state.exercises,
      "همه سری‌ها",
      "id",
      "title"
    );

    renderExercises();
  }

  async function loadSubmissions() {
    const payload = await api("/teacher/submissions/");

    state.submissions = normalizeList(
      payload,
      ["submissions"]
    );

    renderSubmissions();
  }

  async function loadTeacher() {
    const teacher = await api("/auth/me/");

    state.teacher = teacher;

    const name =
      teacher?.name ||
      teacher?.fullName ||
      teacher?.full_name ||
      "استاد";

    $("#sidebar-name").textContent = name;
    $("#settings-name").textContent = name;
    $("#settings-email").textContent = teacher?.email || "—";
  }

  // --------------------------------------------------
  // NAVIGATION
  // --------------------------------------------------

  function navigate(page) {
    const titles = {
      dashboard: "صفحه اصلی",
      create: $("#edit-id").value
        ? "ویرایش سری تمرین"
        : "ایجاد سری تمرین",
      exercises: "سری‌های تمرین",
      submissions: "ارسال‌های دانشجویان",
      settings: "تنظیمات"
    };

    $$(".page-section").forEach(section => {
      section.classList.toggle(
        "active",
        section.id === `page-${page}`
      );
    });

    $$(".nav-item[data-page]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    });

    $("#page-title").textContent = titles[page] || "پنل استاد";

    closeMobileSidebar();

    if (page === "exercises") renderExercises();
    if (page === "submissions") renderSubmissions();

    if (page === "settings") {
      loadTeacher().catch(error => {
        showToast(`دریافت اطلاعات استاد انجام نشد: ${error.message}`, "error");
      });
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  // --------------------------------------------------
  // EXERCISES
  // --------------------------------------------------

  function renderExercises() {
    const query = $("#exercise-search").value
      .trim()
      .toLocaleLowerCase("fa");

    const university = $("#filter-university").value;
    const course = $("#filter-course").value;

    const list = state.exercises.filter(exercise => (
      (!query || String(exercise.title || "")
        .toLocaleLowerCase("fa")
        .includes(query)) &&
      (!university || String(exercise.universityId) === university) &&
      (!course || String(exercise.courseId) === course)
    ));

    $("#exercise-count").textContent =
      `${faNumber(list.length)} سری منتشرشده`;

    $("#exercise-table-body").innerHTML = list.map(exercise => `
      <tr>
        <td>
          <div class="primary-cell">
            <strong>${escapeHTML(exercise.title)}</strong>
            <small>${escapeHTML(exercise.description || "بدون توضیحات")}</small>
          </div>
        </td>

        <td>
          <div class="stack-cell">
            <span>${escapeHTML(universityName(exercise.universityId))}</span>
            <small>${escapeHTML(courseName(exercise.courseId))}</small>
          </div>
        </td>

        <td>${escapeHTML(formatDate(exercise.deadline))}</td>

        <td>
          <div class="table-actions">
            <button
              type="button"
              class="table-action primary-action"
              data-action="edit-exercise"
              data-id="${escapeHTML(exercise.id)}"
            >
              ویرایش
            </button>
          </div>
        </td>
      </tr>
    `).join("");

    $("#exercise-empty").classList.toggle(
      "hidden",
      list.length > 0
    );
  }

  function renderSelectedFiles() {
    $("#selected-files").innerHTML = selectedFiles.length
      ? selectedFiles.map((file, index) => `
          <div class="selected-file">
            <span class="file-icon">
              ${escapeHTML(
                (file.name.split(".").pop() || "FILE")
                  .slice(0, 4)
                  .toUpperCase()
              )}
            </span>

            <div>
              <strong>${escapeHTML(file.name)}</strong>
              <small>${escapeHTML(formatSize(file.size))}</small>
            </div>

            <button
              type="button"
              class="remove-file"
              data-remove-file="${index}"
              aria-label="حذف فایل"
            >
              ×
            </button>
          </div>
        `).join("")
      : '<p class="muted file-empty">هنوز فایلی انتخاب نشده است.</p>';
  }

  function resetExerciseForm() {
    $("#exercise-form").reset();
    $("#edit-id").value = "";

    selectedFiles = [];

    $("#create-heading").textContent = "ایجاد سری تمرین";
    $("#exercise-course").disabled = true;

    $("#exercise-course").innerHTML =
      '<option value="">ابتدا دانشگاه را انتخاب کنید</option>';

    renderSelectedFiles();
  }

  async function startEditExercise(id) {
    const exercise = exerciseById(id);
    if (!exercise) return;

    resetExerciseForm();

    $("#edit-id").value = exercise.id;
    $("#exercise-title").value = exercise.title || "";
    $("#exercise-description").value = exercise.description || "";
    $("#exercise-university").value = String(exercise.universityId || "");

    await loadCourses($("#exercise-university").value);

    $("#exercise-course").value = String(exercise.courseId || "");
    $("#exercise-deadline").value = isoToJalaliInput(exercise.deadline);

    $("#create-heading").textContent = "ویرایش سری تمرین";

    navigate("create");
    renderSelectedFiles();
  }

  function validateSelectedFiles(files) {
    if (files.length > 10) {
      return "حداکثر ۱۰ فایل را می‌توانید انتخاب کنید.";
    }

    const maxSize = 10 * 1024 * 1024;
    const allowed = /\.(pdf|jpe?g|png|webp|zip|docx?|pptx?|txt)$/i;

    for (const file of files) {
      if (!allowed.test(file.name)) {
        return `فرمت فایل «${file.name}» پشتیبانی نمی‌شود.`;
      }

      if (file.size > maxSize) {
        return `حجم فایل «${file.name}» بیشتر از ۱۰ مگابایت است.`;
      }
    }

    return "";
  }

  async function saveExercise() {
    const title = $("#exercise-title").value.trim();
    const universityId = $("#exercise-university").value;
    const courseId = $("#exercise-course").value;

    if (!title || !universityId || !courseId) {
      showToast("عنوان، دانشگاه و درس را تکمیل کنید.", "error");
      return;
    }

    const selectedCourse = state.courses.find(
      course =>
        String(course.id) === courseId &&
        String(course.universityId) === universityId
    );

    if (!selectedCourse) {
      showToast(
        "درس انتخاب‌شده متعلق به دانشگاه انتخابی نیست یا اطلاعات آن دریافت نشده است.",
        "error"
      );
      return;
    }

    const formData = new FormData();

    formData.append("title", title);
    formData.append(
      "description",
      $("#exercise-description").value.trim()
    );
    formData.append("universityId", universityId);
    formData.append("courseId", courseId);

    try {
      formData.append(
        "deadline",
        jalaliInputToISO($("#exercise-deadline").value)
      );
    } catch (error) {
      showToast(error.message, "error");
      return;
    }

    selectedFiles.forEach(file => {
      formData.append("files", file, file.name);
    });

    const editId = $("#edit-id").value;
    const button = $("#publish-exercise");

    button.disabled = true;
    button.textContent = editId
      ? "در حال ذخیره تغییرات…"
      : "در حال انتشار…";

    try {
      const path = editId
        ? `/teacher/exercise-series/${encodeURIComponent(editId)}/`
        : "/teacher/exercise-series/";

      await api(path, {
        method: editId ? "PATCH" : "POST",
        body: formData
      });

      await loadExercises();

      resetExerciseForm();
      navigate("exercises");

      showToast(
        editId
          ? "تغییرات سری تمرین ذخیره شد."
          : "سری تمرین با موفقیت منتشر شد."
      );
    } catch (error) {
      showToast(
        `ذخیره سری تمرین انجام نشد: ${error.message}`,
        "error"
      );
    } finally {
      button.disabled = false;
      button.textContent = "انتشار تمرین";
    }
  }

  // --------------------------------------------------
  // SUBMISSIONS
  // --------------------------------------------------

  function renderSubmissions() {
    const query = $("#submission-search").value
      .trim()
      .toLocaleLowerCase("fa");

    const university = $("#submission-university").value;
    const course = $("#submission-course").value;
    const exercise = $("#submission-exercise").value;

    const list = state.submissions
      .filter(submission => {
        const haystack = [
          studentName(submission),
          submission.studentNumber || "",
          submission.studentEmail || submission.email || ""
        ].join(" ").toLocaleLowerCase("fa");

        return (
          (!query || haystack.includes(query)) &&
          (!university || String(submission.universityId) === university) &&
          (!course || String(submission.courseId) === course) &&
          (!exercise || String(
            submission.exerciseSeriesId ?? submission.exerciseId
          ) === exercise)
        );
      })
      .sort((a, b) =>
        new Date(b.submittedAt || 0) -
        new Date(a.submittedAt || 0)
      );

    $("#submission-count").textContent =
      `${faNumber(list.length)} ارسال`;

    $("#submission-table-body").innerHTML = list.map(submission => {
      const exerciseId =
        submission.exerciseSeriesId ?? submission.exerciseId;

      const exercise = exerciseById(exerciseId);

      const files = Array.isArray(submission.files)
        ? submission.files.length
        : 0;

      return `
        <tr>
          <td>
            <div class="student-cell">
              <div>
                <strong>${escapeHTML(studentName(submission))}</strong>
                <small>${escapeHTML(submission.studentNumber || "")}</small>
              </div>
            </div>
          </td>

          <td>
            <div class="stack-cell">
              <span>${escapeHTML(universityName(submission.universityId))}</span>
              <small>${escapeHTML(courseName(submission.courseId))}</small>
            </div>
          </td>

          <td>
            ${escapeHTML(
              exercise?.title ||
              submission.exerciseTitle ||
              submission.exerciseSeriesTitle ||
              "—"
            )}
          </td>

          <td>${escapeHTML(formatDate(submission.submittedAt))}</td>

          <td>
            <span class="count-chip">
              ${faNumber(files)} فایل
            </span>
          </td>

          <td>
            <button
              type="button"
              class="table-action primary-action"
              data-action="view-submission"
              data-id="${escapeHTML(submission.id)}"
            >
              جزئیات
            </button>
          </td>
        </tr>
      `;
    }).join("");

    $("#submission-empty").classList.toggle(
      "hidden",
      list.length > 0
    );
  }

  function renderSubmissionDetails(submission) {
    const exerciseId =
      submission.exerciseSeriesId ?? submission.exerciseId;

    const exercise = exerciseById(exerciseId);

    const files = Array.isArray(submission.files)
      ? submission.files
      : [];

    const fileHtml = files.length
      ? `
        <ul class="submission-file-list">
          ${files.map(file => {
            const fileName =
              file.name ||
              file.originalName ||
              file.original_name ||
              "فایل ارسالی";

            const fileId = file.id;

            if (!fileId || !submission.id) {
              return `<li>${escapeHTML(fileName)}</li>`;
            }

            const downloadPath =
              `${API_BASE}/teacher/submissions/` +
              `${encodeURIComponent(submission.id)}/files/` +
              `${encodeURIComponent(fileId)}/download/`;

            return `
              <li>
                <a
                  href="${escapeHTML(downloadPath)}"
                  target="_blank"
                  rel="noopener"
                >
                  ${escapeHTML(fileName)}
                </a>
              </li>
            `;
          }).join("")}
        </ul>
      `
      : "<p>فایلی ثبت نشده است.</p>";

    const email =
      submission.studentEmail ||
      submission.email ||
      "—";

    const message =
      submission.message ||
      submission.description ||
      "توضیحی ثبت نشده است.";

    openModal(
      "جزئیات ارسال",
      `
        <div class="detail-grid">

          <div>
            <span>نام دانشجو</span>
            <strong>${escapeHTML(studentName(submission))}</strong>
          </div>

          <div>
            <span>شماره دانشجویی</span>
            <strong>${escapeHTML(submission.studentNumber || "—")}</strong>
          </div>

          <div>
            <span>ایمیل</span>
            <strong>${escapeHTML(email)}</strong>
          </div>

          <div>
            <span>دانشگاه</span>
            <strong>${escapeHTML(universityName(submission.universityId))}</strong>
          </div>

          <div>
            <span>درس</span>
            <strong>${escapeHTML(courseName(submission.courseId))}</strong>
          </div>

          <div>
            <span>سری تمرین</span>
            <strong>
              ${escapeHTML(
                exercise?.title ||
                submission.exerciseTitle ||
                submission.exerciseSeriesTitle ||
                "—"
              )}
            </strong>
          </div>

          <div>
            <span>زمان ارسال</span>
            <strong>${escapeHTML(formatDate(submission.submittedAt))}</strong>
          </div>

        </div>

        <h4 class="modal-subtitle">توضیحات دانشجو</h4>
        <p>${escapeHTML(message)}</p>

        <h4 class="modal-subtitle">فایل‌های ارسالی</h4>
        ${fileHtml}
      `
    );
  }

  // --------------------------------------------------
  // MOBILE SIDEBAR
  // --------------------------------------------------

  const sidebar = $("#sidebar");
  const appLayout = $(".app-layout");

  function closeMobileSidebar() {
    sidebar.classList.remove("sidebar-open");
    appLayout.classList.remove("sidebar-visible");

    $("#mobile-menu").setAttribute(
      "aria-expanded",
      "false"
    );
  }

  // --------------------------------------------------
  // EVENT LISTENERS
  // --------------------------------------------------

  $$(".nav-item[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      navigate(button.dataset.page);
    });
  });

  $$("[data-go]").forEach(button => {
    button.addEventListener("click", () => {
      if (button.dataset.go === "create") {
        resetExerciseForm();
      }

      navigate(button.dataset.go);
    });
  });

  $("#mobile-menu").setAttribute("aria-expanded", "false");

  $("#mobile-menu").addEventListener("click", () => {
    const opened = sidebar.classList.toggle("sidebar-open");

    appLayout.classList.toggle("sidebar-visible", opened);

    $("#mobile-menu").setAttribute(
      "aria-expanded",
      String(opened)
    );
  });

  appLayout.addEventListener("click", event => {
    if (
      appLayout.classList.contains("sidebar-visible") &&
      event.target === appLayout
    ) {
      closeMobileSidebar();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeMobileSidebar();
      closeModal();
    }
  });

  // Logout

  $("#logout-button").addEventListener("click", async () => {
    const button = $("#logout-button");
    button.disabled = true;

    try {
      await api("/auth/logout/", {
        method: "POST",
        body: JSON.stringify({})
      });
    } catch (error) {
      showToast(
        `خروج از حساب به‌طور کامل تأیید نشد: ${error.message}`,
        "error"
      );

      button.disabled = false;
      return;
    }

    window.location.href = "login.html";
  });

  // Exercise university

  $("#exercise-university").addEventListener("change", async () => {
    try {
      await loadCourses($("#exercise-university").value);
    } catch (error) {
      showToast(
        `دریافت درس‌ها انجام نشد: ${error.message}`,
        "error"
      );
    }
  });

  // Exercise filters

  $("#filter-university").addEventListener("change", async () => {
    try {
      const universityId = $("#filter-university").value;

      const courses = universityId
        ? state.courses.filter(
            course => String(course.universityId) === universityId
          )
        : state.courses;

      fillSelect(
        $("#filter-course"),
        courses,
        "همه درس‌ها"
      );

      renderExercises();
    } catch (error) {
      showToast(
        `اعمال فیلتر انجام نشد: ${error.message}`,
        "error"
      );
    }
  });

  // Submission filters

  $("#submission-university").addEventListener("change", () => {
    const universityId = $("#submission-university").value;

    const courses = universityId
      ? state.courses.filter(
          course => String(course.universityId) === universityId
        )
      : state.courses;

    fillSelect(
      $("#submission-course"),
      courses,
      "همه درس‌ها"
    );

    renderSubmissions();
  });

  $("#exercise-search").addEventListener("input", renderExercises);
  $("#filter-course").addEventListener("change", renderExercises);

  [
    "#submission-course",
    "#submission-exercise",
    "#submission-search"
  ].forEach(selector => {
    $(selector).addEventListener("input", renderSubmissions);
  });

  // Exercise files

  $("#choose-files").addEventListener("click", () => {
    $("#exercise-files").click();
  });

  $("#exercise-dropzone").addEventListener("click", event => {
    if (event.target.closest("button")) return;
    if (event.target.closest("#exercise-files")) return;

    $("#exercise-files").click();
  });

  $("#exercise-files").addEventListener("change", event => {
    const incoming = [...event.target.files];

    const error = validateSelectedFiles([
      ...selectedFiles,
      ...incoming
    ]);

    if (error) {
      showToast(error, "error");
    } else {
      selectedFiles.push(...incoming);
    }

    event.target.value = "";
    renderSelectedFiles();
  });

  $("#selected-files").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-file]");
    if (!button) return;

    selectedFiles.splice(
      Number(button.dataset.removeFile),
      1
    );

    renderSelectedFiles();
  });

  // Exercise form

  $("#exercise-form").addEventListener("submit", event => {
    event.preventDefault();
    saveExercise();
  });

  $("#cancel-edit").addEventListener("click", () => {
    resetExerciseForm();
    navigate("exercises");
  });

  // Exercise table actions

  $("#exercise-table-body").addEventListener("click", event => {
    const button = event.target.closest(
      '[data-action="edit-exercise"]'
    );

    if (!button) return;

    startEditExercise(button.dataset.id).catch(error => {
      showToast(error.message, "error");
    });
  });

  // Submission table actions

  $("#submission-table-body").addEventListener("click", event => {
    const button = event.target.closest(
      '[data-action="view-submission"]'
    );

    if (!button) return;

    const submission = state.submissions.find(
      item => String(item.id) === button.dataset.id
    );

    if (submission) {
      renderSubmissionDetails(submission);
    }
  });

  // Modal

  $("#modal-close").addEventListener("click", closeModal);

  $("#modal-close-footer")?.addEventListener(
    "click",
    closeModal
  );

  $("#modal-backdrop").addEventListener("click", event => {
    if (event.target === $("#modal-backdrop")) {
      closeModal();
    }
  });

  // --------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------

  async function initialize() {
    renderSelectedFiles();

    $("#service-error").classList.add("hidden");

    try {
      await initializeCSRF();
      await loadTeacher();
    } catch (error) {
      $("#service-error").classList.remove("hidden");

      showToast(
        `احراز هویت یا اتصال اولیه انجام نشد: ${error.message}`,
        "error"
      );

      if (error.message.includes("نشست کاربری")) {
        return;
      }

      return;
    }

    // Each data section loads independently.
    // A failure in one section won't block the others.

    const tasks = [
      {
        name: "دانشگاه‌ها",
        run: loadUniversities
      },
      {
        name: "سری‌های تمرین",
        run: loadExercises
      },
      {
        name: "ارسال‌های دانشجویان",
        run: loadSubmissions
      }
    ];

    const results = await Promise.allSettled(
      tasks.map(task => task.run())
    );

    const failures = results
      .map((result, index) => ({
        result,
        name: tasks[index].name
      }))
      .filter(item => item.result.status === "rejected");

    if (failures.length) {
      $("#service-error").classList.remove("hidden");

      failures.forEach(item => {
        console.error(
          `خطا در دریافت ${item.name}:`,
          item.result.reason
        );
      });

      showToast(
        `دریافت برخی اطلاعات با مشکل مواجه شد: ${failures.map(item => item.name).join("، ")}`,
        "error"
      );
    }

    // Course catalogs depend on universities.
    if (results[0].status === "fulfilled") {
      try {
        await loadCourseCatalogs();
      } catch (error) {
        console.error("خطا در دریافت فهرست درس‌ها:", error);

        showToast(
          `دریافت فهرست درس‌ها انجام نشد: ${error.message}`,
          "error"
        );
      }
    }
  }

  initialize();
})();
