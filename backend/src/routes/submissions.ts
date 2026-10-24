import { Router } from 'express';
import multer from 'multer';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db';
import { requireTeacher } from '../middleware/auth';
import { config } from '../config';
import { readStoredFile, removeStoredFile, safeDownloadName, storeValidatedFile } from '../utils/files';
export const submissionRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxFileSizeBytes, files: config.maxFilesPerUpload } });
const schema = z.object({ exerciseSeriesId: z.string().min(1), studentFirstName: z.string().trim().min(1).max(100), studentLastName: z.string().trim().min(1).max(100), studentNumber: z.string().trim().max(50).optional().or(z.literal('')), studentEmail: z.string().trim().email().max(200).optional().or(z.literal('')) });

submissionRouter.post('/', upload.array('files', config.maxFilesPerUpload), async (req, res) => {
  const p = schema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'مشخصات دانشجو یا شناسه تمرین معتبر نیست.' } }); return; }
  const files = (req.files ?? []) as Express.Multer.File[];
  if (!files.length) { res.status(400).json({ error: { code: 'FILES_REQUIRED', message: 'حداقل یک فایل پاسخ بارگذاری کنید.' } }); return; }
  const exercise = await prisma.exerciseSeries.findFirst({ where: { id: p.data.exerciseSeriesId, archivedAt: null, course: { active: true, university: { active: true } } }, select: { id: true, courseId: true, deadlineAt: true } });
  if (!exercise) { res.status(404).json({ error: { code: 'EXERCISE_NOT_FOUND', message: 'مجموعه تمرین منتشرشده پیدا نشد.' } }); return; }
  if (exercise.deadlineAt && Date.now() > exercise.deadlineAt.getTime()) { res.status(400).json({ error: { code: 'DEADLINE_PASSED', message: 'مهلت ارسال این تمرین به پایان رسیده است.' } }); return; }
  const saved: Awaited<ReturnType<typeof storeValidatedFile>>[] = [];
  try {
    for (const file of files) saved.push(await storeValidatedFile(file));
    const token = randomBytes(32).toString('hex');
    const existingCount = await prisma.submission.count({ where: { exerciseSeriesId: exercise.id, ...(p.data.studentNumber ? { studentNumber: p.data.studentNumber } : { studentFirstName: p.data.studentFirstName, studentLastName: p.data.studentLastName }) } });
    const created = await prisma.$transaction(async tx => {
      const submission = await tx.submission.create({ data: { exerciseSeriesId: exercise.id, courseId: exercise.courseId, studentFirstName: p.data.studentFirstName, studentLastName: p.data.studentLastName, studentNumber: p.data.studentNumber || null, studentEmail: p.data.studentEmail || null, attemptNumber: existingCount + 1, receiptTokenHash: createHash('sha256').update(token).digest('hex') } });
      await tx.submissionFile.createMany({ data: saved.map(f => ({ ...f, submissionId: submission.id })) });
      return submission;
    });
    res.status(201).json({ data: { submissionId: created.id, submittedAt: created.submittedAt, attemptNumber: created.attemptNumber, receiptToken: token, message: 'پاسخ شما با موفقیت ثبت شد.' } });
  } catch (e) { await Promise.all(saved.map(f => removeStoredFile(f.storedName).catch(() => undefined))); throw e; }
});

