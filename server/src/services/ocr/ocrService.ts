import { createWorker } from 'tesseract.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// English training data is bundled in server/tessdata/ rather than fetched
// from tesseract.js's default CDN (cdn.jsdelivr.net) at request time. A
// server has no business making an OCR request wait on — or fail because
// of — an external CDN it doesn't control; bundling the ~3MB file once at
// build/deploy time is a small, one-time cost for a real reliability win.
const TESSDATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../tessdata');

/**
 * Runs OCR on image bytes entirely server-side. This path only runs when
 * the configured AI provider's model can't accept images directly
 * (`AIProvider.supportsVision === false`), or as the fallback for a
 * scanned PDF page — otherwise the image goes straight to the model, which
 * reads it more reliably than OCR text ever could (Step 10: prefer vision
 * over degrading through OCR when vision is available).
 */
export async function extractTextFromImageBuffer(buffer: Buffer): Promise<string> {
  const worker = await createWorker('eng', 1, { langPath: TESSDATA_DIR, gzip: true, cachePath: TESSDATA_DIR });
  try {
    const { data } = await worker.recognize(buffer);
    const text = data.text?.trim() ?? '';
    if (!text) throw new Error('empty OCR result');
    return text;
  } finally {
    await worker.terminate();
  }
}
