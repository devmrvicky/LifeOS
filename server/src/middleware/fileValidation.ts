import multer from 'multer';

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic']);
const ALLOWED_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.heic']);
const PDF_MIME = 'application/pdf';

export const upload = multer({
  storage: multer.memoryStorage(), // never written to disk — nothing to clean up after the request
  limits: { fileSize: MAX_FILE_BYTES },
});

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i).toLowerCase();
}

export interface FileCheckResult {
  ok: boolean;
  message?: string;
}

/**
 * Never trusts a filename extension alone — cross-checks it against the
 * sniffed MIME type, and validates both against an allowlist rather than a
 * denylist (Step 15/27).
 */
export function checkUploadedFile(
  sourceType: 'image' | 'pdf',
  file: Express.Multer.File
): FileCheckResult {
  const ext = extOf(file.originalname);
  if (sourceType === 'image') {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype) || (ext && !ALLOWED_IMAGE_EXT.has(ext))) {
      return { ok: false, message: "That doesn't look like a supported image." };
    }
    return { ok: true };
  }
  if (file.mimetype !== PDF_MIME || (ext && ext !== '.pdf')) {
    return { ok: false, message: "That doesn't look like a PDF file." };
  }
  return { ok: true };
}
