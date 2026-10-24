import 'dotenv/config';
import path from 'node:path';

const required = ['DATABASE_URL', 'SESSION_SECRET'] as const;
for (const key of required) {
  if (!process.env[key]?.trim()) throw new Error(`Missing required environment variable: ${key}`);
}
if ((process.env.SESSION_SECRET ?? '').length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters.');
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5500').split(',').map(x => x.trim()).filter(Boolean),
  sessionSecret: process.env.SESSION_SECRET!,
  storageDir: path.resolve(process.env.STORAGE_DIR ?? './storage'),
  maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_MB ?? 10) * 1024 * 1024,
  maxFilesPerUpload: Number(process.env.MAX_FILES_PER_UPLOAD ?? 10),
  cookieSecure: process.env.COOKIE_SECURE === 'true'
};
