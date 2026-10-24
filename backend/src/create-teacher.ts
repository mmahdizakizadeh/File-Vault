import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './db';
async function main() {
  const username = process.env.TEACHER_USERNAME?.trim();
  const password = process.env.TEACHER_PASSWORD;
  const displayName = process.env.TEACHER_DISPLAY_NAME?.trim() || 'استاد';
  if (!username || !password || password.length < 12) throw new Error('Set TEACHER_USERNAME and a TEACHER_PASSWORD of at least 12 characters in the environment.');
  const hash = await bcrypt.hash(password, 12);
  await prisma.teacherUser.upsert({ where: { username }, update: { passwordHash: hash, displayName, active: true }, create: { username, passwordHash: hash, displayName } });
  console.log(`Teacher account provisioned: ${username}`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
