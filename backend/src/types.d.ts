import type { Request } from 'express';
declare global {
  namespace Express {
    interface Request { teacher?: { id: string; username: string; displayName: string }; }
  }
}
export {};
