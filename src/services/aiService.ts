import type { ExtractedTaskData, SourceType } from '../types';
import { validateExtraction } from '../lib/validation';
import { extractFromText } from './textExtractor';
import { extractTextFromImage, extractTextFromPdf } from './fileTextExtractor';
import { todayISO } from '../utils/dateUtils';

export interface AIExtractionInput {
  sourceType: SourceType;
  text?: string; // for source_type 'text'
  file?: File; // for source_type 'image' | 'pdf'
}

export interface AIExtractionResult {
  ok: boolean;
  data: ExtractedTaskData | null;
  rawText: string | null; // the text that was actually fed to extraction (for the "original_text" capture field)
  errors: string[];
  /** Which provider actually produced this result — surfaced in Settings for transparency. */
  servedBy: string;
  /** True when the primary (server/LLM) provider failed and the local engine answered instead. */
  usedFallback: boolean;
}

/**
 * Every AI backend LifeOS can use implements this one method. The UI and
 * stores only ever talk to `AIService`, never to a provider directly, so a
 * provider can be swapped (mock → real LLM) without touching anything else.
 */
export interface AIProvider {
  readonly name: string;
  extractActionableInformation(input: AIExtractionInput): Promise<unknown>;
}

/**
 * Local fallback provider. Runs OCR/PDF-text-extraction and a rule-based
 * parser entirely in the browser — genuinely reads the input and returns
 * real structured data, not a fixed canned response. No network call, no
 * API key required. Used automatically (Step 14) whenever the server
 * extraction API is unreachable, misconfigured, or fails — so LifeOS never
 * makes the user fully dependent on AI/network availability.
 */
export class LocalRuleBasedProvider implements AIProvider {
  readonly name = 'local-rule-based';

  async extractActionableInformation(input: AIExtractionInput): Promise<{ raw: unknown; rawText: string }> {
    let text: string;
    if (input.sourceType === 'text') {
      text = input.text ?? '';
    } else if (input.sourceType === 'image') {
      if (!input.file) throw new Error('image extraction requires a file');
      text = await extractTextFromImage(input.file);
    } else {
      if (!input.file) throw new Error('pdf extraction requires a file');
      text = await extractTextFromPdf(input.file);
    }
    const raw = extractFromText(text, input.sourceType);
    return { raw, rawText: text };
  }
}

export class RemoteExtractionError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Talks to the server extraction API (server/app.ts — POST /api/extract),
 * which is the only place with a model provider API key. This provider
 * itself never sees a secret: it just posts the capture and reads back
 * validated JSON or a clean {error, message} body.
 */
export class RemoteLLMProvider implements AIProvider {
  readonly name = 'remote-llm';
  private endpoint: string | null;
  constructor(endpoint: string | null) {
    this.endpoint = endpoint;
  }

  async extractActionableInformation(input: AIExtractionInput): Promise<unknown> {
    if (!this.endpoint) {
      throw new RemoteExtractionError(
        'not_configured',
        'No extraction server is configured (VITE_EXTRACTION_ENDPOINT is unset).'
      );
    }
    const body = new FormData();
    body.append('sourceType', input.sourceType);
    body.append('currentDateISO', todayISO());
    if (input.text) body.append('text', input.text);
    if (input.file) body.append('file', input.file);

    let res: Response;
    try {
      res = await fetch(this.endpoint, { method: 'POST', body });
    } catch {
      throw new RemoteExtractionError('network_failed', 'Could not reach the extraction server.');
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'unknown', message: 'Extraction server error.' }));
      throw new RemoteExtractionError(body.error ?? 'unknown', body.message ?? 'Extraction server error.');
    }
    return res.json();
  }
}

export class AIService {
  private primary: AIProvider;
  private fallback: AIProvider | null;

  constructor(primary: AIProvider, fallback: AIProvider | null = null) {
    this.primary = primary;
    this.fallback = fallback;
  }

  get providerName(): string {
    return this.primary.name;
  }

  async extractActionableInformation(input: AIExtractionInput): Promise<AIExtractionResult> {
    const primaryAttempt = await this.tryProvider(this.primary, input);
    if (primaryAttempt.ok) {
      return { ...primaryAttempt.result, servedBy: this.primary.name, usedFallback: false };
    }

    // Step 14: fall back to the local engine exactly once — never an
    // endless retry loop — so the user isn't fully dependent on the
    // server/AI provider being reachable.
    if (this.fallback && this.fallback !== this.primary) {
      const fallbackAttempt = await this.tryProvider(this.fallback, input);
      if (fallbackAttempt.ok) {
        return { ...fallbackAttempt.result, servedBy: this.fallback.name, usedFallback: true };
      }
      return { ...fallbackAttempt.result, servedBy: this.fallback.name, usedFallback: true };
    }

    return { ...primaryAttempt.result, servedBy: this.primary.name, usedFallback: false };
  }

  private async tryProvider(
    provider: AIProvider,
    input: AIExtractionInput
  ): Promise<{ ok: boolean; result: Omit<AIExtractionResult, 'servedBy' | 'usedFallback'> }> {
    let rawResult: unknown;
    let rawText: string | null = null;
    try {
      const result = await provider.extractActionableInformation(input);
      if (result && typeof result === 'object' && 'raw' in (result as any)) {
        rawResult = (result as any).raw;
        rawText = (result as any).rawText ?? null;
      } else {
        rawResult = result;
      }
    } catch (err) {
      const message =
        err instanceof RemoteExtractionError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'AI extraction failed';
      return { ok: false, result: { ok: false, data: null, rawText: null, errors: [message] } };
    }

    const validated = validateExtraction(rawResult);
    return {
      ok: validated.ok,
      result: { ok: validated.ok, data: validated.data, rawText, errors: validated.errors },
    };
  }
}

// Phase 1.1 default wiring: prefer the server/LLM extraction API when
// VITE_EXTRACTION_ENDPOINT is configured, with the local rule-based engine
// as an automatic fallback either way. Nothing downstream (stores, UI)
// knows or cares which one actually answered a given capture.
const remoteEndpoint = import.meta.env.VITE_EXTRACTION_ENDPOINT as string | undefined;
const localProvider = new LocalRuleBasedProvider();
export const aiService = remoteEndpoint
  ? new AIService(new RemoteLLMProvider(remoteEndpoint), localProvider)
  : new AIService(localProvider, null);
