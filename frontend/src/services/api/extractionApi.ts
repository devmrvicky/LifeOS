import type { ApiResponse, ExtractedTaskData, SourceType } from '../../types';
import { todayISO } from '../../utils/dateUtils';

// ---------------------------------------------------------------------------
// The frontend calls POST /api/extract and reads back the shared ApiResponse
// envelope — it never knows or cares whether the server is currently backed
// by OpenRouter, Anthropic, or anything else (Step 16/"CTO RULE"). That
// decision belongs entirely to the server's providerFactory.
// ---------------------------------------------------------------------------

export interface ExtractionApiInput {
  sourceType: SourceType;
  text?: string;
  file?: File;
}

export class ExtractionApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function createExtractionApi(endpoint: string | null) {
  return {
    async extract(input: ExtractionApiInput): Promise<{ data: ExtractedTaskData; usedOcrFallback: boolean }> {
      if (!endpoint) {
        throw new ExtractionApiError('NOT_CONFIGURED', 'No extraction server is configured (VITE_EXTRACTION_ENDPOINT is unset).');
      }

      const body = new FormData();
      body.append('sourceType', input.sourceType);
      body.append('currentDateISO', todayISO());
      if (input.text) body.append('text', input.text);
      if (input.file) body.append('file', input.file);

      let res: Response;
      try {
        res = await fetch(endpoint, { method: 'POST', body });
      } catch {
        throw new ExtractionApiError('NETWORK_FAILED', 'Could not reach the extraction server.');
      }

      let json: ApiResponse<ExtractedTaskData>;
      try {
        json = await res.json();
      } catch {
        throw new ExtractionApiError('INVALID_RESPONSE', 'The extraction server returned an unreadable response.');
      }

      if (!json.success) {
        throw new ExtractionApiError(json.error?.code ?? 'UNKNOWN', json.error?.message ?? 'Extraction server error.');
      }
      return { data: json.data, usedOcrFallback: json.meta?.usedOcrFallback === true };
    },
  };
}

export type ExtractionApi = ReturnType<typeof createExtractionApi>;
