import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractTextFromPdf,
  PasswordProtectedPdfError,
  CorruptedPdfError,
  ScannedPdfOcrFailedError,
} from './pdfTextService';

// ---------------------------------------------------------------------------
// These are genuine integration tests, not mocked ones — they shell out to
// the real poppler-utils binaries (pdftotext/pdftoppm) and run real OCR
// (tesseract.js) against real PDF files. That's deliberate: this pipeline
// exists because the `pdf-parse` npm package failed on a perfectly valid
// PDF during manual testing for this phase (threw "bad XRef entry"), so
// mocked tests alone wouldn't have caught the problem that motivated this
// rewrite in the first place. Requires poppler-utils to be installed — see
// README "Requirements".
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');

async function loadFixture(name: string): Promise<Buffer> {
  return readFile(path.join(FIXTURES_DIR, name));
}

describe('extractTextFromPdf — normal text PDF', () => {
  it('extracts the real text layer directly, no OCR fallback', async () => {
    const buf = await loadFixture('text.pdf');
    const result = await extractTextFromPdf(buf);
    expect(result.usedOcrFallback).toBe(false);
    expect(result.text).toContain('Electricity bill');
    expect(result.text).toContain('1850');
  });
});

describe('extractTextFromPdf — scanned/image-only PDF', () => {
  it('falls back to OCR and recovers the text', async () => {
    const buf = await loadFixture('scanned.pdf');
    const result = await extractTextFromPdf(buf);
    expect(result.usedOcrFallback).toBe(true);
    expect(result.text.toLowerCase()).toContain('insurance');
  }, 30_000); // OCR is slow — give it real headroom rather than a flaky short timeout
});

describe('extractTextFromPdf — corrupted PDF', () => {
  it('throws CorruptedPdfError with a friendly message, not a raw parser error', async () => {
    const buf = await loadFixture('corrupted.pdf');
    await expect(extractTextFromPdf(buf)).rejects.toBeInstanceOf(CorruptedPdfError);
    try {
      await extractTextFromPdf(buf);
    } catch (err) {
      expect((err as Error).message).not.toMatch(/xref|trailer|Syntax Error/i);
    }
  });
});

describe('extractTextFromPdf — password-protected PDF', () => {
  it('throws PasswordProtectedPdfError distinctly from a generic corruption error', async () => {
    const buf = await loadFixture('encrypted.pdf');
    await expect(extractTextFromPdf(buf)).rejects.toBeInstanceOf(PasswordProtectedPdfError);
  });

  it('never routes a password-protected PDF through the OCR fallback', async () => {
    // OCR would just fail the same way and waste time/cost — the password
    // case must be detected and short-circuited before that path runs.
    const buf = await loadFixture('encrypted.pdf');
    const start = Date.now();
    await expect(extractTextFromPdf(buf)).rejects.toBeInstanceOf(PasswordProtectedPdfError);
    expect(Date.now() - start).toBeLessThan(5000); // OCR alone takes several seconds
  });
});

describe('extractTextFromPdf — scanned page with nothing OCR can read (final failure path)', () => {
  it('throws ScannedPdfOcrFailedError with a friendly message when even OCR finds nothing', async () => {
    const buf = await loadFixture('blank.pdf');
    await expect(extractTextFromPdf(buf)).rejects.toBeInstanceOf(ScannedPdfOcrFailedError);
    try {
      await extractTextFromPdf(buf);
    } catch (err) {
      expect((err as Error).message).toMatch(/couldn't read this pdf/i);
    }
  }, 30_000);
});

describe('extractTextFromPdf — empty PDF', () => {
  it('does not crash on a zero-byte input', async () => {
    await expect(extractTextFromPdf(Buffer.alloc(0))).rejects.toThrow();
  });
});
