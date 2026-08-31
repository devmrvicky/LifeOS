import type { ExtractedTaskData, SourceType } from '../types';
import { validateExtraction } from '../lib/validation';
import { extractFromText } from './textExtractor';
import { extractTextFromImage, extractTextFromPdf } from './fileTextExtractor';

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
 * Phase 1 default provider. Runs OCR/PDF-text-extraction and a rule-based
 * parser entirely in the browser — genuinely reads the input and returns
 * real structured data, not a fixed canned response. No network call, no
 * API key, no backend required. See README for how to swap this for a
 * production LLM provider.
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

/**
 * Production provider stub. Phase 1 ships with this DISABLED — calling it
 * throws a clear configuration error rather than pretending to work. Wiring
 * it up requires a server-side function (never call a model provider with a
 * secret key directly from the browser) — see README "Enabling a production
 * AI provider".
 */
export class RemoteLLMProvider implements AIProvider {
  readonly name = 'remote-llm';
  private endpoint: string | null;
  constructor(endpoint: string | null) {
    this.endpoint = endpoint;
  }

  async extractActionableInformation(input: AIExtractionInput): Promise<unknown> {
    if (!this.endpoint) {
      throw new Error(
        'RemoteLLMProvider is not configured. Set VITE_EXTRACTION_ENDPOINT to a server ' +
        'route that calls the model with a server-side API key, then pass that endpoint here.'
      );
    }
    const body = new FormData();
    body.append('sourceType', input.sourceType);
    if (input.text) body.append('text', input.text);
    if (input.file) body.append('file', input.file);

    const res = await fetch(this.endpoint, { method: 'POST', body });
    if (!res.ok) throw new Error(`extraction endpoint returned ${res.status}`);
    return res.json();
  }
}

export class AIService {
  private provider: AIProvider;
  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  get providerName(): string {
    return this.provider.name;
  }

  async extractActionableInformation(input: AIExtractionInput): Promise<AIExtractionResult> {
    let rawResult: unknown;
    let rawText: string | null = null;
    try {
      const result = await this.provider.extractActionableInformation(input);
      if (result && typeof result === 'object' && 'raw' in (result as any)) {
        rawResult = (result as any).raw;
        rawText = (result as any).rawText ?? null;
      } else {
        rawResult = result;
      }
    } catch (err) {
      return {
        ok: false,
        data: null,
        rawText: null,
        errors: [err instanceof Error ? err.message : 'AI extraction failed'],
      };
    }

    const validated = validateExtraction(rawResult);
    return {
      ok: validated.ok,
      data: validated.data,
      rawText,
      errors: validated.errors,
    };
  }
}

// Phase 1 default wiring. Swap the provider here (not throughout the app)
// to move to a production LLM backend once VITE_EXTRACTION_ENDPOINT exists.
const remoteEndpoint = import.meta.env.VITE_EXTRACTION_ENDPOINT as string | undefined;
export const aiService = new AIService(
  remoteEndpoint ? new RemoteLLMProvider(remoteEndpoint) : new LocalRuleBasedProvider()
);
