import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractTextFromImageBuffer } from '../ocr/ocrService';

const execFileAsync = promisify(execFile);

const COMMAND_TIMEOUT_MS = 15_000;
const MIN_USABLE_TEXT_LENGTH = 10; // shorter than this, treat as "no real text" rather than trust a stray artifact
const MAX_OCR_FALLBACK_PAGES = 2; // bounded cost — this is a fallback path, not the primary one

export class PasswordProtectedPdfError extends Error {}
export class CorruptedPdfError extends Error {}
export class ScannedPdfOcrFailedError extends Error {}

export interface PdfExtractionResult {
  text: string;
  usedOcrFallback: boolean;
}

/**
 * PDFExtractionService — the single place PDF text extraction happens.
 * Nothing outside this file shells out to poppler-utils or knows the
 * scanned-PDF fallback exists; extractionService.ts just calls
 * `extractTextFromPdf` and handles whichever typed error (or success) comes
 * back (Step 2: "do not duplicate PDF logic in controllers").
 *
 * Uses poppler-utils (pdftotext/pdftoppm) rather than the `pdf-parse` npm
 * package. That switch happened after `pdf-parse` threw "bad XRef entry" on
 * a perfectly valid, freshly generated PDF during testing for this phase —
 * poppler is the more battle-tested tool and handled every test fixture
 * (normal, scanned, corrupted, password-protected) correctly. This is an
 * external system dependency, not an npm one — see README "Requirements".
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<PdfExtractionResult> {
  const dir = await mkdtemp(path.join(tmpdir(), 'lifeos-pdf-'));
  const inputPath = path.join(dir, 'input.pdf');
  try {
    await writeFile(inputPath, buffer);

    const directText = await tryExtractText(inputPath);
    if (directText && directText.trim().length >= MIN_USABLE_TEXT_LENGTH) {
      return { text: directText.trim(), usedOcrFallback: false };
    }

    // No usable text layer — likely a scanned/image-only PDF. Render the
    // first couple of pages to images and OCR them rather than failing outright.
    const ocrText = await renderAndOcr(dir, inputPath);
    if (!ocrText || ocrText.trim().length < MIN_USABLE_TEXT_LENGTH) {
      throw new ScannedPdfOcrFailedError(
        "We couldn't read this PDF. Try uploading a clearer document or create the reminder manually."
      );
    }
    return { text: ocrText.trim(), usedOcrFallback: true };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Runs pdftotext; returns extracted text on success. Throws
 * PasswordProtectedPdfError or CorruptedPdfError on failure — returns null
 * (not thrown) when the PDF opens fine but simply has no text layer, since
 * that's the expected "try the OCR fallback next" case, not an error.
 */
async function tryExtractText(inputPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('pdftotext', [inputPath, '-'], { timeout: COMMAND_TIMEOUT_MS });
    return stdout;
  } catch (err: any) {
    const stderr: string = err?.stderr ?? '';
    if (/password/i.test(stderr)) {
      throw new PasswordProtectedPdfError(
        'This PDF is password-protected. Please remove the password and try again, or create the reminder manually.'
      );
    }
    if (/killed|timeout/i.test(err?.message ?? '')) {
      throw new CorruptedPdfError('That PDF took too long to process. Try a smaller or simpler file.');
    }
    throw new CorruptedPdfError(
      "We couldn't open this PDF — it may be corrupted or in an unsupported format."
    );
  }
}

async function renderAndOcr(dir: string, inputPath: string): Promise<string> {
  const outPrefix = path.join(dir, 'page');
  try {
    await execFileAsync(
      'pdftoppm',
      ['-png', '-r', '150', '-l', String(MAX_OCR_FALLBACK_PAGES), inputPath, outPrefix],
      { timeout: COMMAND_TIMEOUT_MS }
    );
  } catch {
    // Rendering failed too (e.g. genuinely corrupted PDF that pdftotext
    // didn't catch) — let the caller's empty-text check produce the
    // standard "couldn't read this PDF" message rather than a second
    // error type for what's ultimately the same user-facing outcome.
    return '';
  }

  const files = (await readdir(dir)).filter((f) => f.startsWith('page') && f.endsWith('.png')).sort();
  const pageTexts: string[] = [];
  for (const file of files.slice(0, MAX_OCR_FALLBACK_PAGES)) {
    try {
      const imageBuffer = await readFile(path.join(dir, file));
      const text = await extractTextFromImageBuffer(imageBuffer);
      pageTexts.push(text);
    } catch {
      // One unreadable page shouldn't sink pages that did OCR successfully.
    }
  }
  return pageTexts.join('\n');
}
