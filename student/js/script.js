const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = { answerFiles: [], lastFocusedElement: null };

const universities = [
  { id: "university-demo", name: "دانشگاه نمونه", courses: [
    { id: "combustion", name: "سوخت و احتراق" },
    { id: "fluid-mechanics", name: "مکانیک سیالات" },
    { id: "thermodynamics", name: "ترمودینامیک" },
  ]},
  { id: "university-engineering", name: "دانشگاه فنی نمونه", courses: [
    { id: "heat-transfer", name: "انتقال حرارت" },
    { id: "fluid-mechanics", name: "مکانیک سیالات" },
  ]},
];

const exerciseSeries = [
  { id: "EX-2026-001", universityId: "university-demo", courseId: "combustion", title: "سری اول تمرین سوخت و احتراق", description: "مباحث پایه احتراق، ویژگی‌های سوخت و مفاهیم اولیه تحلیل فرایندهای احتراقی.", fileName: "combustion-series-01.pdf", publishedAt: "2026-10-12", deadline: "2026-11-05", status: "published", fileAvailable: false },
  { id: "EX-2026-002", universityId: "university-demo", courseId: "combustion", title: "سری دوم تمرین سوخت و احتراق", description: "تمرین‌های محاسباتی و تحلیلی مرتبط با فرایندهای احتراق.", fileName: "combustion-series-02.pdf", publishedAt: "2026-10-19", deadline: "2026-11-12", status: "published", fileAvailable: false },
  { id: "EX-2026-003", universityId: "university-demo", courseId: "fluid-mechanics", title: "سری اول تمرین مکانیک سیالات", description: "مفاهیم پایه جریان سیال، خواص سیالات و روابط مقدماتی.", fileName: "fluid-mechanics-series-01.pdf", publishedAt: "2026-10-15", deadline: "2026-11-09", status: "published", fileAvailable: false },
  { id: "EX-2026-004", universityId: "university-engineering", courseId: "heat-transfer", title: "سری اول تمرین انتقال حرارت", description: "مفاهیم مقدماتی انتقال حرارت و روش‌های تحلیل مسائل پایه.", fileName: "heat-transfer-series-01.pdf", publishedAt: "2026-10-17", deadline: "2026-11-15", status: "published", fileAvailable: false },
  { id: "EX-DRAFT-001", universityId: "university-demo", courseId: "combustion", title: "سری پیش‌نویس", description: "این مورد منتشر نشده و در فضای دانشجو نمایش داده نمی‌شود.", fileName: "draft.pdf", publishedAt: "2026-10-20", deadline: "2026-11-20", status: "draft", fileAvailable: false },
];

const titles = { overview: "نمای کلی", exercises: "سری تمرین‌ها", submit: "آماده‌سازی پاسخ" };
const fa = (value) => new Intl.NumberFormat("fa-IR").format(value);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function formatDate(value) {
  if (!value) return "تعیین نشده";
  return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} مگابایت`;
}

function notify(message, type = "info") {
  const container = $("#toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" || type === "success" ? type : ""}`.trim();
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;
  container.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function navigate(page) {
  if (!titles[page]) return;
  $$(".page").forEach((element) => element.classList.toggle("active", element.id === page));
  $$(".nav button").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  $("#topTitle").textContent = titles[page];
  $("#sidebar").classList.remove("mobile-open");
  $("#mobileMenu").setAttribute("aria-expanded", "false");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (page === "exercises") renderSeries();
}

