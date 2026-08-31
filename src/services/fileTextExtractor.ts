import type { AppError } from '../types';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic'];
const ACCEPTED_PDF_TYPE = 'application/pdf';

export function validateFile(file: File, kind: 'image' | 'pdf'): AppError | null {
  if (file.size > MAX_FILE_BYTES) {
    return { code: 'file_too_large', message: 'That file is larger than 10MB. Try a smaller file or a cropped screenshot.' };
  }
  const okType = kind === 'image' ? ACCEPTED_IMAGE_TYPES.includes(file.type) : file.type === ACCEPTED_PDF_TYPE;
  if (!okType) {
    return { code: 'unsupported_file', message: kind === 'image'
      ? "That doesn't look like a supported image (PNG, JPG, WEBP, HEIC)."
      : "That doesn't look like a PDF file." };
  }
  return null;
}

/** Runs OCR on an uploaded image entirely in the browser via tesseract.js. */
export async function extractTextFromImage(file: File): Promise<string> {
  const { default: Tesseract } = await import('tesseract.js');
  try {
    const { data } = await Tesseract.recognize(file, 'eng');
    const text = data.text?.trim() ?? '';
    if (!text) {
      throw new Error('empty OCR result');
    }
    return text;
  } catch (err) {
    throw new OcrError('Could not read text from that image. Try a clearer or brighter screenshot.', err);
  }
}

/** Extracts text from a PDF entirely in the browser via pdfjs-dist. */
export async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();

  try {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    let text = '';
    const pageCount = Math.min(pdf.numPages, 5); // Phase 1: first 5 pages is plenty for bills/tickets
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => ('str' in item ? item.str : '')).join(' ') + '\n';
    }
    const trimmed = text.trim();
    if (!trimmed) throw new Error('empty PDF text layer');
    return trimmed;
  } catch (err) {
    throw new OcrError('Could not read that PDF. It may be scanned as images without a text layer.', err);
  }
}

export class OcrError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'OcrError';
    this.cause = cause;
  }
}
