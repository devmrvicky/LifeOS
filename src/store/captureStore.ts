import { create } from 'zustand';
import type { AppError, Capture, ExtractedTaskData, ProcessingStatus, SourceType } from '../types';
import { captureRepository } from '../repositories';
import { getLocalUserId } from '../lib/localUser';
import { aiService } from '../services/aiService';
import { analytics } from '../services/analyticsService';
import { validateFile } from '../services/fileTextExtractor';

interface CaptureStore {
  status: ProcessingStatus | 'idle';
  currentCapture: Capture | null;
  error: AppError | null;
  usedFallback: boolean;
  reset: () => void;
  runCapture: (input: { sourceType: SourceType; text?: string; file?: File }) => Promise<void>;
}

function mapErrorToAppError(message: string): AppError {
  if (/too large/i.test(message)) return { code: 'file_too_large', message };
  if (/unsupported|doesn't look like/i.test(message)) return { code: 'unsupported_file', message };
  if (/ai_timeout|took too long/i.test(message)) return { code: 'ai_timeout', message: 'The AI took too long to respond.' };
  if (/ai_rate_limited|rate.?limit/i.test(message)) return { code: 'ai_rate_limited', message: 'The AI service is busy right now. Please try again shortly.' };
  if (/ai_unavailable|not configured|unavailable/i.test(message)) return { code: 'ai_unavailable', message: "LifeOS couldn't reach the AI service." };
  if (/invalid_ai_response/i.test(message)) return { code: 'invalid_ai_response', message: "The AI's response didn't make sense, so nothing was created." };
  if (/network_failed|could not reach/i.test(message)) return { code: 'network_failed', message: "LifeOS couldn't reach the server." };
  if (/OCR|image/i.test(message)) return { code: 'ocr_failed', message: 'Could not read that image.' };
  if (/PDF/i.test(message)) return { code: 'ocr_failed', message: 'Could not read that PDF.' };
  return { code: 'ai_failed', message: 'Something went wrong understanding that. You can still add it manually.' };
}

export const useCaptureStore = create<CaptureStore>((set) => ({
  status: 'idle',
  currentCapture: null,
  error: null,
  usedFallback: false,

  reset() {
    set({ status: 'idle', currentCapture: null, error: null, usedFallback: false });
  },

  async runCapture({ sourceType, text, file }) {
    analytics.track('capture_started', { source_type: sourceType });
    set({ status: 'processing', error: null, currentCapture: null, usedFallback: false });

    if (file) {
      const kind = sourceType === 'image' ? 'image' : 'pdf';
      const fileError = validateFile(file, kind as 'image' | 'pdf');
      if (fileError) {
        set({ status: 'failed', error: fileError });
        return;
      }
    }
    analytics.track('capture_uploaded', { source_type: sourceType });
    analytics.track('capture_processing', { source_type: sourceType });

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
        await captureRepository.put(capture);
        analytics.track('ai_extraction_failed', { source_type: sourceType, reason: appError.code, served_by: result.servedBy });
        set({ status: 'failed', error: appError, currentCapture: capture, usedFallback: result.usedFallback });
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
      await captureRepository.put(capture);

      if (processingStatus === 'success') {
        analytics.track('ai_extraction_success', {
          source_type: sourceType,
          confidence: data.confidence,
          served_by: result.servedBy,
          used_fallback: result.usedFallback,
        });
      }

      set({ status: processingStatus, currentCapture: capture, error: null, usedFallback: result.usedFallback });
    } catch (err) {
      const appError = mapErrorToAppError(err instanceof Error ? err.message : 'unknown error');
      analytics.track('ai_extraction_failed', { source_type: sourceType, reason: appError.code });
      set({ status: 'failed', error: appError });
    }
  },
}));