// Private teacher endpoints: every record links the student identity, series and actual stored files.
// Teacher dashboard: only students who have submitted at least once are listed.
// Student accounts are not created; a normalized student number (when provided) is the grouping key.
submissionRouter.get('/students', requireTeacher, async (req, res) => {
  const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : undefined;
  if (!courseId) { res.status(400).json({ error: { code: 'COURSE_REQUIRED', message: 'انتخاب درس ضروری است.' } }); return; }
  const course = await prisma.course.findFirst({ where: { id: courseId }, select: { id: true } });
  if (!course) { res.status(404).json({ error: { code: 'COURSE_NOT_FOUND', message: 'درس پیدا نشد.' } }); return; }
  const [series, submissions] = await Promise.all([
    prisma.exerciseSeries.findMany({ where: { courseId, archivedAt: null }, select: { id: true, title: true, publishedAt: true } }),
    prisma.submission.findMany({ where: { courseId }, orderBy: { submittedAt: 'desc' }, include: { exerciseSeries: { select: { id: true, title: true } }, files: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } } })
  ]);
  const grouped = new Map<string, { studentFirstName: string; studentLastName: string; studentNumber: string | null; studentEmail: string | null; lastSubmittedAt: Date; submissions: typeof submissions }>();
  for (const sub of submissions) {
    const identity = sub.studentNumber?.trim().toLocaleLowerCase() || `${sub.studentFirstName.trim().toLocaleLowerCase()}|${sub.studentLastName.trim().toLocaleLowerCase()}`;
    const key = `${courseId}|${identity}`;
    const current = grouped.get(key);
    if (!current) grouped.set(key, { studentFirstName: sub.studentFirstName, studentLastName: sub.studentLastName, studentNumber: sub.studentNumber, studentEmail: sub.studentEmail, lastSubmittedAt: sub.submittedAt, submissions: [sub] });
    else { current.submissions.push(sub); if (sub.submittedAt > current.lastSubmittedAt) current.lastSubmittedAt = sub.submittedAt; if (!current.studentEmail && sub.studentEmail) current.studentEmail = sub.studentEmail; }
  }
  const data = [...grouped.values()].map(student => {
    const submittedSeriesIds = new Set(student.submissions.map(s => s.exerciseSeriesId));
    return { studentFirstName: student.studentFirstName, studentLastName: student.studentLastName, studentNumber: student.studentNumber, studentEmail: student.studentEmail, lastSubmittedAt: student.lastSubmittedAt, completedAllPublishedSeries: series.length > 0 && series.every(s => submittedSeriesIds.has(s.id)), submittedSeriesCount: submittedSeriesIds.size, publishedSeriesCount: series.length, series: series.map(s => ({ ...s, submitted: submittedSeriesIds.has(s.id), submissions: student.submissions.filter(sub => sub.exerciseSeriesId === s.id).map(sub => ({ id: sub.id, submittedAt: sub.submittedAt, attemptNumber: sub.attemptNumber, files: sub.files })) })) };
  }).sort((a, b) => b.lastSubmittedAt.getTime() - a.lastSubmittedAt.getTime());
  res.json({ data });
});

submissionRouter.get('/', requireTeacher, async (req, res) => {
  const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : undefined;
  const exerciseSeriesId = typeof req.query.exerciseSeriesId === 'string' ? req.query.exerciseSeriesId : undefined;
  const data = await prisma.submission.findMany({ where: { ...(courseId ? { courseId } : {}), ...(exerciseSeriesId ? { exerciseSeriesId } : {}) }, orderBy: { submittedAt: 'desc' }, include: { course: { include: { university: true } }, exerciseSeries: { select: { id: true, title: true, publishedAt: true } }, files: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true } } } });
  res.json({ data });
});
submissionRouter.get('/:id', requireTeacher, async (req, res) => {
  const id = req.params.id;
  if (typeof id !== 'string') {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'شناسه معتبر نیست.' } });
    return;
  }
  const data = await prisma.submission.findUnique({ where: { id }, include: { course: { include: { university: true } }, exerciseSeries: { select: { id: true, title: true, deadlineAt: true } }, files: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true } } } });
  if (!data) { res.status(404).json({ error: { code: 'SUBMISSION_NOT_FOUND', message: 'ارسال پیدا نشد.' } }); return; }
  res.json({ data });
});
submissionRouter.get('/:id/files/:fileId/download', requireTeacher, async (req, res) => {
  const id = req.params.id;
  const fileId = req.params.fileId;
  if (typeof id !== 'string' || typeof fileId !== 'string') {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'شناسه معتبر نیست.' } });
    return;
  }
  const file = await prisma.submissionFile.findFirst({ where: { id: fileId, submissionId: id } });
  if (!file) { res.status(404).json({ error: { code: 'FILE_NOT_FOUND', message: 'فایل پاسخ پیدا نشد.' } }); return; }
  const content = await readStoredFile(file.storedName);
  res.setHeader('Content-Type', file.mimeType); res.setHeader('Content-Length', String(content.length)); res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeDownloadName(file.originalName))}"`); res.send(content);
});
