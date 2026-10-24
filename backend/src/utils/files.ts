import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { config } from '../config';

const allowed = new Map<string, string>([
  ['application/pdf', '.pdf'], ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp']
]);
export type StoredFile = { originalName: string; storedName: string; mimeType: string; sizeBytes: number; sha256: string };

export async function storeValidatedFile(file: Express.Multer.File): Promise<StoredFile> {
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !allowed.has(detected.mime) || allowed.get(detected.mime) !== detected.ext.toLowerCase().replace('jpeg', 'jpg').replace('jpg', '.jpg').replace('png', '.png').replace('webp', '.webp').replace('pdf', '.pdf')) {
    // Explicit signature allow-list; never trust the browser-supplied MIME type.
    if (!detected || !allowed.has(detected.mime)) throw new Error(`نوع فایل «${file.originalname}» مجاز نیست. فقط PDF، JPG، PNG و WEBP پذیرفته می‌شوند.`);
  }
  const extension = allowed.get(detected!.mime)!;
  const storedName = `${randomUUID()}${extension}`;
  await mkdir(config.storageDir, { recursive: true });
  await writeFile(path.join(config.storageDir, storedName), file.buffer, { flag: 'wx', mode: 0o600 });
  return {
    originalName: path.basename(file.originalname).replace(/[\r\n\0]/g, '').slice(0, 255) || `file${extension}`,
    storedName, mimeType: detected!.mime, sizeBytes: file.size,
    sha256: createHash('sha256').update(file.buffer).digest('hex')
  };
}
export async function readStoredFile(storedName: string): Promise<Buffer> {
  if (!/^[a-f0-9-]+\.(pdf|jpg|png|webp)$/i.test(storedName)) throw new Error('Invalid stored filename');
  return readFile(path.join(config.storageDir, storedName));
}
export async function removeStoredFile(storedName: string): Promise<void> {
  try { await unlink(path.join(config.storageDir, storedName)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
}
export function safeDownloadName(name: string): string {
  return path.basename(name).replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'download';
}
