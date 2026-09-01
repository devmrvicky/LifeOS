import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import { runExtraction } from './extract';
import { AnthropicLLMClient, type LLMClient, type ContentInput } from './llmClient';

// Load server/.env regardless of the current working directory the process
// was started from (npm run server vs npx tsx server/app.ts vs a deployed
// entrypoint).
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });


const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — matches the frontend's own limit (Step 15)
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic']);
const ALLOWED_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.heic']);
const PDF_MIME = 'application/pdf';

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i).toLowerCase();
}

export function createApp(llmClient: LLMClient) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' })); // for text-only captures

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES },
  });

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/extract', upload.single('file'), async (req: Request, res: Response) => {
    const sourceType = req.body?.sourceType as 'image' | 'pdf' | 'text' | undefined;
    const text = req.body?.text as string | undefined;
    const currentDateISO = (req.body?.currentDateISO as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const file = req.file;

    if (!sourceType || !['image', 'pdf', 'text'].includes(sourceType)) {
      return res.status(400).json({ error: 'invalid_request', message: 'sourceType must be image, pdf, or text.' });
    }

    let content: ContentInput;

    if (sourceType === 'text') {
      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'invalid_request', message: 'text is required for sourceType=text.' });
      }
      content = { type: 'text', text };
    } else {
      if (!file) {
        return res.status(400).json({ error: 'invalid_request', message: 'file is required for image/pdf capture.' });
      }
      // File security: never trust the filename extension alone — cross-check
      // it against the sniffed MIME type multer reports, and validate both
      // against an allowlist rather than a denylist.
      const ext = extOf(file.originalname);
      if (sourceType === 'image') {
        if (!ALLOWED_IMAGE_MIME.has(file.mimetype) || (ext && !ALLOWED_IMAGE_EXT.has(ext))) {
          return res.status(415).json({ error: 'unsupported_file', message: "That doesn't look like a supported image." });
        }
        content = { type: 'image', base64: file.buffer.toString('base64'), mediaType: file.mimetype };
      } else {
        if (file.mimetype !== PDF_MIME || (ext && ext !== '.pdf')) {
          return res.status(415).json({ error: 'unsupported_file', message: "That doesn't look like a PDF file." });
        }
        content = { type: 'pdf', base64: file.buffer.toString('base64') };
      }
    }

    const outcome = await runExtraction(llmClient, { sourceType, content, currentDateISO });
    // The file buffer only ever lived in memory for this request — nothing
    // was written to disk, so there is nothing to clean up afterward.

    if (!outcome.ok) {
      const statusByCode: Record<string, number> = {
        ai_timeout: 504,
        ai_rate_limited: 429,
        ai_unavailable: 503,
        invalid_ai_response: 502,
        ai_failed: 502,
      };
      return res.status(statusByCode[outcome.errorCode] ?? 502).json({ error: outcome.errorCode, message: outcome.message });
    }

    return res.json(outcome.data);
  });

  // Never leak stack traces, provider errors, or internals to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'file_too_large', message: 'That file is larger than 10MB.' });
    }
    console.error('[server] unhandled error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'unknown', message: 'Something went wrong on our end.' });
  });

  return app;
}

export function createProductionApp(): express.Express {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Copy server/.env.example to server/.env and add a real key before starting the server.'
    );
  }
  return createApp(new AnthropicLLMClient(apiKey));
}

if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  const app = createProductionApp();
  app.listen(port, () => {
    console.log(`[server] LifeOS extraction API listening on :${port}`);
  });
}
