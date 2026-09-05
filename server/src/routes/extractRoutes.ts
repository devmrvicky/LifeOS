import { Router } from 'express';
import type { AIProvider } from '../services/ai/AIProvider';
import { createExtractController } from '../controllers/extractController';
import { upload } from '../middleware/fileValidation';

export function createExtractRoutes(provider: AIProvider): Router {
  const router = Router();
  router.post('/api/extract', upload.single('file'), createExtractController(provider));
  router.get('/health', (_req, res) => res.json({ ok: true }));
  return router;
}
