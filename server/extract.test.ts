import { describe, it, expect } from 'vitest';
import { runExtraction } from './extract';
import { ScriptedLLMClient, FailingLLMClient } from './testUtils/fakeLLMClient';
import { LLMTimeoutError, LLMRateLimitError, LLMUnavailableError } from './llmClient';

const baseReq = {
  sourceType: 'text' as const,
  content: { type: 'text' as const, text: 'Electricity bill ₹1,850 due September 12.' },
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
    const result = await runExtraction(new ScriptedLLMClient(wellFormed), baseReq);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe('Electricity Bill');
      expect(result.data.due_date).toBe('2026-09-12');
    }
  });

  it('strips markdown code fences before parsing', async () => {
    const fenced = '```json\n' + wellFormed + '\n```';
    const result = await runExtraction(new ScriptedLLMClient(fenced), baseReq);
    expect(result.ok).toBe(true);
  });
});

describe('runExtraction — malformed output does not crash the app', () => {
  it('rejects non-JSON text cleanly', async () => {
    const result = await runExtraction(new ScriptedLLMClient('Sure, here is the bill info you asked for.'), baseReq);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('invalid_ai_response');
  });

  it('rejects JSON that violates the schema', async () => {
    const badConfidence = JSON.stringify({ ...JSON.parse(wellFormed), confidence: 12 });
    const result = await runExtraction(new ScriptedLLMClient(badConfidence), baseReq);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('invalid_ai_response');
  });

  it('rejects an actionable item missing a title', async () => {
    const noTitle = JSON.stringify({ ...JSON.parse(wellFormed), title: null });
    const result = await runExtraction(new ScriptedLLMClient(noTitle), baseReq);
    expect(result.ok).toBe(false);
  });
});

describe('runExtraction — error classification (Step 13)', () => {
  it('maps a timeout to ai_timeout without leaking internals', async () => {
    const result = await runExtraction(new FailingLLMClient(new LLMTimeoutError('timed out')), baseReq);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('ai_timeout');
      expect(result.message).not.toMatch(/stack|api key|token/i);
    }
  });

  it('maps a rate limit to ai_rate_limited', async () => {
    const result = await runExtraction(new FailingLLMClient(new LLMRateLimitError('slow down')), baseReq);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('ai_rate_limited');
  });

  it('maps an auth/provider failure to ai_unavailable', async () => {
    const result = await runExtraction(new FailingLLMClient(new LLMUnavailableError('bad key')), baseReq);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('ai_unavailable');
  });

  it('maps an unrecognized failure to ai_failed rather than throwing', async () => {
    const result = await runExtraction(new FailingLLMClient(new Error('something exotic broke')), baseReq);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('ai_failed');
      expect(result.message).not.toMatch(/exotic/); // internal detail must not leak
    }
  });
});

describe('runExtraction — no actionable information (Test 4 / spec §27)', () => {
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
    const result = await runExtraction(new ScriptedLLMClient(noAction), {
      ...baseReq,
      content: { type: 'text', text: 'Happy Birthday!' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.has_actionable_information).toBe(false);
  });
});
