import {
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  type AIProvider,
  type ContentInput,
} from './AIProvider';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 30_000;

export interface OpenRouterConfig {
  apiKey: string;
  /**
   * Free models on OpenRouter rotate in and out with little notice, so the
   * model name is configuration, never a literal in this file (Step 8).
   * Default is OpenRouter's own free-model router, which auto-selects an
   * available free model and — per OpenRouter's docs — automatically
   * "filters for models that support features needed for your request such
   * as image understanding," which is exactly the graceful-vision-fallback
   * behavior Step 10 asks for. Pin a specific model (e.g.
   * "google/gemma-4-31b-it:free") instead if you want stability over
   * OpenRouter's own rotation.
   */
  model: string;
  /** Set true if the pinned model is text-only, forcing the OCR-first path for images. */
  textOnly: boolean;
  /** Sent as OpenRouter's recommended attribution headers — optional but good practice. */
  siteUrl?: string;
  appName?: string;
}

export class OpenRouterProvider implements AIProvider {
  readonly name = 'openrouter';
  readonly supportsVision: boolean;
  private config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.config = config;
    this.supportsVision = !config.textOnly;
  }

  async extract(systemPrompt: string, content: ContentInput): Promise<string> {
    if (content.type === 'pdf') {
      // OpenRouter's chat-completions surface has no universal "document"
      // content type the way Anthropic's API does — PDFs must already be
      // reduced to text (or an image) before reaching this provider. See
      // extractionService.ts, which never sends a raw pdf ContentInput here.
      throw new Error('OpenRouterProvider received a raw PDF — the extraction service should have pre-processed it.');
    }

    const userContent =
      content.type === 'text'
        ? content.text
        : [
            { type: 'image_url', image_url: { url: `data:${content.mediaType};base64,${content.base64}` } },
            { type: 'text', text: 'Extract the structured reminder information from this image.' },
          ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          ...(this.config.siteUrl ? { 'HTTP-Referer': this.config.siteUrl } : {}),
          ...(this.config.appName ? { 'X-Title': this.config.appName } : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          temperature: 0.2,
        }),
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new ProviderTimeoutError('The AI took too long to respond.');
      throw new ProviderUnavailableError('Could not reach the AI service.', 'server');
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      if (res.status === 429) throw new ProviderRateLimitError('The free AI tier is rate-limited right now — please try again shortly.');
      if (res.status === 401 || res.status === 403) throw new ProviderUnavailableError('The AI service is not configured correctly.', 'auth');
      if (res.status >= 500) throw new ProviderUnavailableError('The AI service is temporarily unavailable.', 'server');
      throw new ProviderUnavailableError('The AI service returned an unexpected error.', 'server');
    }

    interface OpenRouterChatResponse {
      choices?: Array<{ message?: { content?: string } }>;
    }
    const json = (await res.json()) as OpenRouterChatResponse;
    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('model returned no text content');
    }
    return text;
  }
}
