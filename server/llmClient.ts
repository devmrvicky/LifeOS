import Anthropic from '@anthropic-ai/sdk';

export type ContentInput =
  | { type: 'text'; text: string }
  | { type: 'image'; base64: string; mediaType: string }
  | { type: 'pdf'; base64: string };

export interface LLMClient {
  extract(systemPrompt: string, content: ContentInput): Promise<string>;
}

export class LLMUnavailableError extends Error {
  readonly code = 'ai_unavailable' as const;
}
export class LLMTimeoutError extends Error {
  readonly code = 'ai_timeout' as const;
}
export class LLMRateLimitError extends Error {
  readonly code = 'ai_rate_limited' as const;
}

const REQUEST_TIMEOUT_MS = 30_000;
const MODEL = 'claude-sonnet-4-6';

/**
 * The only place this codebase talks to a real model provider. The API key
 * is read from process.env — a server-side environment variable — and is
 * never sent to, or reachable from, the browser bundle.
 */
export class AnthropicLLMClient implements LLMClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS });
  }

  async extract(systemPrompt: string, content: ContentInput): Promise<string> {
    let contentBlock: Anthropic.Messages.ContentBlockParam;
    if (content.type === 'text') {
      contentBlock = { type: 'text', text: content.text };
    } else if (content.type === 'image') {
      contentBlock = {
        type: 'image',
        source: { type: 'base64', media_type: content.mediaType as any, data: content.base64 },
      };
    } else {
      contentBlock = {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: content.base64 },
      } as Anthropic.Messages.ContentBlockParam;
    }

    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: [contentBlock] }],
      });
      const textBlock = response.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
      if (!textBlock) throw new Error('model returned no text content');
      return textBlock.text;
    } catch (err: any) {
      if (err?.name === 'APIConnectionTimeoutError' || err?.message?.includes('timeout')) {
        throw new LLMTimeoutError('The AI took too long to respond.');
      }
      if (err?.status === 429) {
        throw new LLMRateLimitError('The AI service is temporarily rate-limited.');
      }
      if (err?.status === 401 || err?.status === 403) {
        throw new LLMUnavailableError('The AI service is not configured correctly.');
      }
      if (err?.status && err.status >= 500) {
        throw new LLMUnavailableError('The AI service is temporarily unavailable.');
      }
      throw err;
    }
  }
}
