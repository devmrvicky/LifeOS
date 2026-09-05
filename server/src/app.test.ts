import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app';
import { ScriptedProvider, FailingProvider } from './testUtils/fakeProviders';
import { ProviderRateLimitError } from './services/ai/AIProvider';

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

describe('POST /api/extract — success envelope', () => {
  it('returns {success:true, data} for a text capture', async () => {
    const app = createApp(new ScriptedProvider(wellFormed));
    const res = await request(app)
      .post('/api/extract')
      .field('sourceType', 'text')
      .field('text', 'Appointment on September 18 at 4 PM.')
      .field('currentDateISO', '2026-09-01');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.event_date).toBe('2026-09-18');
    expect(JSON.stringify(res.body)).not.toMatch(/sk-or|sk-ant|api_key|apiKey/i);
  });
});

describe('POST /api/extract — error envelope', () => {
  it('rejects a request with no text and no file', async () => {
    const app = createApp(new ScriptedProvider(wellFormed));
    const res = await request(app).post('/api/extract').field('sourceType', 'text');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('rejects an unsupported file type even with a spoofed extension', async () => {
    const app = createApp(new ScriptedProvider(wellFormed));
    const res = await request(app)
      .post('/api/extract')
      .field('sourceType', 'image')
      .attach('file', Buffer.from('not an image'), { filename: 'evil.png', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(415);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE');
  });

  it('returns 429 with a clean envelope when the provider rate-limits', async () => {
    const app = createApp(new FailingProvider(new ProviderRateLimitError('slow down')));
    const res = await request(app)
      .post('/api/extract')
      .field('sourceType', 'text')
      .field('text', 'Bill due tomorrow.')
      .field('currentDateISO', '2026-09-01');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('AI_RATE_LIMITED');
  });

  it('never leaks a stack trace in an error response', async () => {
    const app = createApp(new FailingProvider(new Error('ECONNREFUSED 10.0.0.5:443 at internal/net.js:42')));
    const res = await request(app)
      .post('/api/extract')
      .field('sourceType', 'text')
      .field('text', 'Bill due tomorrow.')
      .field('currentDateISO', '2026-09-01');
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|internal\/net\.js/);
  });
});

describe('GET /health', () => {
  it('responds ok', async () => {
    const app = createApp(new ScriptedProvider(wellFormed));
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('CORS', () => {
  it('reflects an allowed origin', async () => {
    const app = createApp(new ScriptedProvider(wellFormed), { allowedOrigins: ['http://localhost:5173'] });
    const res = await request(app)
      .post('/api/extract')
      .set('Origin', 'http://localhost:5173')
      .field('sourceType', 'text')
      .field('text', 'Bill due tomorrow.');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not reflect a disallowed origin', async () => {
    const app = createApp(new ScriptedProvider(wellFormed), { allowedOrigins: ['http://localhost:5173'] });
    const res = await request(app)
      .post('/api/extract')
      .set('Origin', 'http://evil.example.com')
      .field('sourceType', 'text')
      .field('text', 'Bill due tomorrow.');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
