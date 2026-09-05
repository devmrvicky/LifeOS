import type { Request, Response } from 'express';
import type { ApiResponse } from '@shared/types/api';
import type { ExtractedTaskData } from '@shared/types';
import type { AIProvider } from '../services/ai/AIProvider';
import { runExtraction } from '../services/extraction/extractionService';
import { validateExtractRequest } from '../validators/extractRequestValidator';
import { checkUploadedFile } from '../middleware/fileValidation';
import { logUsage } from '../utils/logger';

const HTTP_STATUS_BY_ERROR_CODE: Record<string, number> = {
  AI_TIMEOUT: 504,
  AI_RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  INVALID_AI_RESPONSE: 502,
  AI_EXTRACTION_FAILED: 502,
  UNSUPPORTED_FILE: 415,
  PDF_PASSWORD_PROTECTED: 422,
  PDF_UNREADABLE: 422,
};

export function createExtractController(provider: AIProvider) {
  return async function extractController(req: Request, res: Response) {
    const validation = validateExtractRequest(req.body ?? {}, !!req.file);
    if (!validation.ok) {
      const body: ApiResponse<never> = { success: false, error: { code: 'INVALID_REQUEST', message: validation.message } };
      return res.status(400).json(body);
    }
    const { fields } = validation;

    if (fields.sourceType !== 'text' && req.file) {
      const fileCheck = checkUploadedFile(fields.sourceType as 'image' | 'pdf', req.file);
      if (!fileCheck.ok) {
        const body: ApiResponse<never> = { success: false, error: { code: 'UNSUPPORTED_FILE', message: fileCheck.message! } };
        return res.status(415).json(body);
      }
    }

    const start = Date.now();
    const outcome = await runExtraction(provider, {
      sourceType: fields.sourceType,
      text: fields.text,
      file: req.file ? { buffer: req.file.buffer, mimeType: req.file.mimetype } : undefined,
      currentDateISO: fields.currentDateISO,
    });
    const latencyMs = Date.now() - start;

    logUsage({ provider: provider.name, success: outcome.ok, latencyMs, errorCode: outcome.ok ? undefined : outcome.errorCode });

    if (!outcome.ok) {
      const body: ApiResponse<never> = { success: false, error: { code: outcome.errorCode, message: outcome.message } };
      return res.status(HTTP_STATUS_BY_ERROR_CODE[outcome.errorCode] ?? 502).json(body);
    }

    const body: ApiResponse<ExtractedTaskData> = {
      success: true,
      data: outcome.data,
      meta: { usedOcrFallback: outcome.usedOcrFallback },
    };
    return res.json(body);
  };
}
