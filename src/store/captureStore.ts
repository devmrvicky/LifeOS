import { create } from 'zustand';
import type { AppError, Capture, ExtractedTaskData, ProcessingStatus, SourceType } from '../types';
import { captureRepo } from '../lib/db';
import { getLocalUserId } from '../lib/localUser';
import { aiService } from '../services/aiService';
import { analytics } from '../services/analyticsService';
import { validateFile } from '../services/fileTextExtractor';

interface CaptureStore {
  status: ProcessingStatus | 'idle';
  currentCapture: Capture | null;
  error: AppError | null;
  reset: () => void;
  runCapture: (input: { sourceType: SourceType; text?: string; file?: File }) => Promise<void>;
}

function mapErrorToAppError(message: string): AppError {
  if (/too large/i.test(message)) return { code: 'file_too_large', message };
  if (/unsupported|doesn't look like/i.test(message)) return { code: 'unsupported_file', message };
  if (/OCR|image/i.test(message)) return { code: 'ocr_failed', message };
  if (/PDF/i.test(message)) return { code: 'ocr_failed', message };
  return { code: 'ai_failed', message: "Something went wrong understanding that. You can still add it manually." };
}

export const useCaptureStore = create<CaptureStore>((set) => ({
  status: 'idle',
  currentCapture: null,
  error: null,

  reset() {
    set({ status: 'idle', currentCapture: null, error: null });
  },

  async runCapture({ sourceType, text, file }) {
    analytics.track('capture_started', { source_type: sourceType });
    set({ status: 'processing', error: null, currentCapture: null });

    if (file) {
      const kind = sourceType === 'image' ? 'image' : 'pdf';
      const fileError = validateFile(file, kind as 'image' | 'pdf');
      if (fileError) {
        set({ status: 'failed', error: fileError });
        return;
      }
    }
    analytics.track('capture_uploaded', { source_type: sourceType });

    const captureId = crypto.randomUUID();

    try {
      const result = await aiService.extractActionableInformation({ sourceType, text, file });

      if (!result.ok || !result.data) {
        const appError = mapErrorToAppError(result.errors.join('; ') || 'invalid AI response');
        const capture: Capture = {
          id: captureId,
          user_id: getLocalUserId(),
          source_type: sourceType,
          original_text: result.rawText,
          file_reference: file ? file.name : null,
          processing_status: 'failed',
          extracted: null,
          error_message: appError.message,
          created_at: new Date().toISOString(),
        };
        await captureRepo.put(capture);
        analytics.track('ai_extraction_failed', { source_type: sourceType, reason: appError.code });
        set({ status: 'failed', error: appError, currentCapture: capture });
        return;
      }

      const data: ExtractedTaskData = result.data;
      const processingStatus: ProcessingStatus = data.has_actionable_information ? 'success' : 'no_action';

      const capture: Capture = {
        id: captureId,
        user_id: getLocalUserId(),
        source_type: sourceType,
        original_text: result.rawText,
        file_reference: file ? file.name : null,
        processing_status: processingStatus,
        extracted: data,
        error_message: null,
        created_at: new Date().toISOString(),
      };
      await captureRepo.put(capture);

      if (processingStatus === 'success') {
        analytics.track('ai_extraction_success', { source_type: sourceType, confidence: data.confidence });
      }

      set({ status: processingStatus, currentCapture: capture, error: null });
    } catch (err) {
      const appError = mapErrorToAppError(err instanceof Error ? err.message : 'unknown error');
      analytics.track('ai_extraction_failed', { source_type: sourceType, reason: appError.code });
      set({ status: 'failed', error: appError });
    }
  },
}));
