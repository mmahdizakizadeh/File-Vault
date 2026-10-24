import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { clearSessionCookie, createSession, destroySession, requireTeacher, setSessionCookie } from '../middleware/auth';
export const authRouter = Router();
const loginSchema = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) });
authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'نام کاربری و رمز عبور را وارد کنید.' } }); return; }
  const teacher = await prisma.teacherUser.findUnique({ where: { username: parsed.data.username } });
  if (!teacher || !teacher.active || !(await bcrypt.compare(parsed.data.password, teacher.passwordHash))) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'نام کاربری یا رمز عبور صحیح نیست.' } }); return;
  }
  const token = createSession({ id: teacher.id, username: teacher.username, displayName: teacher.displayName });
  setSessionCookie(res, token);
  await prisma.auditLog.create({ data: { teacherId: teacher.id, action: 'TEACHER_LOGIN', entityType: 'TeacherUser', entityId: teacher.id } });
  res.json({ data: { id: teacher.id, username: teacher.username, displayName: teacher.displayName } });
});
authRouter.post('/logout', (req, res) => { destroySession(req.cookies?.fv_session); clearSessionCookie(res); res.json({ data: { loggedOut: true } }); });
authRouter.get('/me', requireTeacher, (req, res) => res.json({ data: req.teacher }));
