import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db';
import { requireTeacher } from '../middleware/auth';
import { config } from '../config';
import { removeStoredFile, safeDownloadName, storeValidatedFile, readStoredFile } from '../utils/files';
export const exerciseRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxFileSizeBytes, files: config.maxFilesPerUpload } });
const metadata = z.object({ courseId: z.string().min(1), title: z.string().trim().min(2).max(200), description: z.string().trim().max(5000).optional().or(z.literal('')), deadlineAt: z.string().datetime().optional().or(z.literal('')) });

// Public: students see published, non-archived series only.
exerciseRouter.get('/', async (req, res) => {
  const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : undefined;
  if (!courseId) { res.status(400).json({ error: { code: 'COURSE_REQUIRED', message: 'انتخاب درس ضروری است.' } }); return; }
  const data = await prisma.exerciseSeries.findMany({ where: { courseId, archivedAt: null, course: { active: true, university: { active: true } } }, orderBy: { publishedAt: 'desc' }, select: { id: true, courseId: true, title: true, description: true, deadlineAt: true, publishedAt: true, files: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } } });
  res.json({ data });
});
exerciseRouter.get('/teacher/list/all', requireTeacher, async (req, res) => {
  const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : undefined;
  const data = await prisma.exerciseSeries.findMany({ where: { ...(courseId ? { courseId } : {}), archivedAt: null }, orderBy: { publishedAt: 'desc' }, include: { course: { include: { university: true } }, files: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } }, _count: { select: { submissions: true } } } });
  res.json({ data });
});
exerciseRouter.get('/:id', async (req, res) => {
  const data = await prisma.exerciseSeries.findFirst({ where: { id: req.params.id, archivedAt: null }, select: { id: true, courseId: true, title: true, description: true, deadlineAt: true, publishedAt: true, files: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } } });
  if (!data) { res.status(404).json({ error: { code: 'EXERCISE_NOT_FOUND', message: 'مجموعه تمرین پیدا نشد.' } }); return; }
  res.json({ data });
});
exerciseRouter.get('/:id/files/:fileId/download', async (req, res) => {
  const file = await prisma.exerciseFile.findFirst({ where: { id: req.params.fileId, exerciseSeriesId: req.params.id, exerciseSeries: { archivedAt: null } } });
  if (!file) { res.status(404).json({ error: { code: 'FILE_NOT_FOUND', message: 'فایل پیدا نشد.' } }); return; }
  const content = await readStoredFile(file.storedName);
  res.setHeader('Content-Type', file.mimeType); res.setHeader('Content-Length', String(content.length)); res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeDownloadName(file.originalName))}"`); res.send(content);
});

// Teacher: publish immediately; there is no draft state.
exerciseRouter.post('/', requireTeacher, upload.array('files', config.maxFilesPerUpload), async (req, res) => {
  const p = metadata.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'عنوان، درس یا مهلت تمرین معتبر نیست.' } }); return; }
  const files = (req.files ?? []) as Express.Multer.File[];
  if (!files.length) { res.status(400).json({ error: { code: 'FILES_REQUIRED', message: 'حداقل یک فایل صورت تمرین بارگذاری کنید.' } }); return; }
  const course = await prisma.course.findFirst({ where: { id: p.data.courseId, active: true, university: { active: true } } });
  if (!course) { res.status(400).json({ error: { code: 'COURSE_INVALID', message: 'درس انتخاب‌شده معتبر نیست.' } }); return; }
  const saved: Awaited<ReturnType<typeof storeValidatedFile>>[] = [];
  try {
    for (const file of files) saved.push(await storeValidatedFile(file));
    const created = await prisma.$transaction(async tx => {
      const series = await tx.exerciseSeries.create({ data: { courseId: p.data.courseId, createdById: req.teacher!.id, title: p.data.title, description: p.data.description || null, deadlineAt: p.data.deadlineAt ? new Date(p.data.deadlineAt) : null } });
      await tx.exerciseFile.createMany({ data: saved.map(f => ({ ...f, exerciseSeriesId: series.id })) });
      await tx.auditLog.create({ data: { teacherId: req.teacher!.id, action: 'EXERCISE_PUBLISHED', entityType: 'ExerciseSeries', entityId: series.id } });
      return tx.exerciseSeries.findUnique({ where: { id: series.id }, include: { files: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } } });
    });
    res.status(201).json({ data: created });
  } catch (e) { await Promise.all(saved.map(f => removeStoredFile(f.storedName).catch(() => undefined))); throw e; }
});
exerciseRouter.patch('/:id', requireTeacher, async (req, res) => {
  const p = z.object({ title: z.string().trim().min(2).max(200).optional(), description: z.string().trim().max(5000).nullable().optional(), deadlineAt: z.string().datetime().nullable().optional() }).safeParse(req.body);
  if (!p.success || !Object.keys(p.data ?? {}).length) { res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'اطلاعات ویرایش معتبر نیست.' } }); return; }
  const id = req.params.id;
  if (typeof id !== 'string') {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'شناسه معتبر نیست.' } });
    return;
  }
  const current = await prisma.exerciseSeries.findFirst({ where: { id, archivedAt: null } });
  if (!current) { res.status(404).json({ error: { code: 'EXERCISE_NOT_FOUND', message: 'مجموعه تمرین پیدا نشد.' } }); return; }
  const data = await prisma.exerciseSeries.update({ where: { id: current.id }, data: { ...p.data, ...(p.data.deadlineAt !== undefined ? { deadlineAt: p.data.deadlineAt ? new Date(p.data.deadlineAt) : null } : {}) } });
  await prisma.auditLog.create({ data: { teacherId: req.teacher!.id, action: 'EXERCISE_UPDATED', entityType: 'ExerciseSeries', entityId: current.id } });
  res.json({ data });
});
exerciseRouter.post('/:id/archive', requireTeacher, async (req, res) => {
  const id = req.params.id;
  if (typeof id !== 'string') {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'شناسه معتبر نیست.' } });
    return;
  }
  const current = await prisma.exerciseSeries.findFirst({ where: { id, archivedAt: null } });
  if (!current) { res.status(404).json({ error: { code: 'EXERCISE_NOT_FOUND', message: 'مجموعه تمرین پیدا نشد.' } }); return; }
  const data = await prisma.exerciseSeries.update({ where: { id: current.id }, data: { archivedAt: new Date() } });
  await prisma.auditLog.create({ data: { teacherId: req.teacher!.id, action: 'EXERCISE_ARCHIVED', entityType: 'ExerciseSeries', entityId: current.id } });
  res.json({ data });
});
