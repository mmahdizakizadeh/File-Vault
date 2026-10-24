# FileVault Backend — v1.0.0

REST API for the separate FileVault student and teacher frontends. The student does **not** create an account. Teachers authenticate. Real uploaded files are stored outside the public web root; PostgreSQL stores their metadata and associations.

## Current scope

- Teacher login/logout/me using an HttpOnly cookie and password hashes.
- Universities and courses catalog.
- Teacher publishes an exercise series immediately (no drafts), uploads one or more PDF/JPG/PNG/WEBP files, edits metadata, or archives a series.
- Students list published exercises by course, download exercise files, and submit one or more answer files with name and optional student number/email.
- Teacher filters submissions by course/exercise, sees student identity, submitted time, series, and files; teacher can download response files.
- Multiple submissions are retained as attempts. The API returns an unguessable receipt token after a successful submission.
- Server-side size/count/MIME-signature checks; private randomized filenames; file hashes; login rate limit; CORS allowlist; security headers; audit records.

## Requirements

- Node.js 20+
- PostgreSQL 15+

## Local setup

1. Create a PostgreSQL database and user.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and a random `SESSION_SECRET` (at least 32 characters).
3. Install and generate/migrate:

```bash
npm install
npm run prisma:generate
npx prisma migrate dev --name init
```

4. Provision a teacher account without putting a password in source code:

```bash
TEACHER_USERNAME=teacher TEACHER_PASSWORD='use-a-long-unique-password' TEACHER_DISPLAY_NAME='استاد' npm run admin:create
```

5. Start the API:

```bash
npm run dev
```

Health check: `GET http://localhost:4000/api/v1/health`.

## API overview

### Public student endpoints

- `GET /api/v1/universities`
- `GET /api/v1/universities/:universityId/courses`
- `GET /api/v1/exercises?courseId=...` — published, non-archived series only
- `GET /api/v1/exercises/:id`
- `GET /api/v1/exercises/:id/files/:fileId/download`
- `POST /api/v1/submissions` — multipart form fields: `exerciseSeriesId`, `studentFirstName`, `studentLastName`, optional `studentNumber`, optional `studentEmail`, plus one or more `files`

### Teacher endpoints (login first; browser sends credentials)

- `POST /api/v1/auth/login` JSON `{ "username": "...", "password": "..." }`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/universities` JSON `{ "name": "..." }`
- `POST /api/v1/courses` JSON `{ "universityId": "...", "name": "...", "code": "..." }`
- `POST /api/v1/exercises` multipart fields `courseId`, `title`, optional `description`, optional ISO-8601 `deadlineAt`, and `files`
- `GET /api/v1/exercises/teacher/list/all?courseId=...`
- `PATCH /api/v1/exercises/:id` JSON metadata fields
- `POST /api/v1/exercises/:id/archive`
- `GET /api/v1/submissions?courseId=...&exerciseSeriesId=...`
- `GET /api/v1/submissions/:id`
- `GET /api/v1/submissions/:id/files/:fileId/download`

JSON responses use `{ "data": ... }`; errors use `{ "error": { "code": "...", "message": "..." } }`.

## Important implementation notes

- No fake universities, courses, exercises, or submissions are seeded.
- Files are never served with `express.static`; downloads go through API routes.
- The allowed upload types in this initial version are PDF, JPEG, PNG and WEBP, matching the current student frontend's known file choices. Adjust only after confirming the desired types.
- The student does not authenticate, so student-entered identity fields are not verified. A receipt token is returned but a public receipt lookup endpoint is intentionally not exposed yet.
- The in-memory teacher session implementation is suitable only for local development/single-process testing. Before production, replace it with a persistent server-side session store (e.g. PostgreSQL-backed sessions), add CSRF protection appropriate to deployment, enforce HTTPS, set `COOKIE_SECURE=true`, configure backups/retention, and run security tests.
- Configure the exact origins in `CORS_ORIGINS`. For separate deployments, update the frontend API base URL and ensure cookies/credentials are configured correctly.
- Dates are accepted as ISO-8601 instants; the frontend should display and collect dates in the Solar Hijri calendar, then send a valid ISO timestamp. Store/compare UTC timestamps server-side.

## Not yet done

This is the first backend scaffold, not a production deployment. Frontend source has not yet been modified or wired to these endpoints. No live PostgreSQL connection or browser end-to-end test has been run in this environment.
