import { Router } from 'express';
import { prisma } from '../db';
import { requireTeacher } from '../middleware/auth';
import { z } from 'zod';
export const catalogRouter = Router();

catalogRouter.get('/universities', async (_req, res) => {
  const data = await prisma.university.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  res.json({ data });
});
catalogRouter.get('/universities/:universityId/courses', async (req, res) => {
  const data = await prisma.course.findMany({ where: { universityId: req.params.universityId, active: true, university: { active: true } }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, universityId: true } });
  res.json({ data });
});
catalogRouter.post('/universities', requireTeacher, async (req, res) => {
  const p = z.object({ name: z.string().trim().min(2).max(160) }).safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'نام دانشگاه معتبر نیست.' } }); return; }
  const data = await prisma.university.create({ data: p.data }); res.status(201).json({ data });
});
catalogRouter.post('/courses', requireTeacher, async (req, res) => {
  const p = z.object({ universityId: z.string().min(1), name: z.string().trim().min(2).max(160), code: z.string().trim().max(40).optional() }).safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'اطلاعات درس معتبر نیست.' } }); return; }
  const data = await prisma.course.create({ data: p.data }); res.status(201).json({ data });
});
