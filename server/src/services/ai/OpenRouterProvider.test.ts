import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenRouterProvider } from './OpenRouterProvider';
import { ProviderRateLimitError, ProviderUnavailableError, ProviderTimeoutError } from './AIProvider';

const baseConfig = { apiKey: 'test-key', model: 'openrouter/free', textOnly: false };

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenRouterProvider — successful extraction', () => {
  it('sends a text content payload and returns the model text', async () => {
    mockFetchOnce(200, { choices: [{ message: { content: '{"has_actionable_information":true}' } }] });
    const provider = new OpenRouterProvider(baseConfig);
    const text = await provider.extract('system prompt', { type: 'text', text: 'bill due tomorrow' });
    expect(text).toBe('{"has_actionable_information":true}');

    const [, requestInit] = (fetch as any).mock.calls[0];
    const sentBody = JSON.parse(requestInit.body);
    expect(sentBody.model).toBe('openrouter/free');
    expect(sentBody.messages[0].role).toBe('system');
  });

  it('sends an image_url payload for image content', async () => {
    mockFetchOnce(200, { choices: [{ message: { content: '{}' } }] });
    const provider = new OpenRouterProvider(baseConfig);
    await provider.extract('system', { type: 'image', base64: 'ZmFrZQ==', mediaType: 'image/png' });

    const [, requestInit] = (fetch as any).mock.calls[0];
    const sentBody = JSON.parse(requestInit.body);
    const userMessage = sentBody.messages[1];
    expect(userMessage.content.some((c: any) => c.type === 'image_url')).toBe(true);
  });
});

describe('OpenRouterProvider — invalid JSON / empty response', () => {
  it('throws when the model returns no text content', async () => {
    mockFetchOnce(200, { choices: [{ message: {} }] });
    const provider = new OpenRouterProvider(baseConfig);
    await expect(provider.extract('s', { type: 'text', text: 'x' })).rejects.toThrow(/no text content/);
  });
});

describe('OpenRouterProvider — HTTP error mapping', () => {
  it('maps 429 to ProviderRateLimitError', async () => {
    mockFetchOnce(429, {});
    const provider = new OpenRouterProvider(baseConfig);
    await expect(provider.extract('s', { type: 'text', text: 'x' })).rejects.toBeInstanceOf(ProviderRateLimitError);
  });

  it('maps 401 to ProviderUnavailableError', async () => {
    mockFetchOnce(401, {});
    const provider = new OpenRouterProvider(baseConfig);
    await expect(provider.extract('s', { type: 'text', text: 'x' })).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('maps a 500 to ProviderUnavailableError', async () => {
    mockFetchOnce(500, {});
    const provider = new OpenRouterProvider(baseConfig);
    await expect(provider.extract('s', { type: 'text', text: 'x' })).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});

describe('OpenRouterProvider — timeout', () => {
  it('maps an aborted request to ProviderTimeoutError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      })
    );
    const provider = new OpenRouterProvider(baseConfig);
    await expect(provider.extract('s', { type: 'text', text: 'x' })).rejects.toBeInstanceOf(ProviderTimeoutError);
  });
});

describe('OpenRouterProvider — PDF content is rejected (must be pre-processed upstream)', () => {
  it('throws rather than silently mishandling a raw PDF', async () => {
    const provider = new OpenRouterProvider(baseConfig);
    await expect(provider.extract('s', { type: 'pdf', base64: 'ZmFrZQ==' })).rejects.toThrow(/pre-processed/);
  });
});
