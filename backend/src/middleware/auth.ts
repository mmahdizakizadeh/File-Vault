import type { Request, Response, NextFunction } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

const sessions = new Map<string, { id: string; username: string; displayName: string; expiresAt: number }>();
// In-memory sessions are for local development only. Production deployment must use a persistent shared session store.
export function createSession(teacher: { id: string; username: string; displayName: string }) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { ...teacher, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  return token;
}
export function destroySession(token: string | undefined) { if (token) sessions.delete(token); }
export function requireTeacher(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.fv_session as string | undefined;
  const session = token ? sessions.get(token) : undefined;
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'برای ادامه وارد پنل استاد شوید.' } });
    return;
  }
  req.teacher = { id: session.id, username: session.username, displayName: session.displayName };
  next();
}
export function setSessionCookie(res: Response, token: string) {
  res.cookie('fv_session', token, { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', path: '/', maxAge: 8 * 60 * 60 * 1000 });
}
export function clearSessionCookie(res: Response) { res.clearCookie('fv_session', { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', path: '/' }); }
export function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
