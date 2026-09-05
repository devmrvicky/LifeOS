import Anthropic from '@anthropic-ai/sdk';
import {
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  type AIProvider,
  type ContentInput,
} from './AIProvider';

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Optional, paid provider — not required to run LifeOS in Phase 1.2 (see
 * OpenRouterProvider for the free default). Kept available so a deployment
 * that already has an Anthropic key can use it by setting AI_PROVIDER=anthropic.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly supportsVision = true; // Claude models handle image/PDF input natively
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-6') {
    this.client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS });
    this.model = model;
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
        model: this.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: [contentBlock] }],
      });
      const textBlock = response.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
      if (!textBlock) throw new Error('model returned no text content');
      return textBlock.text;
    } catch (err: any) {
      if (err?.name === 'APIConnectionTimeoutError' || err?.message?.includes('timeout')) {
        throw new ProviderTimeoutError('The AI took too long to respond.');
      }
      if (err?.status === 429) throw new ProviderRateLimitError('The AI service is temporarily rate-limited.');
      if (err?.status === 401 || err?.status === 403) {
        throw new ProviderUnavailableError('The AI service is not configured correctly.', 'auth');
      }
      if (err?.status && err.status >= 500) throw new ProviderUnavailableError('The AI service is temporarily unavailable.', 'server');
      throw err;
    }
  }
}
