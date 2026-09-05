import { describe, it, expect } from 'vitest';
import { runExtraction } from './extractionService';
import { ScriptedProvider, FailingProvider } from '../../testUtils/fakeProviders';
import { ProviderTimeoutError, ProviderRateLimitError, ProviderUnavailableError } from '../ai/AIProvider';

const baseReq = {
  sourceType: 'text' as const,
  text: 'Electricity bill ₹1,850 due September 12.',
  currentDateISO: '2026-09-01',
};

const wellFormed = JSON.stringify({
  has_actionable_information: true,
  title: 'Electricity Bill',
  description: 'Electricity bill payment',
  category: 'bills',
  amount: 1850,
  currency: 'INR',
  due_date: '2026-09-12',
  event_date: null,
  event_time: null,
  reminder_date: '2026-09-10',
  reminder_time: '09:00',
  priority: 'high',
  recurring: false,
  confidence: 0.95,
});

describe('runExtraction — happy path', () => {
  it('parses and validates a well-formed model response', async () => {
    const result = await runExtraction(new ScriptedProvider(wellFormed), baseReq);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe('Electricity Bill');
      expect(result.data.due_date).toBe('2026-09-12');
    }
  });

  it('strips markdown code fences before parsing', async () => {
    const fenced = '```json\n' + wellFormed + '\n```';
    const result = await runExtraction(new ScriptedProvider(fenced), baseReq);
    expect(result.ok).toBe(true);
  });
});

describe('runExtraction — malformed output does not crash the app', () => {
  it('rejects non-JSON text cleanly', async () => {
    const result = await runExtraction(new ScriptedProvider('Sure, here is the bill info.'), baseReq);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('INVALID_AI_RESPONSE');
  });

  it('rejects JSON that violates the schema (bad confidence)', async () => {
    const bad = JSON.stringify({ ...JSON.parse(wellFormed), confidence: 12 });
    const result = await runExtraction(new ScriptedProvider(bad), baseReq);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('INVALID_AI_RESPONSE');
  });

  it('rejects an actionable item missing a title', async () => {
    const noTitle = JSON.stringify({ ...JSON.parse(wellFormed), title: null });
    const result = await runExtraction(new ScriptedProvider(noTitle), baseReq);
    expect(result.ok).toBe(false);
  });
});

describe('runExtraction — error classification', () => {
  it('maps a timeout to AI_TIMEOUT after retrying (both attempts fail)', async () => {
    const always = new FailingProvider(new ProviderTimeoutError('timed out'));
    const result = await runExtraction(always, baseReq);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('AI_TIMEOUT');
      expect(result.message).not.toMatch(/stack|api key|token/i);
    }
  });

  it('maps a rate limit straight through with no retry', async () => {
    const result = await runExtraction(new FailingProvider(new ProviderRateLimitError('slow down')), baseReq);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('AI_RATE_LIMITED');
  });

  it('maps a server-side unavailable failure to AI_UNAVAILABLE', async () => {
    const result = await runExtraction(new FailingProvider(new ProviderUnavailableError('down', 'server')), baseReq);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('AI_UNAVAILABLE');
  });

  it('maps an unrecognized failure to AI_EXTRACTION_FAILED rather than throwing, without leaking internals', async () => {
    const result = await runExtraction(new FailingProvider(new Error('ECONNRESET at internal/net.js:42')), baseReq);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('AI_EXTRACTION_FAILED');
      expect(result.message).not.toMatch(/ECONNRESET|internal\/net\.js/);
    }
  });
});

describe('runExtraction — retries exactly once on a transient failure, not endlessly', () => {
  it('succeeds on the second attempt after one timeout', async () => {
    let callCount = 0;
    const provider = {
      name: 'flaky',
      supportsVision: true,
      async extract() {
        callCount += 1;
        if (callCount === 1) throw new ProviderTimeoutError('first attempt timed out');
        return wellFormed;
      },
    };
    const result = await runExtraction(provider, baseReq);
    expect(callCount).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('never calls a third time even if the retry also fails', async () => {
    let callCount = 0;
    const provider = {
      name: 'always-flaky',
      supportsVision: true,
      async extract() {
        callCount += 1;
        throw new ProviderTimeoutError('always times out');
      },
    };
    const result = await runExtraction(provider, baseReq);
    expect(callCount).toBe(2); // exactly one retry, never more
    expect(result.ok).toBe(false);
  });

  it('retries once on a server-side (5xx-style) unavailability', async () => {
    let callCount = 0;
    const provider = {
      name: 'flaky-server',
      supportsVision: true,
      async extract() {
        callCount += 1;
        if (callCount === 1) throw new ProviderUnavailableError('down', 'server');
        return wellFormed;
      },
    };
    const result = await runExtraction(provider, baseReq);
    expect(callCount).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('NEVER retries an auth failure (Step 6) — a bad key fails identically every time', async () => {
    let callCount = 0;
    const provider = {
      name: 'bad-key',
      supportsVision: true,
      async extract() {
        callCount += 1;
        throw new ProviderUnavailableError('invalid key', 'auth');
      },
    };
    const result = await runExtraction(provider, baseReq);
    expect(callCount).toBe(1); // no retry at all
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('AI_UNAVAILABLE');
  });

  it('NEVER retries a rate limit (Step 6)', async () => {
    let callCount = 0;
    const provider = {
      name: 'limited',
      supportsVision: true,
      async extract() {
        callCount += 1;
        throw new ProviderRateLimitError('slow down');
      },
    };
    const result = await runExtraction(provider, baseReq);
    expect(callCount).toBe(1);
    expect(result.ok).toBe(false);
  });
});

describe('runExtraction — no actionable information', () => {
  it('passes through has_actionable_information = false cleanly', async () => {
    const noAction = JSON.stringify({
      has_actionable_information: false,
      title: null,
      description: null,
      category: null,
      amount: null,
      currency: null,
      due_date: null,
      event_date: null,
      event_time: null,
      reminder_date: null,
      reminder_time: null,
      priority: null,
      recurring: false,
      confidence: 0.85,
    });
    const result = await runExtraction(new ScriptedProvider(noAction), { ...baseReq, text: 'Happy Birthday!' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.has_actionable_information).toBe(false);
  });
});
