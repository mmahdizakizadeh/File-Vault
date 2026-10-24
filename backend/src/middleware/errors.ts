import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
export function notFound(_req: Request, res: Response) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'مسیر موردنظر پیدا نشد.' } }); }
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'حجم فایل از حد مجاز بیشتر است.' : err.code === 'LIMIT_FILE_COUNT' ? 'تعداد فایل‌ها بیشتر از حد مجاز است.' : 'آپلود فایل ناموفق بود.';
    res.status(400).json({ error: { code: err.code, message } }); return;
  }
  const message = err instanceof Error ? err.message : 'خطای داخلی سرور.';
  const known = /مجاز نیست|ضروری است|نامعتبر است|منقضی شده|پیدا نشد|باید|تکراری است/i.test(message);
  res.status(known ? 400 : 500).json({ error: { code: known ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: known ? message : 'خطای داخلی سرور رخ داد.' } });
  if (!known) console.error(err);
}
