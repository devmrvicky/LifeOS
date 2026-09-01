import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app';
import { ScriptedLLMClient, FailingLLMClient } from './testUtils/fakeLLMClient';
import { LLMRateLimitError } from './llmClient';

const wellFormed = JSON.stringify({
  has_actionable_information: true,
  title: 'Appointment',
  description: 'Doctor appointment',
  category: 'appointments',
  amount: null,
  currency: null,
  due_date: null,
  event_date: '2026-09-18',
  event_time: '16:00',
  reminder_date: '2026-09-17',
  reminder_time: '18:00',
  priority: 'medium',
  recurring: false,
  confidence: 0.9,
});

describe('POST /api/extract', () => {
  it('extracts from plain text and never echoes an api key', async () => {
    const app = createApp(new ScriptedLLMClient(wellFormed));
    const res = await request(app)
      .post('/api/extract')
      .field('sourceType', 'text')
      .field('text', 'Appointment on September 18 at 4 PM.')
      .field('currentDateISO', '2026-09-01');

    expect(res.status).toBe(200);
    expect(res.body.event_date).toBe('2026-09-18');
    expect(JSON.stringify(res.body)).not.toMatch(/sk-ant|api_key|apiKey/i);
  });

  it('rejects a request with no text and no file', async () => {
    const app = createApp(new ScriptedLLMClient(wellFormed));
    const res = await request(app).post('/api/extract').field('sourceType', 'text');
    expect(res.status).toBe(400);
  });

  it('rejects an unsupported file type even with a spoofed extension', async () => {
    const app = createApp(new ScriptedLLMClient(wellFormed));
    const res = await request(app)
      .post('/api/extract')
      .field('sourceType', 'image')
      .attach('file', Buffer.from('not an image'), { filename: 'evil.png', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(415);
  });

  it('returns 429 with a clean message when the provider rate-limits', async () => {
    const app = createApp(new FailingLLMClient(new LLMRateLimitError('slow down')));
    const res = await request(app)
      .post('/api/extract')
      .field('sourceType', 'text')
      .field('text', 'Bill due tomorrow.')
      .field('currentDateISO', '2026-09-01');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('ai_rate_limited');
  });

  it('never leaks a stack trace in an error response', async () => {
    const app = createApp(new FailingLLMClient(new Error('ECONNREFUSED 10.0.0.5:443 at internal/net.js:42')));
    const res = await request(app)
      .post('/api/extract')
      .field('sourceType', 'text')
      .field('text', 'Bill due tomorrow.')
      .field('currentDateISO', '2026-09-01');
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|internal\/net\.js/);
  });

  it('health check responds ok', async () => {
    const app = createApp(new ScriptedLLMClient(wellFormed));
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
