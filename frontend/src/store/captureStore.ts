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
  usedOcrFallback: boolean;
  reset: () => void;
  runCapture: (input: { sourceType: SourceType; text?: string; file?: File }) => Promise<void>;
}

// Server-composed messages (see server/src/services/ai/*, pdf/pdfTextService.ts)
// are already written to be shown directly to the user, so this only picks
// the error *code* from keywords in the message — it never substitutes a
// different message, which would risk replacing a specific, helpful message
// ("This PDF is password-protected...") with a vague fallback.
function mapErrorToAppError(message: string): AppError {
  if (/password.?protected/i.test(message)) return { code: 'pdf_password_protected', message };
  if (/too large|larger than/i.test(message)) return { code: 'file_too_large', message };
  if (/unsupported|doesn't look like/i.test(message)) return { code: 'unsupported_file', message };
  if (/took too long/i.test(message)) return { code: 'ai_timeout', message };
  if (/usage limit reached|rate.?limit/i.test(message)) return { code: 'ai_rate_limited', message };
  if (/temporarily unavailable|not configured|check your configuration/i.test(message)) return { code: 'ai_unavailable', message };
  if (/response didn't make sense|not valid JSON|invalid_ai_response/i.test(message)) {
    return { code: 'invalid_ai_response', message: "The AI's response didn't make sense, so nothing was created." };
  }
  if (/could not reach the (extraction )?server|network_failed/i.test(message)) return { code: 'network_failed', message };
  if (/couldn't read this pdf|couldn't open this pdf/i.test(message)) return { code: 'pdf_unreadable', message };
  if (/OCR|image/i.test(message)) return { code: 'ocr_failed', message: 'Could not read that image.' };
  if (/PDF/i.test(message)) return { code: 'pdf_unreadable', message };
  return { code: 'ai_failed', message: "We couldn't understand this. You can still add it manually." };
}

export const useCaptureStore = create<CaptureStore>((set) => ({
  status: 'idle',
  currentCapture: null,
  error: null,
  usedFallback: false,
  usedOcrFallback: false,

  reset() {
    set({ status: 'idle', currentCapture: null, error: null, usedFallback: false, usedOcrFallback: false });
  },

  async runCapture({ sourceType, text, file }) {
    analytics.track('capture_started', { source_type: sourceType });
    set({ status: 'processing', error: null, currentCapture: null, usedFallback: false, usedOcrFallback: false });

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
          used_ocr_fallback: result.usedOcrFallback,
        });
      }

      set({
        status: processingStatus,
        currentCapture: capture,
        error: null,
        usedFallback: result.usedFallback,
        usedOcrFallback: result.usedOcrFallback,
      });
    } catch (err) {
      const appError = mapErrorToAppError(err instanceof Error ? err.message : 'unknown error');
      analytics.track('ai_extraction_failed', { source_type: sourceType, reason: appError.code });
      set({ status: 'failed', error: appError });
    }
  },
}));
