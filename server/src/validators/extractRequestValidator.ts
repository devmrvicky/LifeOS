export interface ExtractRequestFields {
  sourceType: 'image' | 'pdf' | 'text';
  text?: string;
  currentDateISO: string;
}

export type RequestValidationResult =
  | { ok: true; fields: ExtractRequestFields }
  | { ok: false; message: string };

/**
 * Validates the shape of an incoming /api/extract request before any file
 * processing or AI call happens — cheap checks first, expensive ones later.
 */
export function validateExtractRequest(body: Record<string, unknown>, hasFile: boolean): RequestValidationResult {
  const sourceType = body.sourceType;
  if (sourceType !== 'image' && sourceType !== 'pdf' && sourceType !== 'text') {
    return { ok: false, message: 'sourceType must be image, pdf, or text.' };
  }

  if (sourceType === 'text') {
    const text = typeof body.text === 'string' ? body.text : undefined;
    if (!text || !text.trim()) {
      return { ok: false, message: 'text is required for sourceType=text.' };
    }
    return {
      ok: true,
      fields: { sourceType, text, currentDateISO: normalizeDate(body.currentDateISO) },
    };
  }

  if (!hasFile) {
    return { ok: false, message: `file is required for sourceType=${sourceType}.` };
  }

  return { ok: true, fields: { sourceType, currentDateISO: normalizeDate(body.currentDateISO) } };
}

function normalizeDate(value: unknown): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}
