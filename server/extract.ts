import { buildSystemPrompt } from './prompt';
import { validateExtraction, type ExtractedTaskData } from './schema';
import { LLMRateLimitError, LLMTimeoutError, LLMUnavailableError, type ContentInput, type LLMClient } from './llmClient';

export interface ExtractionRequest {
  sourceType: 'image' | 'pdf' | 'text';
  content: ContentInput;
  currentDateISO: string;
}

export type ExtractionOutcome =
  | { ok: true; data: ExtractedTaskData }
  | { ok: false; errorCode: 'invalid_ai_response' | 'ai_timeout' | 'ai_rate_limited' | 'ai_unavailable' | 'ai_failed'; message: string };

function stripCodeFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/**
 * Orchestrates one extraction: builds the prompt, calls the injected LLM
 * client, parses and validates the response. Takes an `LLMClient` rather
 * than constructing one itself so this function is fully testable with a
 * fake client — no real API key required to verify the parsing/validation/
 * error-classification logic (see server/extract.test.ts).
 */
export async function runExtraction(client: LLMClient, req: ExtractionRequest): Promise<ExtractionOutcome> {
  const systemPrompt = buildSystemPrompt({ currentDateISO: req.currentDateISO, sourceType: req.sourceType });

  let raw: string;
  try {
    raw = await client.extract(systemPrompt, req.content);
  } catch (err) {
    if (err instanceof LLMTimeoutError) return { ok: false, errorCode: 'ai_timeout', message: err.message };
    if (err instanceof LLMRateLimitError) return { ok: false, errorCode: 'ai_rate_limited', message: err.message };
    if (err instanceof LLMUnavailableError) return { ok: false, errorCode: 'ai_unavailable', message: err.message };
    return { ok: false, errorCode: 'ai_failed', message: 'Something went wrong understanding that.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return { ok: false, errorCode: 'invalid_ai_response', message: 'The AI response was not valid JSON.' };
  }

  // source_type is known from the request itself — the server sets it
  // rather than trusting the model to echo it back correctly.
  if (parsed && typeof parsed === 'object') {
    (parsed as Record<string, unknown>).source_type = req.sourceType;
  }

  const validated = validateExtraction(parsed);
  if (!validated.ok) {
    return { ok: false, errorCode: 'invalid_ai_response', message: validated.errors.join('; ') };
  }

  return { ok: true, data: validated.data };
}
