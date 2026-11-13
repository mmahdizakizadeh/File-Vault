# FileVault — Django Backend

نسخه آغازین بک‌اند FileVault با Django، Django REST Framework و PostgreSQL. فرانت‌اند پروژه اصلی هنوز به این بسته متصل نشده، چون فایل ZIP سورس فعلی در گفتگو موجود نیست.

## پیش‌نیازها
- Python 3.11+
- PostgreSQL 14+
- pip و venv

## راه‌اندازی
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```
مقادیر اتصال PostgreSQL را در `.env` تنظیم کنید. برای اجرای محلی بدون PostgreSQL می‌توانید موقتاً `DB_ENGINE=sqlite` را در `.env` قرار دهید.

```bash
python manage.py makemigrations core
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

- Admin: `http://127.0.0.1:8000/admin/`
- Health: `GET /api/v1/health/`
- CSRF: `GET /api/v1/auth/csrf/`
- Login: `POST /api/v1/auth/login/` با `username` و `password`
- Logout: `POST /api/v1/auth/logout/`
- Public exercises: `GET /api/v1/exercises/`
- Submit: `POST /api/v1/public/exercises/{id}/submissions/` به صورت multipart با فیلدهای `first_name`, `last_name`, `student_number`, `email`, `message` و چند `files`
- Teacher exercises: `/api/v1/teacher/exercises/`
- Teacher submissions: `/api/v1/teacher/submissions/`

## نکات امنیتی مهم
- فایل‌ها در `private_uploads/` ذخیره می‌شوند. این پوشه را در وب‌سرور به‌صورت static/media عمومی سرو نکنید؛ دانلود فقط از endpointهای احراز هویت‌شده انجام شود.
- برای درخواست‌های تغییردهنده از SessionAuthentication، کوکی session و CSRF token استفاده می‌شود.
- در محیط production مقدار `DEBUG=False`، `SECRET_KEY` قوی، HTTPS و تنظیمات secure cookie را فعال کنید.
- اعتبارسنجی فعلی پسوند، اندازه و امضای ابتدایی فایل را انجام می‌دهد؛ برای DOC/DOCX/PPT/PPTX باید در مرحله سخت‌سازی با parser اختصاصی و اسکن بدافزار تکمیل شود.
- برای استفاده عمومی، محدودیت نرخ ارسال، CAPTCHA یا کنترل ضداسپم اضافه شود.

## وضعیت
این بسته اسکلت اجرایی مرحله اول است، نه تحویل نهایی production-ready. تست‌های خودکار، مهاجرت‌های تثبیت‌شده، کنترل هم‌زمانی attempt، محدودیت حجم مجموع، آزمون MIME واقعی، اتصال فرانت‌اند و تست end-to-end در مرحله بعد تکمیل می‌شوند.
