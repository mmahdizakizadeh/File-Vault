
"use strict";

/* =========================================
   FileVault — Student Panel
   Django REST Framework API Integration
========================================= */

/*
  API contract expected from Django:

  GET  /api/v1/csrf/
  GET  /api/v1/universities/
  GET  /api/v1/universities/{universityId}/courses/
  GET  /api/v1/exercises/?courseId={courseId}
  GET  /api/v1/exercises/{exerciseId}/
  GET  /api/v1/exercises/{exerciseId}/files/{fileId}/download/
  POST /api/v1/submissions/

  Submission multipart fields:
  exerciseSeriesId
  universityId
  courseId
  studentFirstName
  studentLastName
  studentNumber
  studentEmail
  message
  files (repeated)
*/

const API_BASE = "/api/v1";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  answerFiles: [],
  lastFocusedElement: null,
  universities: [],
  courses: [],
  exerciseSeries: [],
  loading: false,
  connection: "loading",
};

const titles = {
  overview: "نمای کلی",
  exercises: "سری تمرین‌ها",
  submit: "آماده‌سازی پاسخ",
};

const fa = (value) =>
  new Intl.NumberFormat("fa-IR").format(Number(value) || 0);

/* =========================================
   General utilities
========================================= */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function formatDate(value) {
  if (!value) return "تعیین نشده";

  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00`
      : value
  );

  if (Number.isNaN(date.getTime())) return "تعیین نشده";

  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} بایت`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toLocaleString("fa-IR", {
      maximumFractionDigits: 1,
    })} کیلوبایت`;
  }

  return `${(bytes / (1024 * 1024)).toLocaleString("fa-IR", {
    maximumFractionDigits: 2,
  })} مگابایت`;
}

function notify(message, type = "info") {
  const container = $("#toastContainer");
  if (!container) return;

  const toast = document.createElement("div");

  toast.className = `toast ${
    type === "error" || type === "success" ? type : ""
  }`.trim();

  toast.setAttribute(
    "role",
    type === "error" ? "alert" : "status"
  );

  toast.textContent = message;
  container.append(toast);

  window.setTimeout(() => toast.remove(), 4200);
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split(";") : [];

  for (const cookie of cookies) {
    const trimmed = cookie.trim();

    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(
        trimmed.substring(name.length + 1)
      );
    }
  }

  return null;
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.data?.results)) {
    return payload.data.results;
  }

  return [];
}

function normalizeObject(payload) {
  if (payload?.data && !Array.isArray(payload.data)) {
    return payload.data;
  }

  return payload;
}

function getErrorMessage(payload, fallback) {
  if (!payload) return fallback;

  if (typeof payload.detail === "string") {
    return payload.detail;
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }

  if (typeof payload === "object") {
    const messages = [];

    Object.entries(payload).forEach(([key, value]) => {
      if (typeof value === "string") {
        messages.push(value);
      } else if (Array.isArray(value)) {
        messages.push(...value.filter((item) => typeof item === "string"));
      }
    });

    if (messages.length) return messages.join(" ");
  }

  return fallback;
}

/* =========================================
   API client
========================================= */

async function apiRequest(path, options = {}) {
  const url = `${API_BASE}${path}`;

  const headers = new Headers(options.headers || {});
  const method = (options.method || "GET").toUpperCase();

  headers.set("Accept", "application/json");

  if (method !== "GET" && method !== "HEAD") {
    const csrfToken = getCookie("csrftoken");

    if (csrfToken) {
      headers.set("X-CSRFToken", csrfToken);
    }
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: "same-origin",
  });

  const contentType = response.headers.get("content-type") || "";

  let payload = null;

  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => null);
  } else if (!response.ok) {
    payload = {
      detail: await response.text().catch(() => ""),
    };
  }

  if (!response.ok) {
    const message = getErrorMessage(
      payload,
      `خطای سرور (${response.status})`
    );

    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;

    throw error;
  }

  return payload;
}

async function ensureCSRFToken() {
  if (getCookie("csrftoken")) return;

  await apiRequest("/csrf/");
  
  if (!getCookie("csrftoken")) {
    throw new Error(
      "توکن امنیتی CSRF دریافت نشد. تنظیمات CSRF بک‌اند را بررسی کن."
    );
  }
}

/* =========================================
   Connection status
========================================= */

function updateConnectionStatus(status, message = "") {
  state.connection = status;

  const badge = $("#connectionStatus");

  if (badge) {
    badge.classList.remove(
      "is-loading",
      "is-online",
      "is-offline"
    );

    badge.classList.add(`is-${status}`);

    const labels = {
      loading: "در حال اتصال",
      online: "متصل به سرور",
      offline: "عدم اتصال",
    };

    const label = badge.querySelector("span");

    if (label) {
      label.textContent = labels[status] || message;
    } else {
      badge.textContent = labels[status] || message;
    }
  }

  const statusElement = $("#statSubmissionStatus");

  if (statusElement) {
    statusElement.classList.remove(
      "status-online",
      "status-offline",
      "status-loading"
    );

    statusElement.classList.add(`status-${status}`);

    const labels = {
      loading: "در حال بررسی",
      online: "آماده ارسال",
      offline: "قطع ارتباط",
    };

    statusElement.textContent = labels[status] || message;
  }

  setText(
    "#statSubmissionNote",
    status === "online"
      ? "ارتباط با سامانه برقرار است."
      : status === "offline"
        ? "ارتباط با سرور برقرار نیست."
        : "در حال بررسی وضعیت سامانه..."
  );
}

async function checkServerConnection() {
  updateConnectionStatus("loading");

  try {
    await apiRequest("/universities/");
    updateConnectionStatus("online");
    return true;
  } catch (error) {
    console.error("Connection check failed:", error);
    updateConnectionStatus("offline");
    return false;
  }
}

/* =========================================
   Navigation
========================================= */

function navigate(page) {
  if (!titles[page]) return;

  $$(".page").forEach((element) => {
    element.classList.toggle("active", element.id === page);
  });

  $$(".nav button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  setText("#topTitle", titles[page]);

  $("#sidebar")?.classList.remove("mobile-open");
  $("#mobileMenu")?.setAttribute("aria-expanded", "false");

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });

  if (page === "exercises") {
    renderSeries();
  }
}

$$("[data-page]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(button.dataset.page);
  });
});

$$("[data-go]").forEach((button) => {
  button.addEventListener("click", () => {
    navigate(button.dataset.go);
  });
});

$("#mobileMenu")?.addEventListener("click", () => {
  const isOpen = $("#sidebar").classList.toggle("mobile-open");

  $("#mobileMenu").setAttribute(
    "aria-expanded",
    String(isOpen)
  );
});

document.addEventListener("click", (event) => {
  const sidebar = $("#sidebar");
  const mobileMenu = $("#mobileMenu");

  if (
    window.innerWidth <= 760 &&
    sidebar?.classList.contains("mobile-open") &&
    !sidebar.contains(event.target) &&
    !mobileMenu?.contains(event.target)
  ) {
    sidebar.classList.remove("mobile-open");
    mobileMenu?.setAttribute("aria-expanded", "false");
  }
});

/* =========================================
   Data normalization
========================================= */

function normalizeUniversity(item) {
  return {
    id: String(item.id),
    name: item.name || item.title || "دانشگاه بدون نام",
  };
}

function normalizeCourse(item) {
  return {
    id: String(item.id),
    name: item.name || item.title || "درس بدون نام",
  };
}

function normalizeSeries(item) {
  return {
    id: String(item.id),
    universityId: String(
      item.universityId ??
      item.university_id ??
      item.university?.id ??
      ""
    ),
    courseId: String(
      item.courseId ??
      item.course_id ??
      item.course?.id ??
      ""
    ),
    title: item.title || item.name || "سری تمرین بدون عنوان",
    description: item.description || "",
    publishedAt:
      item.publishedAt ||
      item.published_at ||
      item.created_at ||
      "",
    deadline:
      item.deadline ||
      item.due_date ||
      item.deadline_date ||
      "",
    status: String(item.status || "published").toLowerCase(),
    files: Array.isArray(item.files)
      ? item.files
      : Array.isArray(item.exercise_files)
        ? item.exercise_files
        : [],
  };
}

function isPublished(series) {
  return [
    "published",
    "active",
    "public",
  ].includes(series.status);
}

/* =========================================
   University and course data
========================================= */

function findUniversity(id) {
  return state.universities.find(
    (university) => university.id === String(id)
  );
}

function findCourse(courseId) {
  return state.courses.find(
    (course) => course.id === String(courseId)
  );
}

function findSeries(id) {
  return state.exerciseSeries.find(
    (series) => series.id === String(id)
  );
}

function getPublishedSeries(universityId, courseId) {
  return state.exerciseSeries.filter((series) => {
    return (
      isPublished(series) &&
      series.universityId === String(universityId) &&
      series.courseId === String(courseId)
    );
  });
}

function isDeadlinePassed(series) {
  if (!series.deadline) return false;

  const deadline = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(series.deadline)
      ? `${series.deadline}T23:59:59`
      : series.deadline
  );

  if (Number.isNaN(deadline.getTime())) return false;

  return deadline.getTime() < Date.now();
}

function populateUniversities(select, placeholder) {
  if (!select) return;

  select.innerHTML =
    `<option value="">${escapeHTML(placeholder)}</option>` +
    state.universities.map((university) => {
      return `
        <option value="${escapeHTML(university.id)}">
          ${escapeHTML(university.name)}
        </option>
      `;
    }).join("");
}

function populateCourses(select, courses, placeholder) {
  if (!select) return;

  select.innerHTML =
    `<option value="">${escapeHTML(placeholder)}</option>` +
    courses.map((course) => {
      return `
        <option value="${escapeHTML(course.id)}">
          ${escapeHTML(course.name)}
        </option>
      `;
    }).join("");

  select.disabled = !courses.length;
}

function populateSeriesSelect(select, universityId, courseId, selectedId = "") {
  if (!select) return;

  const series = getPublishedSeries(universityId, courseId);

  select.innerHTML =
    `<option value="">انتخاب سری تمرین</option>` +
    series.map((item) => {
      return `
        <option value="${escapeHTML(item.id)}">
          ${escapeHTML(item.title)}
        </option>
      `;
    }).join("");

  select.disabled = !universityId || !courseId || !series.length;

  if (selectedId && series.some((item) => item.id === selectedId)) {
    select.value = selectedId;
  }
}

/* =========================================
   Load data from Django
========================================= */

async function loadUniversities() {
  const payload = await apiRequest("/universities/");

  state.universities = normalizeList(payload)
    .map(normalizeUniversity);

  populateUniversities(
    $("#universitySelect"),
    "انتخاب دانشگاه"
  );

  populateUniversities(
    $("#submissionUniversity"),
    "انتخاب دانشگاه"
  );
}

async function loadCourses(universityId) {
  if (!universityId) {
    state.courses = [];

    populateCourses(
      $("#courseSelect"),
      [],
      "ابتدا دانشگاه را انتخاب کن"
    );

    populateCourses(
      $("#submissionCourse"),
      [],
      "ابتدا دانشگاه را انتخاب کن"
    );

    state.exerciseSeries = [];
    renderSeries();

    return [];
  }

  const payload = await apiRequest(
    `/universities/${encodeURIComponent(universityId)}/courses/`
  );

  state.courses = normalizeList(payload).map(normalizeCourse);

  return state.courses;
}

async function loadExerciseSeries(courseId) {
  if (!courseId) {
    state.exerciseSeries = [];
    return [];
  }

  const params = new URLSearchParams({
    courseId: String(courseId),
  });

  const payload = await apiRequest(
    `/exercises/?${params.toString()}`
  );

  state.exerciseSeries = normalizeList(payload)
    .map(normalizeSeries)
    .filter(isPublished);

  return state.exerciseSeries;
}

async function loadInitialData() {
  try {
    await loadUniversities();

    updateConnectionStatus("online");

    renderSeries();
    updateOverview();

  } catch (error) {
    console.error("Initial data loading failed:", error);

    updateConnectionStatus("offline");

    notify(
      "دریافت اطلاعات از سرور انجام نشد. اتصال بک‌اند را بررسی کن.",
      "error"
    );

    renderSeries();
  }
}

/* =========================================
   Exercise series
========================================= */

function seriesCard(series) {
  const expired = isDeadlinePassed(series);

  const university = findUniversity(series.universityId);
  const course = findCourse(series.courseId);

  const deadlineLabel = expired
    ? "مهلت پایان‌یافته"
    : "مهلت فعال";

  return `
    <article class="series-card">

      <div class="series-card-top">
        <span class="series-badge">
          <span></span>
          منتشرشده در فهرست
        </span>

        <span class="series-id">
          ${escapeHTML(series.id)}
        </span>
      </div>

      <h3>${escapeHTML(series.title)}</h3>

      <p class="series-description">
        ${escapeHTML(series.description)}
      </p>

      <div class="series-meta">

        <div>
          <span>دانشگاه</span>
          <strong>${escapeHTML(university?.name || "—")}</strong>
        </div>

        <div>
          <span>درس</span>
          <strong>${escapeHTML(course?.name || "—")}</strong>
        </div>

        <div>
          <span>تاریخ انتشار</span>
          <strong>${formatDate(series.publishedAt)}</strong>
        </div>

        <div>
          <span>${deadlineLabel}</span>
          <strong class="${expired ? "deadline-expired" : "deadline-open"}">
            ${formatDate(series.deadline)}
          </strong>
        </div>

      </div>

      <div class="series-actions">

        <button
          class="btn btn-secondary"
          type="button"
          data-download="${escapeHTML(series.id)}"
        >
          اطلاعات فایل تمرین
          <span>↓</span>
        </button>

        <button
          class="btn btn-primary"
          type="button"
          data-submit-series="${escapeHTML(series.id)}"
        >
          آماده‌سازی پاسخ
          <span>←</span>
        </button>

      </div>

    </article>
  `;
}

function renderSeries() {
  const universityId = $("#universitySelect")?.value || "";
  const courseId = $("#courseSelect")?.value || "";

  const list = $("#seriesList");
  if (!list) return;

  const series = getPublishedSeries(universityId, courseId);

  if (!universityId || !courseId) {
    list.innerHTML = `
      <div class="empty-card">
        <div class="empty-icon">▤</div>
        <h3>دانشگاه و درس را انتخاب کن</h3>
        <p>
          برای نمایش تمرین‌های مرتبط، ابتدا دانشگاه و سپس درس را انتخاب کن.
        </p>
      </div>
    `;

    setText(
      "#seriesCount",
      "برای مشاهده سری‌ها، دانشگاه و درس را انتخاب کن."
    );

  } else if (!series.length) {
    list.innerHTML = `
      <div class="empty-card">
        <div class="empty-icon">⌕</div>
        <h3>سری‌ای در دسترس نیست</h3>
        <p>
          در حال حاضر مورد منتشرشده‌ای برای این مسیر آموزشی ثبت نشده است.
        </p>
      </div>
    `;

    setText("#seriesCount", "۰ سری در دسترس");

  } else {
    list.innerHTML = series.map(seriesCard).join("");

    setText(
      "#seriesCount",
      `${fa(series.length)} سری در فهرست این درس`
    );
  }

  updateOverview();
}

function updateOverview() {
  const universityId = $("#universitySelect")?.value || "";
  const courseId = $("#courseSelect")?.value || "";

  const series =
    universityId && courseId
      ? getPublishedSeries(universityId, courseId)
      : [];

  const activeDeadlines = series.filter(
    (item) => !isDeadlinePassed(item)
  ).length;

  setText("#statSeries", fa(series.length));
  setText("#statDeadlines", fa(activeDeadlines));

  const university = findUniversity(universityId);
  const course = findCourse(courseId);

  setText(
    "#statSelection",
    course?.name || (university ? "درس انتخاب نشده" : "انتخاب نشده")
  );

  setText(
    "#statUniversity",
    university
      ? university.name
      : "دانشگاه و درس را از فهرست انتخاب کن"
  );
}

/* =========================================
   Main university/course selectors
========================================= */

$("#universitySelect")?.addEventListener("change", async () => {
  const universityId = $("#universitySelect").value;

  try {
    const courses = await loadCourses(universityId);

    populateCourses(
      $("#courseSelect"),
      courses,
      universityId ? "انتخاب درس" : "ابتدا دانشگاه را انتخاب کن"
    );

    state.exerciseSeries = [];
    renderSeries();

  } catch (error) {
    console.error(error);

    notify("دریافت فهرست درس‌ها انجام نشد.", "error");

    populateCourses(
      $("#courseSelect"),
      [],
      "خطا در دریافت درس‌ها"
    );
  }
});

$("#courseSelect")?.addEventListener("change", async () => {
  const courseId = $("#courseSelect").value;

  try {
    await loadExerciseSeries(courseId);
    renderSeries();

  } catch (error) {
    console.error(error);

    notify("دریافت سری تمرین‌ها انجام نشد.", "error");

    state.exerciseSeries = [];
    renderSeries();
  }
});

$("#resetSelection")?.addEventListener("click", () => {
  if ($("#universitySelect")) {
    $("#universitySelect").value = "";
  }

  state.courses = [];
  state.exerciseSeries = [];

  populateCourses(
    $("#courseSelect"),
    [],
    "ابتدا دانشگاه را انتخاب کن"
  );

  renderSeries();

  notify("انتخاب مسیر آموزشی پاک شد.", "success");
});

/* =========================================
   Submission university/course selectors
========================================= */

async function syncSubmissionCourses(universityId, selectedCourse = "") {
  const courseSelect = $("#submissionCourse");

  if (!universityId) {
    state.courses = [];

    populateCourses(
      courseSelect,
      [],
      "ابتدا دانشگاه را انتخاب کن"
    );

    state.exerciseSeries = [];

    populateSeriesSelect(
      $("#submissionSeries"),
      "",
      ""
    );

    setText(
      "#seriesHint",
      "ابتدا دانشگاه و سپس درس را انتخاب کن."
    );

    return;
  }

  try {
    const courses = await loadCourses(universityId);

    populateCourses(
      courseSelect,
      courses,
      "انتخاب درس"
    );

    if (selectedCourse && courses.some(
      (course) => course.id === selectedCourse
    )) {
      courseSelect.value = selectedCourse;

      await syncSubmissionSeries();
    } else {
      state.exerciseSeries = [];

      populateSeriesSelect(
        $("#submissionSeries"),
        universityId,
        ""
      );
    }

  } catch (error) {
    console.error(error);

    notify("دریافت درس‌های دانشگاه انجام نشد.", "error");
  }
}

async function syncSubmissionSeries(selectedId = "") {
  const universityId = $("#submissionUniversity")?.value || "";
  const courseId = $("#submissionCourse")?.value || "";

  if (!universityId || !courseId) {
    state.exerciseSeries = [];

    populateSeriesSelect(
      $("#submissionSeries"),
      universityId,
      courseId
    );

    setText(
      "#seriesHint",
      "ابتدا دانشگاه و سپس درس را انتخاب کن."
    );

    return;
  }

  try {
    await loadExerciseSeries(courseId);

    populateSeriesSelect(
      $("#submissionSeries"),
      universityId,
      courseId,
      selectedId
    );

    setText(
      "#seriesHint",
      getPublishedSeries(universityId, courseId).length
        ? "فقط سری‌های منتشرشده این دانشگاه و درس نمایش داده می‌شوند."
        : "برای این دانشگاه و درس سری در دسترس نیست."
    );

  } catch (error) {
    console.error(error);

    notify("دریافت سری تمرین‌ها انجام نشد.", "error");
  }
}

$("#submissionUniversity")?.addEventListener("change", () => {
  syncSubmissionCourses(
    $("#submissionUniversity").value
  );
});

$("#submissionCourse")?.addEventListener("change", () => {
  syncSubmissionSeries();
});

$("#submissionSeries")?.addEventListener("change", () => {
  const series = findSeries($("#submissionSeries").value);

  setText(
    "#seriesHint",
    series
      ? `سری انتخاب‌شده: ${series.title}`
      : "ابتدا دانشگاه و سپس درس را انتخاب کن."
  );
});

async function chooseSeriesForSubmission(seriesId) {
  const series = findSeries(seriesId);

  if (!series || !isPublished(series)) return;

  $("#submissionUniversity").value = series.universityId;

  await syncSubmissionCourses(
    series.universityId,
    series.courseId
  );

  $("#submissionSeries").value = series.id;

  setText(
    "#seriesHint",
    `سری انتخاب‌شده: ${series.title}`
  );

  navigate("submit");
}

/* =========================================
   Exercise file details and downloads
========================================= */

function getFileId(file) {
  return file.id ?? file.file_id ?? file.pk ?? "";
}

function getFileName(file) {
  return (
    file.original_name ||
    file.originalName ||
    file.file_name ||
    file.name ||
    "فایل تمرین"
  );
}

async function downloadExerciseFile(series, file) {
  const fileId = getFileId(file);

  if (!fileId) {
    notify("شناسه فایل در پاسخ سرور موجود نیست.", "error");
    return;
  }

  const url =
    `${API_BASE}/exercises/` +
    `${encodeURIComponent(series.id)}/files/` +
    `${encodeURIComponent(fileId)}/download/`;

  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error("دانلود فایل از سرور انجام نشد.");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = getFileName(file);

    document.body.append(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(objectUrl);

  } catch (error) {
    console.error(error);
    notify(error.message || "خطا در دانلود فایل.", "error");
  }
}

function showFileInfo(seriesId) {
  const series = findSeries(seriesId);

  if (!series) return;

  const content = document.createElement("div");

  const details = document.createElement("div");
  details.className = "detail-grid";

  details.innerHTML = `
    <div class="detail-item">
      <span>عنوان تمرین</span>
      <strong>${escapeHTML(series.title)}</strong>
    </div>

    <div class="detail-item">
      <span>شناسه</span>
      <strong>${escapeHTML(series.id)}</strong>
    </div>

    <div class="detail-item">
      <span>تاریخ انتشار</span>
      <strong>${formatDate(series.publishedAt)}</strong>
    </div>

    <div class="detail-item">
      <span>مهلت تحویل</span>
      <strong>${formatDate(series.deadline)}</strong>
    </div>
  `;

  const fileSection = document.createElement("div");
  fileSection.className = "file-list";

  if (!series.files.length) {
    const message = document.createElement("div");
    message.className = "notice warning";
    message.textContent =
      "برای این سری تمرین فایلی در سرور ثبت نشده است.";

    fileSection.append(message);

  } else {
    series.files.forEach((file) => {
      const row = document.createElement("div");
      row.className = "file-item";

      const icon = document.createElement("div");
      icon.className = "file-icon";
      icon.textContent = "📄";

      const meta = document.createElement("div");
      meta.className = "file-meta";

      const name = document.createElement("strong");
      name.textContent = getFileName(file);

      const size = document.createElement("span");
      size.textContent = file.size
        ? formatSize(Number(file.size))
        : "فایل تمرین";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-secondary";
      button.textContent = "دانلود";

      button.addEventListener("click", () => {
        downloadExerciseFile(series, file);
      });

      meta.append(name, size);
      row.append(icon, meta, button);
      fileSection.append(row);
    });
  }

  content.append(details, fileSection);

  showModal("اطلاعات فایل تمرین", content);
}

$("#seriesList")?.addEventListener("click", async (event) => {
  const download = event.target.closest("[data-download]");
  const submit = event.target.closest("[data-submit-series]");

  if (download) {
    showFileInfo(download.dataset.download);
  }

  if (submit) {
    await chooseSeriesForSubmission(
      submit.dataset.submitSeries
    );
  }
});

/* =========================================
   Answer file validation and selection
========================================= */

function fileType(name) {
  return name.split(".").pop().toLowerCase() === "pdf"
    ? "PDF"
    : "تصویر";
}

function fileEmoji(name) {
  return fileType(name) === "PDF" ? "📕" : "🖼️";
}

function addAnswerFiles(files) {
  const allowed = {
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    png: ["image/png"],
    webp: ["image/webp"],
    pdf: ["application/pdf"],
  };

  let added = 0;

  for (const file of files) {
    const extension = file.name.split(".").pop().toLowerCase();

    if (
      !Object.hasOwn(allowed, extension) ||
      (file.type && !allowed[extension].includes(file.type))
    ) {
      notify(
        `فرمت فایل «${file.name}» پشتیبانی نمی‌شود.`,
        "error"
      );
      continue;
    }

    if (file.size === 0) {
      notify(`فایل «${file.name}» خالی است.`, "error");
      continue;
    }

    if (file.size > 10 * 1024 * 1024) {
      notify(
        `حجم فایل «${file.name}» بیشتر از ۱۰ مگابایت است.`,
        "error"
      );
      continue;
    }

    const duplicate = state.answerFiles.some((item) => {
      return (
        item.name === file.name &&
        item.size === file.size &&
        item.lastModified === file.lastModified
      );
    });

    if (duplicate) {
      notify(`فایل «${file.name}» قبلاً انتخاب شده است.`, "error");
      continue;
    }

    if (state.answerFiles.length >= 10) {
      notify("حداکثر ۱۰ فایل قابل انتخاب است.", "error");
      break;
    }

    state.answerFiles.push(file);
    added++;
  }

  renderAnswerFiles();

  if (added) {
    notify(
      `${fa(added)} فایل به فهرست پاسخ‌ها اضافه شد.`,
      "success"
    );
  }
}

function renderAnswerFiles() {
  const list = $("#answerFileList");
  if (!list) return;

  list.innerHTML = state.answerFiles.map((file, index) => {
    return `
      <div class="file-item">

        <div class="file-icon" aria-hidden="true">
          ${fileEmoji(file.name)}
        </div>

        <div class="file-meta">
          <strong>${escapeHTML(file.name)}</strong>
          <span>${formatSize(file.size)} · ${fileType(file.name)}</span>
        </div>

        <button
          type="button"
          class="icon-button"
          data-remove-answer="${index}"
          aria-label="حذف ${escapeHTML(file.name)}"
        >
          ✕
        </button>

      </div>
    `;
  }).join("");

  const totalSize = state.answerFiles.reduce(
    (sum, file) => sum + file.size,
    0
  );

  setText(
    "#answerFileSummary",
    state.answerFiles.length
      ? `${fa(state.answerFiles.length)} فایل انتخاب‌شده · ${formatSize(totalSize)}`
      : "هنوز فایلی انتخاب نشده است."
  );

  const clearButton = $("#clearAnswerFiles");

  if (clearButton) {
    clearButton.disabled = !state.answerFiles.length;
  }
}

const answerDropzone = $("#answerDropzone");

$("#chooseGallery")?.addEventListener("click", () => {
  $("#answerImages")?.click();
});

$("#chooseDeviceFiles")?.addEventListener("click", () => {
  $("#answerFiles")?.click();
});

answerDropzone?.addEventListener("click", (event) => {
  if (event.target.closest("button")) return;
  $("#answerFiles")?.click();
});

answerDropzone?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    $("#answerFiles")?.click();
  }
});

$("#answerFiles")?.addEventListener("change", (event) => {
  addAnswerFiles([...event.target.files]);
  event.target.value = "";
});

$("#answerImages")?.addEventListener("change", (event) => {
  addAnswerFiles([...event.target.files]);
  event.target.value = "";
});

["dragenter", "dragover"].forEach((name) => {
  answerDropzone?.addEventListener(name, (event) => {
    event.preventDefault();
    answerDropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((name) => {
  answerDropzone?.addEventListener(name, (event) => {
    event.preventDefault();
    answerDropzone.classList.remove("dragover");
  });
});

answerDropzone?.addEventListener("drop", (event) => {
  addAnswerFiles([...event.dataTransfer.files]);
});

$("#answerFileList")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-answer]");
  if (!button) return;

  state.answerFiles.splice(
    Number(button.dataset.removeAnswer),
    1
  );

  renderAnswerFiles();
});

$("#clearAnswerFiles")?.addEventListener("click", () => {
  state.answerFiles = [];

  renderAnswerFiles();

  notify("فهرست فایل‌ها پاک شد.", "success");
});

/* =========================================
   Modal
========================================= */

function showModal(title, content) {
  const backdrop = $("#modalBackdrop");
  const modalContent = $("#modalContent");

  if (!backdrop || !modalContent) return;

  state.lastFocusedElement = document.activeElement;

  setText("#modalTitle", title);

  modalContent.replaceChildren();

  if (typeof content === "string") {
    modalContent.textContent = content;
  } else {
    modalContent.append(content);
  }

  backdrop.classList.add("open");
  backdrop.setAttribute("aria-hidden", "false");

  $("#closeModal")?.focus();
}

function closeModal() {
  const backdrop = $("#modalBackdrop");
  if (!backdrop) return;

  backdrop.classList.remove("open");
  backdrop.setAttribute("aria-hidden", "true");

  state.lastFocusedElement?.focus?.();
}

$("#closeModal")?.addEventListener("click", closeModal);
$("#modalCloseButton")?.addEventListener("click", closeModal);

$("#modalBackdrop")?.addEventListener("click", (event) => {
  if (event.target === $("#modalBackdrop")) {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    $("#modalBackdrop")?.classList.contains("open")
  ) {
    closeModal();
  }
});

/* =========================================
   Submission validation
========================================= */

function validateSubmission() {
  const requiredFields = [
    ["#studentFirstName", "نام دانشجو را وارد کن."],
    ["#studentLastName", "نام خانوادگی را وارد کن."],
    ["#studentNumber", "شماره دانشجویی را وارد کن."],
    ["#studentEmail", "ایمیل دانشجو را وارد کن."],
    ["#submissionUniversity", "دانشگاه را انتخاب کن."],
    ["#submissionCourse", "درس را انتخاب کن."],
    ["#submissionSeries", "سری تمرین را انتخاب کن."],
  ];

  for (const [selector, message] of requiredFields) {
    const field = $(selector);

    if (!field || !field.value.trim()) {
      notify(message, "error");
      field?.focus();
      return false;
    }

    if (!field.checkValidity()) {
      notify(
        "لطفاً قالب اطلاعات واردشده را بررسی کن.",
        "error"
      );

      field.focus();
      return false;
    }
  }

  if (!state.answerFiles.length) {
    notify("حداقل یک فایل پاسخ انتخاب کن.", "error");
    answerDropzone?.focus();
    return false;
  }

  const universityId = $("#submissionUniversity").value;
  const courseId = $("#submissionCourse").value;
  const seriesId = $("#submissionSeries").value;

  const selectedSeries = state.exerciseSeries.find((item) => {
    return (
      item.id === seriesId &&
      isPublished(item) &&
      item.universityId === universityId &&
      item.courseId === courseId
    );
  });

  if (!selectedSeries) {
    notify(
      "سری انتخاب‌شده با دانشگاه و درس مطابقت ندارد.",
      "error"
    );
    return false;
  }

  return true;
}

/* =========================================
   Submission review
========================================= */

function createDetail(label, value) {
  const item = document.createElement("div");
  item.className = "detail-item";

  const title = document.createElement("span");
  title.textContent = label;

  const content = document.createElement("strong");
  content.textContent = value || "—";

  item.append(title, content);

  return item;
}

function createReviewContent() {
  const university = findUniversity(
    $("#submissionUniversity").value
  );

  const course = findCourse(
    $("#submissionCourse").value
  );

  const series = findSeries(
    $("#submissionSeries").value
  );

  const firstName = $("#studentFirstName").value.trim();
  const lastName = $("#studentLastName").value.trim();

  const content = document.createElement("div");

  const intro = document.createElement("p");
  intro.textContent =
    "اطلاعات زیر را پیش از ارسال نهایی بازبینی کن.";

  const details = document.createElement("div");
  details.className = "detail-grid";

  details.append(
    createDetail(
      "نام و نام خانوادگی",
      `${firstName} ${lastName}`
    ),
    createDetail(
      "شماره دانشجویی",
      $("#studentNumber").value.trim()
    ),
    createDetail(
      "ایمیل",
      $("#studentEmail").value.trim()
    ),
    createDetail("دانشگاه", university?.name),
    createDetail("درس", course?.name),
    createDetail("سری تمرین", series?.title)
  );

  const message = $("#message")?.value.trim();

  if (message) {
    details.append(
      createDetail("توضیحات", message)
    );
  }

  const fileList = document.createElement("div");
  fileList.className = "file-list";

  state.answerFiles.forEach((file) => {
    const row = document.createElement("div");
    row.className = "file-item";

    const icon = document.createElement("div");
    icon.className = "file-icon";
    icon.textContent = fileEmoji(file.name);

    const meta = document.createElement("div");
    meta.className = "file-meta";

    const name = document.createElement("strong");
    name.textContent = file.name;

    const size = document.createElement("span");
    size.textContent = formatSize(file.size);

    meta.append(name, size);
    row.append(icon, meta);
    fileList.append(row);
  });

  const note = document.createElement("div");
  note.className = "notice warning";
  note.style.marginTop = "16px";
  note.textContent =
    "با تأیید نهایی، اطلاعات و فایل‌های انتخاب‌شده به سامانه ارسال می‌شوند.";

  const actions = document.createElement("div");
  actions.className = "modal-actions";

  const editButton = document.createElement("button");
  editButton.className = "btn btn-secondary";
  editButton.type = "button";
  editButton.textContent = "بازگشت و ویرایش";
  editButton.addEventListener("click", closeModal);

  const submitButton = document.createElement("button");
  submitButton.className = "btn btn-primary";
  submitButton.type = "button";
  submitButton.textContent = "تأیید و ارسال پاسخ";

  submitButton.addEventListener("click", submitAnswer);

  actions.append(editButton, submitButton);

  content.append(
    intro,
    details,
    fileList,
    note,
    actions
  );

  return content;
}

/* =========================================
   Submission request
========================================= */

function setSubmitLoading(loading) {
  state.loading = loading;

  const button = $("#submitButton");

  if (button) {
    button.disabled = loading;
    button.classList.toggle("is-loading", loading);

    const text = button.querySelector("span");

    if (text) {
      text.textContent = loading
        ? "در حال ارسال..."
        : "ارسال پاسخ";
    }
  }
}

async function submitAnswer() {
  if (state.loading) return;

  if (!validateSubmission()) {
    closeModal();
    return;
  }

  setSubmitLoading(true);

  try {
    await ensureCSRFToken();

    const formData = new FormData();

    formData.append(
      "exerciseSeriesId",
      $("#submissionSeries").value
    );

    formData.append(
      "universityId",
      $("#submissionUniversity").value
    );

    formData.append(
      "courseId",
      $("#submissionCourse").value
    );

    formData.append(
      "studentFirstName",
      $("#studentFirstName").value.trim()
    );

    formData.append(
      "studentLastName",
      $("#studentLastName").value.trim()
    );

    formData.append(
      "studentNumber",
      $("#studentNumber").value.trim()
    );

    formData.append(
      "studentEmail",
      $("#studentEmail").value.trim()
    );

    const message = $("#message")?.value.trim();

    if (message) {
      formData.append("message", message);
    }

    state.answerFiles.forEach((file) => {
      formData.append("files", file, file.name);
    });

    const result = await apiRequest("/submissions/", {
      method: "POST",
      body: formData,
    });

    const data = normalizeObject(result);

    closeModal();

    showSubmissionSuccess(data);

  } catch (error) {
    console.error("Submission failed:", error);

    closeModal();

    notify(
      error.message || "ارسال پاسخ انجام نشد. دوباره تلاش کن.",
      "error"
    );

  } finally {
    setSubmitLoading(false);
  }
}

/* =========================================
   Submission result
========================================= */

function showSubmissionSuccess(data) {
  const receipt =
    data.receiptToken ||
    data.receipt_token ||
    data.receipt ||
    data.token ||
    data.id ||
    "";

  const content = document.createElement("div");

  const notice = document.createElement("div");
  notice.className = "notice success";
  notice.textContent =
    "پاسخ شما با موفقیت به سامانه ارسال شد.";

  content.append(notice);

  if (receipt) {
    const receiptBox = document.createElement("div");
    receiptBox.className = "submission-receipt";

    const title = document.createElement("strong");
    title.textContent = "شناسه پیگیری ارسال";

    const code = document.createElement("code");
    code.textContent = String(receipt);

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "btn btn-secondary";
    copyButton.textContent = "کپی شناسه پیگیری";

    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(String(receipt));
        notify("شناسه پیگیری کپی شد.", "success");
      } catch {
        notify(
          "کپی خودکار انجام نشد؛ شناسه را انتخاب و کپی کن.",
          "error"
        );
      }
    });

    receiptBox.append(title, code, copyButton);
    content.append(receiptBox);
  }

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "btn btn-primary";
  closeButton.textContent = "متوجه شدم";
  closeButton.addEventListener("click", closeModal);

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  actions.append(closeButton);

  content.append(actions);

  showModal("ثبت موفق پاسخ", content);

  state.answerFiles = [];
  renderAnswerFiles();

  $("#submissionForm")?.reset();

  populateCourses(
    $("#submissionCourse"),
    [],
    "ابتدا دانشگاه را انتخاب کن"
  );

  populateSeriesSelect(
    $("#submissionSeries"),
    "",
    ""
  );

  setText(
    "#seriesHint",
    "ابتدا دانشگاه و سپس درس را انتخاب کن."
  );

  setText(
    "#submissionNotice",
    "پاسخ شما با موفقیت ثبت شد."
  );

  notify("پاسخ با موفقیت ارسال شد.", "success");
}

/* =========================================
   Form submit — review before sending
========================================= */

$("#submissionForm")?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (state.loading) return;

  if (!validateSubmission()) return;

  showModal(
    "بازبینی اطلاعات پاسخ",
    createReviewContent()
  );
});

/* =========================================
   Application initialization
========================================= */

async function initializeStudentPanel() {
  renderAnswerFiles();

  updateConnectionStatus("loading");

  try {
    await loadInitialData();

  } catch (error) {
    console.error("Student panel initialization failed:", error);

    updateConnectionStatus("offline");

    notify(
      "راه‌اندازی پنل دانشجو با مشکل مواجه شد.",
      "error"
    );
  }
}

initializeStudentPanel();
