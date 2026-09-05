import express from 'express';
import cors from 'cors';
import type { AIProvider } from './services/ai/AIProvider';
import { createExtractRoutes } from './routes/extractRoutes';
import { errorHandler } from './middleware/errorHandler';

export interface AppConfig {
  /** Explicit allowed dev origin(s) — never '*' for a private API (Step 20). */
  allowedOrigins: string[];
}

const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function createApp(provider: AIProvider, config: Partial<AppConfig> = {}): express.Express {
  const allowedOrigins = config.allowedOrigins ?? DEFAULT_DEV_ORIGINS;

  const app = express();
  app.use(
    cors({
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
    })
  );
  app.use(express.json({ limit: '2mb' })); // text-only captures arrive as JSON-able form fields via multipart, this covers any plain-JSON callers

  app.use(createExtractRoutes(provider));

  app.use(errorHandler);

  return app;
}
