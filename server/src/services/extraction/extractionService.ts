import { buildSystemPrompt } from './prompt';
import { extractedTaskSchema, validateExtraction } from '@shared/schemas/extraction';
import type { ExtractedTaskData } from '@shared/types';
import {
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  type AIProvider,
  type ContentInput,
} from '../ai/AIProvider';
import { extractTextFromImageBuffer } from '../ocr/ocrService';
import { extractTextFromPdf, PasswordProtectedPdfError, CorruptedPdfError, ScannedPdfOcrFailedError } from '../pdf/pdfTextService';

export interface RawFileInput {
  buffer: Buffer;
  mimeType: string;
}

export interface ExtractionRequest {
  sourceType: 'image' | 'pdf' | 'text';
  text?: string;
  file?: RawFileInput;
  currentDateISO: string;
}

export type ExtractionOutcome =
  | { ok: true; data: ExtractedTaskData; usedOcrFallback: boolean }
  | {
      ok: false;
      errorCode:
        | 'INVALID_AI_RESPONSE'
        | 'AI_TIMEOUT'
        | 'AI_RATE_LIMITED'
        | 'AI_UNAVAILABLE'
        | 'AI_EXTRACTION_FAILED'
        | 'UNSUPPORTED_FILE'
        | 'PDF_PASSWORD_PROTECTED'
        | 'PDF_UNREADABLE';
      message: string;
    };

function stripCodeFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/**
 * Prepares the content actually sent to the model.
 *
 * PDFs: try a real text layer first; if there isn't one (a scanned/
 * image-only PDF), PDFExtractionService itself renders the pages and OCRs
 * them — this function just receives back plain text either way, so it
 * never needs to know which path was taken (Step 2 — the PDF/OCR fallback
 * logic lives in one service, not scattered here or in the controller).
 *
 * Images: if the provider can't accept images directly, OCR first
 * (Step 8/10 — vision is always preferred over OCR when available).
 */
async function prepareContent(
  req: ExtractionRequest,
  provider: AIProvider
): Promise<{ content: ContentInput; usedOcrFallback: boolean }> {
  if (req.sourceType === 'text') {
    return { content: { type: 'text', text: req.text ?? '' }, usedOcrFallback: false };
  }

  if (!req.file) throw new Error(`${req.sourceType} extraction requires a file`);

  if (req.sourceType === 'pdf') {
    const result = await extractTextFromPdf(req.file.buffer);
    return { content: { type: 'text', text: result.text }, usedOcrFallback: result.usedOcrFallback };
  }

  // image
  if (provider.supportsVision) {
    return {
      content: { type: 'image', base64: req.file.buffer.toString('base64'), mediaType: req.file.mimeType },
      usedOcrFallback: false,
    };
  }
  const text = await extractTextFromImageBuffer(req.file.buffer);
  return { content: { type: 'text', text }, usedOcrFallback: true };
}

/**
 * Orchestrates one extraction end to end: prepares the content (OCR/PDF
 * branching), builds the prompt, calls the provider (with exactly one
 * retry on a transient failure — never an unbounded loop, Step 6/14),
 * parses and validates the response.
 */
export async function runExtraction(provider: AIProvider, req: ExtractionRequest): Promise<ExtractionOutcome> {
  let prepared: { content: ContentInput; usedOcrFallback: boolean };
  try {
    prepared = await prepareContent(req, provider);
  } catch (err) {
    if (err instanceof PasswordProtectedPdfError) {
      return { ok: false, errorCode: 'PDF_PASSWORD_PROTECTED', message: err.message };
    }
    if (err instanceof CorruptedPdfError || err instanceof ScannedPdfOcrFailedError) {
      return { ok: false, errorCode: 'PDF_UNREADABLE', message: err.message };
    }
    return {
      ok: false,
      errorCode: 'AI_EXTRACTION_FAILED',
      message: 'Could not read that file.',
    };
  }

  const systemPrompt = buildSystemPrompt({ currentDateISO: req.currentDateISO, sourceType: req.sourceType });

  const attempt = async (): Promise<string> => provider.extract(systemPrompt, prepared.content);

  let raw: string;
  try {
    raw = await attempt();
  } catch (firstErr) {
    // One retry maximum (Step 6) — only for the kinds of failure a second
    // attempt could plausibly fix (timeout, or a transient/server-side
    // unavailability). Never for a rate limit, and never for an auth
    // failure specifically — a bad key fails identically every time, so
    // retrying just wastes a call.
    const retryable =
      firstErr instanceof ProviderTimeoutError ||
      (firstErr instanceof ProviderUnavailableError && firstErr.reason !== 'auth');
    if (!retryable) {
      return mapProviderError(firstErr);
    }
    try {
      raw = await attempt();
    } catch (secondErr) {
      return mapProviderError(secondErr);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return { ok: false, errorCode: 'INVALID_AI_RESPONSE', message: 'The AI response was not valid JSON.' };
  }

  // source_type is known from the request, not the model — the server sets
  // it rather than trusting the model to echo it back (a real bug caught by
  // the Phase 1.1 test suite: the prompt never asked for this field).
  if (parsed && typeof parsed === 'object') {
    (parsed as Record<string, unknown>).source_type = req.sourceType;
  }

  const validated = validateExtraction(parsed);
  if (!validated.ok) {
    return { ok: false, errorCode: 'INVALID_AI_RESPONSE', message: validated.errors.join('; ') };
  }

  return { ok: true, data: validated.data!, usedOcrFallback: prepared.usedOcrFallback };
}

function mapProviderError(err: unknown): ExtractionOutcome {
  if (err instanceof ProviderTimeoutError) {
    return { ok: false, errorCode: 'AI_TIMEOUT', message: 'The request took too long. Please try again.' };
  }
  if (err instanceof ProviderRateLimitError) {
    return {
      ok: false,
      errorCode: 'AI_RATE_LIMITED',
      message: 'AI usage limit reached for now. You can create the reminder manually.',
    };
  }
  if (err instanceof ProviderUnavailableError) {
    // Distinct server-side log line for auth failures (Step 5) — the
    // user-facing message is deliberately identical either way; this
    // console line is the only place the distinction is visible at all.
    if (err.reason === 'auth') {
      console.error('[server] AI authentication failure');
    }
    return {
      ok: false,
      errorCode: 'AI_UNAVAILABLE',
      message: 'AI processing is temporarily unavailable. Please check your configuration or try again.',
    };
  }
  return { ok: false, errorCode: 'AI_EXTRACTION_FAILED', message: 'Something went wrong understanding that.' };
}

// Re-exported for validators/tests that want the raw schema without a
// second import path.
export { extractedTaskSchema };