$$("[data-page]").forEach((button) => button.addEventListener("click", (event) => {
  event.preventDefault();
  navigate(button.dataset.page);
}));
$$("[data-go]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.go)));
$("#mobileMenu").addEventListener("click", () => {
  const isOpen = $("#sidebar").classList.toggle("mobile-open");
  $("#mobileMenu").setAttribute("aria-expanded", String(isOpen));
});

document.addEventListener("click", (event) => {
  if (window.innerWidth <= 760 && $("#sidebar").classList.contains("mobile-open") && !$("#sidebar").contains(event.target) && !$("#mobileMenu").contains(event.target)) {
    $("#sidebar").classList.remove("mobile-open");
    $("#mobileMenu").setAttribute("aria-expanded", "false");
  }
});

function findUniversity(id) { return universities.find((university) => university.id === id); }
function findCourse(universityId, courseId) { return findUniversity(universityId)?.courses.find((course) => course.id === courseId); }
function getPublishedSeries(universityId, courseId) {
  return exerciseSeries.filter((series) => series.status === "published" && series.universityId === universityId && series.courseId === courseId);
}
function isDeadlinePassed(series) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(`${series.deadline}T00:00:00`) < today;
}
function populateUniversities(select, placeholder) {
  select.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>` + universities.map((university) => `<option value="${escapeHTML(university.id)}">${escapeHTML(university.name)}</option>`).join("");
}
function populateCourses(select, universityId, placeholder) {
  const university = findUniversity(universityId);
  select.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>` + (university?.courses || []).map((course) => `<option value="${escapeHTML(course.id)}">${escapeHTML(course.name)}</option>`).join("");
  select.disabled = !university;
}
function populateSeriesSelect(select, universityId, courseId, selectedId = "") {
  const series = getPublishedSeries(universityId, courseId);
  select.innerHTML = `<option value="">انتخاب سری تمرین</option>` + series.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.title)}</option>`).join("");
  select.disabled = !universityId || !courseId || !series.length;
  if (selectedId && series.some((item) => item.id === selectedId)) select.value = selectedId;
}

function seriesCard(series) {
  const expired = isDeadlinePassed(series);
  const course = findCourse(series.universityId, series.courseId);
  const university = findUniversity(series.universityId);
  const deadlineLabel = expired ? "مهلت پایان‌یافته" : "مهلت فعال";
  return `<article class="series-card">
    <div class="series-card-top"><span class="series-badge"><span></span> منتشرشده در فهرست</span><span class="series-id">${escapeHTML(series.id)}</span></div>
    <h3>${escapeHTML(series.title)}</h3><p class="series-description">${escapeHTML(series.description)}</p>
    <div class="series-meta">
      <div><span>دانشگاه</span><strong>${escapeHTML(university?.name || "—")}</strong></div>
      <div><span>درس</span><strong>${escapeHTML(course?.name || "—")}</strong></div>
      <div><span>تاریخ انتشار</span><strong>${formatDate(series.publishedAt)}</strong></div>
      <div><span>${deadlineLabel}</span><strong class="${expired ? "deadline-expired" : "deadline-open"}">${formatDate(series.deadline)}</strong></div>
    </div>
    <div class="series-actions"><button class="btn btn-secondary" type="button" data-download="${escapeHTML(series.id)}">اطلاعات فایل تمرین <span>↓</span></button><button class="btn btn-primary" type="button" data-submit-series="${escapeHTML(series.id)}">آماده‌سازی پاسخ <span>←</span></button></div>
  </article>`;
}

function renderSeries() {
  const universityId = $("#universitySelect").value;
  const courseId = $("#courseSelect").value;
  const series = getPublishedSeries(universityId, courseId);
  const list = $("#seriesList");
  if (!universityId || !courseId) {
    list.innerHTML = `<div class="empty-card"><div class="empty-icon">▤</div><h3>دانشگاه و درس را انتخاب کن</h3><p>برای نمایش تمرین‌های مرتبط، ابتدا دانشگاه و سپس درس را انتخاب کن.</p></div>`;
    $("#seriesCount").textContent = "برای مشاهده سری‌ها، دانشگاه و درس را انتخاب کن.";
  } else if (!series.length) {
    list.innerHTML = `<div class="empty-card"><div class="empty-icon">⌕</div><h3>سری‌ای در دسترس نیست</h3><p>در حال حاضر مورد منتشرشده‌ای برای این مسیر آموزشی ثبت نشده است.</p></div>`;
    $("#seriesCount").textContent = "۰ سری در دسترس";
  } else {
    list.innerHTML = series.map(seriesCard).join("");
    $("#seriesCount").textContent = `${fa(series.length)} سری در فهرست این درس`;
  }
  updateOverview();
}

function updateOverview() {
  const universityId = $("#universitySelect").value;
  const courseId = $("#courseSelect").value;
  const series = universityId && courseId ? getPublishedSeries(universityId, courseId) : [];
  const activeDeadlines = series.filter((item) => !isDeadlinePassed(item)).length;
  $("#statSeries").textContent = fa(series.length);
  $("#statDeadlines").textContent = fa(activeDeadlines);
  const university = findUniversity(universityId);
  const course = findCourse(universityId, courseId);
  $("#statSelection").textContent = course?.name || (university ? "درس انتخاب نشده" : "انتخاب نشده");
  $("#statUniversity").textContent = university ? university.name : "دانشگاه و درس را از فهرست انتخاب کن";
}

$("#universitySelect").addEventListener("change", () => {
  populateCourses($("#courseSelect"), $("#universitySelect").value, $("#universitySelect").value ? "انتخاب درس" : "ابتدا دانشگاه را انتخاب کن");
  renderSeries();
});
$("#courseSelect").addEventListener("change", renderSeries);
$("#resetSelection").addEventListener("click", () => {
  $("#universitySelect").value = "";
  populateCourses($("#courseSelect"), "", "ابتدا دانشگاه را انتخاب کن");
  renderSeries();
  notify("انتخاب مسیر آموزشی پاک شد.", "success");
});

function syncSubmissionCourses(universityId, selectedCourse = "") {
  populateCourses($("#submissionCourse"), universityId, universityId ? "انتخاب درس" : "ابتدا دانشگاه را انتخاب کن");
  if (selectedCourse && findCourse(universityId, selectedCourse)) $("#submissionCourse").value = selectedCourse;
  syncSubmissionSeries();
}
function syncSubmissionSeries(selectedId = "") {
  const universityId = $("#submissionUniversity").value;
  const courseId = $("#submissionCourse").value;
  populateSeriesSelect($("#submissionSeries"), universityId, courseId, selectedId);
  $("#seriesHint").textContent = universityId && courseId
    ? (getPublishedSeries(universityId, courseId).length ? "فقط سری‌های منتشرشده این دانشگاه و درس نمایش داده می‌شوند." : "برای این دانشگاه و درس سری در دسترس نیست.")
    : "ابتدا دانشگاه و سپس درس را انتخاب کن.";
}
$("#submissionUniversity").addEventListener("change", () => syncSubmissionCourses($("#submissionUniversity").value));
$("#submissionCourse").addEventListener("change", () => syncSubmissionSeries());
$("#submissionSeries").addEventListener("change", () => {
  const series = exerciseSeries.find((item) => item.id === $("#submissionSeries").value && item.status === "published");
  $("#seriesHint").textContent = series ? `سری انتخاب‌شده: ${series.title}` : "ابتدا دانشگاه و سپس درس را انتخاب کن.";
});
function chooseSeriesForSubmission(seriesId) {
  const series = exerciseSeries.find((item) => item.id === seriesId && item.status === "published");
  if (!series) return;
  $("#submissionUniversity").value = series.universityId;
  syncSubmissionCourses(series.universityId, series.courseId);
  $("#submissionSeries").value = series.id;
  $("#seriesHint").textContent = `سری انتخاب‌شده: ${series.title}`;
  navigate("submit");
}

function showFileInfo(seriesId) {
  const series = exerciseSeries.find((item) => item.id === seriesId && item.status === "published");
  if (!series) return;
  const content = document.createElement("div");
  const message = document.createElement("div");
  message.className = "notice warning";
  message.textContent = "فایل اصلی این تمرین هنوز به سامانه متصل نشده است؛ بنابراین دانلودی انجام نشد. پس از راه‌اندازی پنل استاد و بارگذاری فایل، این بخش به فایل واقعی متصل خواهد شد.";
  const details = document.createElement("div");
  details.className = "detail-grid";
  details.innerHTML = `<div class="detail-item"><span>عنوان تمرین</span><strong>${escapeHTML(series.title)}</strong></div><div class="detail-item"><span>شناسه</span><strong>${escapeHTML(series.id)}</strong></div><div class="detail-item"><span>نام فایل مورد انتظار</span><strong>${escapeHTML(series.fileName)}</strong></div>`;
  content.append(message, details);
  showModal("اطلاعات فایل تمرین", content);
}
$("#seriesList").addEventListener("click", (event) => {
  const download = event.target.closest("[data-download]");
  const submit = event.target.closest("[data-submit-series]");
  if (download) showFileInfo(download.dataset.download);
  if (submit) chooseSeriesForSubmission(submit.dataset.submitSeries);
});

function fileType(name) { return name.split(".").pop().toLowerCase() === "pdf" ? "PDF" : "تصویر"; }
function fileEmoji(name) { return fileType(name) === "PDF" ? "📕" : "🖼️"; }
function addAnswerFiles(files) {
  const allowed = { jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"], webp: ["image/webp"], pdf: ["application/pdf"] };
  let added = 0;
  for (const file of files) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (!Object.hasOwn(allowed, extension) || (file.type && !allowed[extension].includes(file.type))) {
      notify(`فرمت فایل «${file.name}» پشتیبانی نمی‌شود.`, "error"); continue;
    }
    if (file.size === 0) { notify(`فایل «${file.name}» خالی است.`, "error"); continue; }
    if (file.size > 10 * 1024 * 1024) { notify(`حجم فایل «${file.name}» بیشتر از ۱۰ مگابایت است.`, "error"); continue; }
    if (state.answerFiles.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) {
      notify(`فایل «${file.name}» قبلاً انتخاب شده است.`, "error"); continue;
    }
    if (state.answerFiles.length >= 10) { notify("حداکثر ۱۰ فایل قابل انتخاب است.", "error"); break; }
    state.answerFiles.push(file); added++;
  }
  renderAnswerFiles();
  if (added) notify(`${fa(added)} فایل به فهرست پاسخ‌ها اضافه شد.`, "success");
}
function renderAnswerFiles() {
  $("#answerFileList").innerHTML = state.answerFiles.map((file, index) => `<div class="file-item"><div class="file-icon" aria-hidden="true">${fileEmoji(file.name)}</div><div class="file-meta"><strong>${escapeHTML(file.name)}</strong><span>${formatSize(file.size)} · ${fileType(file.name)}</span></div><button type="button" class="icon-button" data-remove-answer="${index}" aria-label="حذف ${escapeHTML(file.name)}">✕</button></div>`).join("");
  const totalSize = state.answerFiles.reduce((sum, file) => sum + file.size, 0);
  $("#answerFileSummary").textContent = state.answerFiles.length ? `${fa(state.answerFiles.length)} فایل انتخاب‌شده · ${formatSize(totalSize)}` : "هنوز فایلی انتخاب نشده است.";
  $("#clearAnswerFiles").disabled = !state.answerFiles.length;
}
const answerDropzone = $("#answerDropzone");
$("#chooseGallery").addEventListener("click", () => $("#answerImages").click());
$("#chooseDeviceFiles").addEventListener("click", () => $("#answerFiles").click());
answerDropzone.addEventListener("click", () => $("#answerFiles").click());
answerDropzone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); $("#answerFiles").click(); } });
$("#answerFiles").addEventListener("change", (event) => { addAnswerFiles([...event.target.files]); event.target.value = ""; });
$("#answerImages").addEventListener("change", (event) => { addAnswerFiles([...event.target.files]); event.target.value = ""; });
["dragenter", "dragover"].forEach((name) => answerDropzone.addEventListener(name, (event) => { event.preventDefault(); answerDropzone.classList.add("dragover"); }));
["dragleave", "drop"].forEach((name) => answerDropzone.addEventListener(name, (event) => { event.preventDefault(); answerDropzone.classList.remove("dragover"); }));
answerDropzone.addEventListener("drop", (event) => addAnswerFiles([...event.dataTransfer.files]));
$("#answerFileList").addEventListener("click", (event) => { const button = event.target.closest("[data-remove-answer]"); if (!button) return; state.answerFiles.splice(Number(button.dataset.removeAnswer), 1); renderAnswerFiles(); });
$("#clearAnswerFiles").addEventListener("click", () => { state.answerFiles = []; renderAnswerFiles(); notify("فهرست فایل‌ها پاک شد.", "success"); });

function showModal(title, content) {
  state.lastFocusedElement = document.activeElement;
  $("#modalTitle").textContent = title;
  $("#modalContent").replaceChildren();
  if (typeof content === "string") $("#modalContent").textContent = content;
  else $("#modalContent").append(content);
  $("#modalBackdrop").classList.add("open");
  $("#modalBackdrop").setAttribute("aria-hidden", "false");
  $("#closeModal").focus();
}
function closeModal() {
  $("#modalBackdrop").classList.remove("open");
  $("#modalBackdrop").setAttribute("aria-hidden", "true");
  state.lastFocusedElement?.focus?.();
}
$("#closeModal").addEventListener("click", closeModal);
$("#modalCloseButton").addEventListener("click", closeModal);
$("#modalBackdrop").addEventListener("click", (event) => { if (event.target === $("#modalBackdrop")) closeModal(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && $("#modalBackdrop").classList.contains("open")) closeModal(); });

function validateSubmission() {
  const requiredFields = [["#studentId", "شماره دانشجویی را وارد کن."], ["#studentName", "نام و نام خانوادگی را وارد کن."], ["#studentEmail", "ایمیل دانشجو را وارد کن."], ["#submissionUniversity", "دانشگاه را انتخاب کن."], ["#submissionCourse", "درس را انتخاب کن."], ["#submissionSeries", "سری تمرین را انتخاب کن."]];
  for (const [selector, message] of requiredFields) {
    const field = $(selector);
    if (!field.value.trim()) { notify(message, "error"); field.focus(); return false; }
    if (!field.checkValidity()) { notify("لطفاً قالب اطلاعات واردشده را بررسی کن.", "error"); field.focus(); return false; }
  }
  if (!$("#studentName").value.trim().split(/\s+/).filter(Boolean).length) { notify("نام دانشجو را بررسی کن.", "error"); $("#studentName").focus(); return false; }
  if (!state.answerFiles.length) { notify("حداقل یک فایل پاسخ انتخاب کن.", "error"); answerDropzone.focus(); return false; }
  const selectedSeries = exerciseSeries.find((item) => item.id === $("#submissionSeries").value && item.status === "published" && item.universityId === $("#submissionUniversity").value && item.courseId === $("#submissionCourse").value);
  if (!selectedSeries) { notify("سری انتخاب‌شده با دانشگاه و درس مطابقت ندارد.", "error"); return false; }
  return true;
}

$("#submissionForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validateSubmission()) return;
  const university = findUniversity($("#submissionUniversity").value);
  const course = findCourse($("#submissionUniversity").value, $("#submissionCourse").value);
  const series = exerciseSeries.find((item) => item.id === $("#submissionSeries").value);
  const files = state.answerFiles.map((file) => ({ name: file.name, size: formatSize(file.size) }));
  const content = document.createElement("div");
  const intro = document.createElement("p");
  intro.textContent = "اطلاعات زیر را پیش از ارسال نهایی بازبینی کن.";
  const details = document.createElement("div"); details.className = "detail-grid";
  details.innerHTML = `<div class="detail-item"><span>شماره دانشجویی</span><strong>${escapeHTML($("#studentId").value.trim())}</strong></div><div class="detail-item"><span>نام دانشجو</span><strong>${escapeHTML($("#studentName").value.trim())}</strong></div><div class="detail-item"><span>ایمیل</span><strong>${escapeHTML($("#studentEmail").value.trim())}</strong></div><div class="detail-item"><span>دانشگاه</span><strong>${escapeHTML(university.name)}</strong></div><div class="detail-item"><span>درس</span><strong>${escapeHTML(course.name)}</strong></div><div class="detail-item"><span>سری تمرین</span><strong>${escapeHTML(series.title)}</strong></div>`;
  const fileList = document.createElement("div"); fileList.className = "file-list";
  files.forEach((file) => { const row = document.createElement("div"); row.className = "file-item"; const icon = document.createElement("div"); icon.className = "file-icon"; icon.textContent = fileEmoji(file.name); const meta = document.createElement("div"); meta.className = "file-meta"; const name = document.createElement("strong"); name.textContent = file.name; const size = document.createElement("span"); size.textContent = file.size; meta.append(name, size); row.append(icon, meta); fileList.append(row); });
  const note = document.createElement("div"); note.className = "notice warning"; note.style.marginTop = "16px"; note.textContent = "این پیش‌نمایش نهایی است، نه رسید ارسال. اطلاعات و فایل‌ها به سرور ارسال یا به‌صورت دائمی ذخیره نمی‌شوند.";
  const actions = document.createElement("div"); actions.className = "modal-actions";
  const close = document.createElement("button"); close.className = "btn btn-primary"; close.type = "button"; close.textContent = "بازگشت و ویرایش"; close.addEventListener("click", closeModal);
  actions.append(close); content.append(intro, details, fileList, note, actions); showModal("بازبینی اطلاعات پاسخ", content);
});

populateUniversities($("#universitySelect"), "انتخاب دانشگاه");
populateUniversities($("#submissionUniversity"), "انتخاب دانشگاه");
renderSeries();
renderAnswerFiles();
