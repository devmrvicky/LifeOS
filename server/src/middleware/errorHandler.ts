import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import type { ApiFailure } from '@shared/types/api';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    const body: ApiFailure = { success: false, error: { code: 'FILE_TOO_LARGE', message: 'That file is larger than 10MB.' } };
    return res.status(413).json(body);
  }
  console.error('[server] unhandled error:', err instanceof Error ? err.message : err);
  const body: ApiFailure = { success: false, error: { code: 'UNKNOWN', message: 'Something went wrong on our end.' } };
  res.status(500).json(body);
}
