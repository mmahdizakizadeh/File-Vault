import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { prisma } from './db';
import { authRouter } from './routes/auth';
import { catalogRouter } from './routes/catalog';
import { exerciseRouter } from './routes/exercises';
import { submissionRouter } from './routes/submissions';
import { errorHandler, notFound } from './middleware/errors';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin(origin, callback) { if (!origin || config.corsOrigins.includes(origin)) callback(null, true); else callback(new Error('Origin is not allowed by CORS')); }, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
// Minimal cookie parser to avoid exposing file storage as a public static directory.
app.use((req, _res, next) => { const raw = req.headers.cookie ?? ''; const cookies: Record<string, string> = {}; for (const item of raw.split(';')) { const i = item.indexOf('='); if (i > 0) { try { cookies[item.slice(0, i).trim()] = decodeURIComponent(item.slice(i + 1).trim()); } catch {} } } (req as express.Request & { cookies: Record<string, string> }).cookies = cookies; next(); });
app.get('/api/v1/health', (_req, res) => res.json({ data: { status: 'ok', service: 'filevault-api' } }));
app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }), authRouter);
app.use('/api/v1', catalogRouter);
app.use('/api/v1/exercises', exerciseRouter);
app.use('/api/v1/submissions', submissionRouter);
app.use(notFound);
app.use(errorHandler);

const server = app.listen(config.port, () => console.log(`FileVault API listening on http://localhost:${config.port}`));
async function shutdown() { server.close(); await prisma.$disconnect(); process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
