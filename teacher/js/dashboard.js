(() => {
  "use strict";

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const API_BASE = "/api";
  const state = { universities: [], courses: [], exercises: [], submissions: [], teacher: null };
  let selectedFiles = [];

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "same-origin",
      ...options,
      headers: options.body instanceof FormData
        ? { ...(options.headers || {}) }
        : { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || `خطای سرور (${response.status})`);
    return payload;
  }

  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
  }
  function faNumber(value) { return new Intl.NumberFormat("fa-IR").format(value); }
  function formatDate(value) {
    if (!value) return "تعیین نشده";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric", month: "long", day: "numeric",
      ...(String(value).includes("T") ? { hour: "2-digit", minute: "2-digit" } : {})
    }).format(date);
  }
  function normalizeDigits(value) {
    return String(value).replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).trim();
  }
  function jalaliParts(date) {
    const parts = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { year:"numeric", month:"numeric", day:"numeric" }).formatToParts(date);
    return Object.fromEntries(parts.filter(part => ["year", "month", "day"].includes(part.type)).map(part => [part.type, Number(part.value)]));
  }
  function jalaliInputToISO(value) {
    if (!value.trim()) return "";
    const normalized = normalizeDigits(value).replace(/-/g, "/");
    const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (!match) throw new Error("مهلت را به شکل سال/ماه/روز ساعت:دقیقه وارد کنید؛ مانند ۱۴۰۵/۰۸/۳۰ ۲۳:۵۹.");
    const [, ys, ms, ds, hs = "23", mins = "59"] = match;
    const jy = Number(ys), jm = Number(ms), jd = Number(ds), hour = Number(hs), minute = Number(mins);
    if (jm < 1 || jm > 12 || jd < 1 || jd > 31 || hour > 23 || minute > 59) throw new Error("تاریخ یا ساعت واردشده معتبر نیست.");
    const start = new Date(jy + 621, 2, 18, 12, 0, 0);
    let found = null;
    for (let i = 0; i < 370; i++) {
      const candidate = new Date(start);
      candidate.setDate(start.getDate() + i);
      const parts = jalaliParts(candidate);
      if (parts.year === jy && parts.month === jm && parts.day === jd) { found = candidate; break; }
    }
    if (!found) throw new Error("تاریخ شمسی واردشده معتبر نیست.");
    found.setHours(hour, minute, 0, 0);
    const pad = n => String(n).padStart(2, "0");
    return `${found.getFullYear()}-${pad(found.getMonth()+1)}-${pad(found.getDate())}T${pad(found.getHours())}:${pad(found.getMinutes())}`;
  }
  function isoToJalaliInput(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const p = jalaliParts(date);
    const pad = n => String(n).padStart(2, "0");
    return `${new Intl.NumberFormat("fa-IR").format(p.year)}/${new Intl.NumberFormat("fa-IR").format(p.month).padStart(2, "۰")}/${new Intl.NumberFormat("fa-IR").format(p.day).padStart(2, "۰")} ${new Intl.NumberFormat("fa-IR").format(date.getHours()).padStart(2, "۰")}:${new Intl.NumberFormat("fa-IR").format(date.getMinutes()).padStart(2, "۰")}`;
  }

  function formatSize(bytes = 0) {
    if (bytes < 1024) return `${faNumber(bytes)} بایت`;
    if (bytes < 1024 * 1024) return `${faNumber(Math.round(bytes / 1024))} کیلوبایت`;
    return `${faNumber((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
  }
  function showToast(message, type = "success") {
    const region = $("#toast-region");
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
  function closeModal() { $("#modal-backdrop").classList.add("hidden"); }
  function fillSelect(select, items, placeholder, valueKey = "id", labelKey = "name") {
    const current = select.value;
    select.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>` + items.map(item =>
      `<option value="${escapeHTML(item[valueKey])}">${escapeHTML(item[labelKey])}</option>`).join("");
    if (items.some(item => String(item[valueKey]) === current)) select.value = current;
  }
  function universityName(id) { return state.universities.find(item => String(item.id) === String(id))?.name || "—"; }
  function courseName(id) { return state.courses.find(item => String(item.id) === String(id))?.name || "—"; }
  function exerciseById(id) { return state.exercises.find(item => String(item.id) === String(id)); }

  async function loadUniversities() {
    const payload = await api("/universities");
    state.universities = Array.isArray(payload) ? payload : (payload.items || payload.universities || []);
    ["#exercise-university", "#filter-university", "#submission-university"].forEach(selector => {
      fillSelect($(selector), state.universities, selector === "#exercise-university" ? "انتخاب دانشگاه" : "همه دانشگاه‌ها");
    });
  }
  async function loadCourseCatalogs() {
    const catalogs = await Promise.all(state.universities.map(async university => {
      const payload = await api(`/universities/${encodeURIComponent(university.id)}/courses`);
      const items = Array.isArray(payload) ? payload : (payload.items || payload.courses || []);
      return items.map(course => ({ ...course, universityId: course.universityId ?? university.id }));
    }));
    state.courses = catalogs.flat();
    fillSelect($("#filter-course"), state.courses, "همه درس‌ها");
    fillSelect($("#submission-course"), state.courses, "همه درس‌ها");
  }
  async function loadCourses(universityId) {
    let coursesForUniversity = [];
    if (universityId) {
      const payload = await api(`/universities/${encodeURIComponent(universityId)}/courses`);
      coursesForUniversity = Array.isArray(payload) ? payload : (payload.items || payload.courses || []);
    }
    fillSelect($("#exercise-course"), coursesForUniversity, universityId ? "انتخاب درس" : "ابتدا دانشگاه را انتخاب کنید");
    $("#exercise-course").disabled = !universityId;
  }
  async function loadExercises() {
    const payload = await api("/teacher/exercise-series?status=published");
    const items = Array.isArray(payload) ? payload : (payload.items || payload.exerciseSeries || []);
    state.exercises = items.filter(item => item.status === "published" || item.status == null);
    fillSelect($("#submission-exercise"), state.exercises, "همه سری‌ها", "id", "title");
    renderExercises();
  }
  async function loadSubmissions() {
    const payload = await api("/teacher/submissions");
    state.submissions = Array.isArray(payload) ? payload : (payload.items || payload.submissions || []);
    renderSubmissions();
  }
  async function loadTeacher() {
    const teacher = await api("/teacher/me");
    state.teacher = teacher;
    const name = teacher?.name || teacher?.fullName || "استاد";
    $("#sidebar-name").textContent = name;
    $("#settings-name").textContent = name;
    $("#settings-email").textContent = teacher?.email || "—";
  }

  function navigate(page) {
    const titles = { dashboard:"صفحه اصلی", create: $("#edit-id").value ? "ویرایش سری تمرین" : "ایجاد سری تمرین", exercises:"سری‌های تمرین", submissions:"ارسال‌های دانشجویان", settings:"تنظیمات" };
    $$(".page-section").forEach(section => section.classList.toggle("active", section.id === `page-${page}`));
    $$(".nav-item[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === page));
    $("#page-title").textContent = titles[page] || "پنل استاد";
    closeMobileSidebar();
    if (page === "exercises") renderExercises();
    if (page === "submissions") renderSubmissions();
    if (page === "settings") loadTeacher().catch(() => {});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderExercises() {
    const query = $("#exercise-search").value.trim().toLocaleLowerCase("fa");
    const uni = $("#filter-university").value;
    const course = $("#filter-course").value;
    const list = state.exercises.filter(ex =>
      (!query || String(ex.title || "").toLocaleLowerCase("fa").includes(query)) &&
      (!uni || String(ex.universityId) === uni) && (!course || String(ex.courseId) === course));
    $("#exercise-count").textContent = `${faNumber(list.length)} سری منتشرشده`;
    $("#exercise-table-body").innerHTML = list.map(ex => `
      <tr>
        <td><div class="primary-cell"><strong>${escapeHTML(ex.title)}</strong><small>${escapeHTML(ex.description || "بدون توضیحات")}</small></div></td>
        <td><div class="stack-cell"><span>${escapeHTML(universityName(ex.universityId))}</span><small>${escapeHTML(courseName(ex.courseId))}</small></div></td>
        <td>${escapeHTML(formatDate(ex.deadline))}</td>
        <td><div class="table-actions"><button class="table-action primary-action" data-action="edit-exercise" data-id="${escapeHTML(ex.id)}">ویرایش</button></div></td>
      </tr>`).join("");
    $("#exercise-empty").classList.toggle("hidden", list.length > 0);
  }

  function renderSubmissions() {
    const query = $("#submission-search").value.trim().toLocaleLowerCase("fa");
    const uni = $("#submission-university").value;
    const course = $("#submission-course").value;
    const exercise = $("#submission-exercise").value;
    const list = state.submissions.filter(sub => {
      const haystack = `${sub.studentName || ""} ${sub.studentNumber || ""} ${sub.email || ""}`.toLocaleLowerCase("fa");
      return (!query || haystack.includes(query)) && (!uni || String(sub.universityId) === uni) &&
        (!course || String(sub.courseId) === course) && (!exercise || String(sub.exerciseId) === exercise);
    }).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    $("#submission-count").textContent = `${faNumber(list.length)} ارسال`;
    $("#submission-table-body").innerHTML = list.map(sub => {
      const ex = exerciseById(sub.exerciseId);
      const files = Array.isArray(sub.files) ? sub.files.length : 0;
      return `<tr>
        <td><div class="student-cell"><div><strong>${escapeHTML(sub.studentName || "—")}</strong><small>${escapeHTML(sub.studentNumber || "")}</small></div></div></td>
        <td><div class="stack-cell"><span>${escapeHTML(universityName(sub.universityId))}</span><small>${escapeHTML(courseName(sub.courseId))}</small></div></td>
        <td>${escapeHTML(ex?.title || sub.exerciseTitle || "—")}</td>
        <td>${escapeHTML(formatDate(sub.submittedAt))}</td>
        <td><span class="count-chip">${faNumber(files)} فایل</span></td>
        <td><button class="table-action primary-action" data-action="view-submission" data-id="${escapeHTML(sub.id)}">جزئیات</button></td>
      </tr>`;
    }).join("");
    $("#submission-empty").classList.toggle("hidden", list.length > 0);
  }

  function renderSelectedFiles() {
    $("#selected-files").innerHTML = selectedFiles.length ? selectedFiles.map((file, index) => `
      <div class="selected-file"><span class="file-icon">${escapeHTML((file.name.split(".").pop() || "FILE").slice(0, 4).toUpperCase())}</span>
      <div><strong>${escapeHTML(file.name)}</strong><small>${escapeHTML(formatSize(file.size))}</small></div>
      <button type="button" class="remove-file" data-remove-file="${index}" aria-label="حذف فایل">×</button></div>`).join("") : '<p class="muted file-empty">هنوز فایلی انتخاب نشده است.</p>';
  }
  function resetExerciseForm() {
    $("#exercise-form").reset();
    $("#edit-id").value = "";
    selectedFiles = [];
    $("#create-heading").textContent = "ایجاد سری تمرین";
    $("#exercise-course").disabled = true;
    $("#exercise-course").innerHTML = '<option value="">ابتدا دانشگاه را انتخاب کنید</option>';
    renderSelectedFiles();
  }
  async function startEditExercise(id) {
    const ex = exerciseById(id);
    if (!ex) return;
    resetExerciseForm();
    $("#edit-id").value = ex.id;
    $("#exercise-title").value = ex.title || "";
    $("#exercise-description").value = ex.description || "";
    $("#exercise-university").value = String(ex.universityId || "");
    await loadCourses($("#exercise-university").value);
    $("#exercise-course").value = String(ex.courseId || "");
    $("#exercise-deadline").value = isoToJalaliInput(ex.deadline);
    navigate("create");
    renderSelectedFiles();
  }
  function validateSelectedFiles(files) {
    if (files.length > 10) return "حداکثر ۱۰ فایل را می‌توانید انتخاب کنید.";
    const max = 10 * 1024 * 1024;
    const allowed = /\.(pdf|jpe?g|png|webp|zip|docx?|pptx?|txt)$/i;
    for (const file of files) {
      if (!allowed.test(file.name)) return `فرمت فایل «${file.name}» پشتیبانی نمی‌شود.`;
      if (file.size > max) return `حجم فایل «${file.name}» بیشتر از ۱۰ مگابایت است.`;
    }
    return "";
  }
  async function saveExercise() {
    const title = $("#exercise-title").value.trim();
    const universityId = $("#exercise-university").value;
    const courseId = $("#exercise-course").value;
    if (!title || !universityId || !courseId) return showToast("عنوان، دانشگاه و درس را تکمیل کنید.", "error");
    if (!state.courses.some(course => String(course.id) === courseId)) return showToast("درس معتبر برای دانشگاه انتخاب‌شده دریافت نشده است.", "error");
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", $("#exercise-description").value.trim());
    formData.append("universityId", universityId);
    formData.append("courseId", courseId);
    try {
      formData.append("deadline", jalaliInputToISO($("#exercise-deadline").value));
    } catch (error) {
      showToast(error.message, "error");
      return;
    }
    selectedFiles.forEach(file => formData.append("files", file, file.name));
    const editId = $("#edit-id").value;
    const button = $("#publish-exercise");
    button.disabled = true;
    button.textContent = "در حال انتشار…";
    try {
      await api(editId ? `/teacher/exercise-series/${encodeURIComponent(editId)}` : "/teacher/exercise-series", {
        method: editId ? "PATCH" : "POST", body: formData
      });
      await loadExercises();
      resetExerciseForm();
      navigate("exercises");
      showToast("سری تمرین با موفقیت منتشر شد.");
    } catch (error) {
      showToast(`انتشار انجام نشد: ${error.message}. اتصال بک‌اند و دسترسی حساب را بررسی کنید.`, "error");
    } finally {
      button.disabled = false;
      button.textContent = "انتشار تمرین";
    }
  }
  function renderSubmissionDetails(sub) {
    const ex = exerciseById(sub.exerciseId);
    const files = Array.isArray(sub.files) ? sub.files : [];
    const fileHtml = files.length ? `<ul>${files.map(file => `<li>${escapeHTML(file.name || file.originalName || "فایل")}</li>`).join("")}</ul>` : "<p>فایلی ثبت نشده است.</p>";
    openModal("جزئیات ارسال", `<div class="detail-grid"><div><span>نام دانشجو</span><strong>${escapeHTML(sub.studentName || "—")}</strong></div><div><span>شماره دانشجویی</span><strong>${escapeHTML(sub.studentNumber || "—")}</strong></div><div><span>دانشگاه</span><strong>${escapeHTML(universityName(sub.universityId))}</strong></div><div><span>درس</span><strong>${escapeHTML(courseName(sub.courseId))}</strong></div><div><span>سری تمرین</span><strong>${escapeHTML(ex?.title || sub.exerciseTitle || "—")}</strong></div><div><span>زمان ارسال</span><strong>${escapeHTML(formatDate(sub.submittedAt))}</strong></div></div><h4 class="modal-subtitle">فایل‌های ارسالی</h4>${fileHtml}`);
  }

  const sidebar = $("#sidebar");
  const appLayout = $(".app-layout");
  function closeMobileSidebar() {
    sidebar.classList.remove("sidebar-open");
    appLayout.classList.remove("sidebar-visible");
    $("#mobile-menu").setAttribute("aria-expanded", "false");
  }

  $$(".nav-item[data-page]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
  $$('[data-go]').forEach(button => button.addEventListener("click", () => {
    if (button.dataset.go === "create") resetExerciseForm();
    navigate(button.dataset.go);
  }));
  $("#mobile-menu").setAttribute("aria-expanded", "false");
  $("#mobile-menu").addEventListener("click", () => {
    const opened = sidebar.classList.toggle("sidebar-open");
    appLayout.classList.toggle("sidebar-visible", opened);
    $("#mobile-menu").setAttribute("aria-expanded", String(opened));
  });
  appLayout.addEventListener("click", event => { if (appLayout.classList.contains("sidebar-visible") && event.target === appLayout) closeMobileSidebar(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") { closeMobileSidebar(); closeModal(); } });
  $("#logout-button").addEventListener("click", async () => {
    try { await api("/teacher/logout", { method: "POST", body: JSON.stringify({}) }); } catch (_) {}
    window.location.href = "login.html";
  });
  $("#exercise-university").addEventListener("change", async () => {
    try { await loadCourses($("#exercise-university").value); }
    catch (error) { showToast(`دریافت درس‌ها انجام نشد: ${error.message}`, "error"); }
  });
  $("#filter-university").addEventListener("change", async () => {
    try {
      const uni = $("#filter-university").value;
      const payload = uni ? await api(`/universities/${encodeURIComponent(uni)}/courses`) : [];
      const filterCourses = Array.isArray(payload) ? payload : (payload.items || payload.courses || []);
      fillSelect($("#filter-course"), filterCourses, "همه درس‌ها");
      renderExercises();
    } catch (error) { showToast(`دریافت درس‌ها انجام نشد: ${error.message}`, "error"); }
  });
  $("#submission-university").addEventListener("change", async () => {
    try {
      const uni = $("#submission-university").value;
      const payload = uni ? await api(`/universities/${encodeURIComponent(uni)}/courses`) : [];
      const items = Array.isArray(payload) ? payload : (payload.items || payload.courses || []);
      fillSelect($("#submission-course"), items, "همه درس‌ها");
      renderSubmissions();
    } catch (error) { showToast(`دریافت درس‌ها انجام نشد: ${error.message}`, "error"); }
  });
  ["#exercise-search", "#filter-course"].forEach(selector => $(selector).addEventListener("input", renderExercises));
  ["#submission-course", "#submission-exercise", "#submission-search"].forEach(selector => $(selector).addEventListener("input", renderSubmissions));
  $("#choose-files").addEventListener("click", () => $("#exercise-files").click());
  $("#exercise-dropzone").addEventListener("click", event => {
    if (event.target.closest("button")) return;
    if (event.target.closest("#exercise-files")) return;
    $("#exercise-files").click();
  });
  $("#exercise-files").addEventListener("change", event => {
    const incoming = [...event.target.files];
    const error = validateSelectedFiles([...selectedFiles, ...incoming]);
    if (error) showToast(error, "error");
    else selectedFiles.push(...incoming);
    event.target.value = "";
    renderSelectedFiles();
  });
  $("#selected-files").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-file]");
    if (!button) return;
    selectedFiles.splice(Number(button.dataset.removeFile), 1);
    renderSelectedFiles();
  });
  $("#exercise-form").addEventListener("submit", event => { event.preventDefault(); saveExercise(); });
  $("#cancel-edit").addEventListener("click", () => { resetExerciseForm(); navigate("exercises"); });
  $("#exercise-table-body").addEventListener("click", event => {
    const button = event.target.closest('[data-action="edit-exercise"]');
    if (button) startEditExercise(button.dataset.id).catch(error => showToast(error.message, "error"));
  });
  $("#submission-table-body").addEventListener("click", event => {
    const button = event.target.closest('[data-action="view-submission"]');
    if (button) {
      const sub = state.submissions.find(item => String(item.id) === button.dataset.id);
      if (sub) renderSubmissionDetails(sub);
    }
  });
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal-close-footer")?.addEventListener("click", closeModal);
  $("#modal-backdrop").addEventListener("click", event => { if (event.target === $("#modal-backdrop")) closeModal(); });

  async function initialize() {
    renderSelectedFiles();
    try {
      await loadTeacher();
      await loadUniversities();
      await loadCourseCatalogs();
      await loadExercises();
      await loadSubmissions();
    } catch (error) {
      $("#service-error").classList.remove("hidden");
      showToast("اتصال به سرویس برقرار نشد. هیچ دادهٔ ساختگی بارگذاری نشده است.", "error");
      $("#exercise-empty").classList.remove("hidden");
      $("#submission-empty").classList.remove("hidden");
    }
  }
  initialize();
})();
