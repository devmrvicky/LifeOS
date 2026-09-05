// ---------------------------------------------------------------------------
// Every model backend LifeOS's server can use implements this one interface.
// extractionService.ts (the orchestrator) and the rest of the server only
// ever depend on this — never on OpenRouter or Anthropic specifically — so
// swapping or adding a provider never touches routes, controllers, or the
// frontend. See providerFactory.ts for how the active provider is chosen.
// ---------------------------------------------------------------------------

export type ContentInput =
  | { type: 'text'; text: string }
  | { type: 'image'; base64: string; mediaType: string }
  | { type: 'pdf'; base64: string };

export interface AIProvider {
  readonly name: string;
  /** Whether this provider/model can accept image input directly. When
   * false, the extraction service routes images through OCR first and
   * only ever sends this provider text. */
  readonly supportsVision: boolean;
  extract(systemPrompt: string, content: ContentInput): Promise<string>;
}

export class ProviderUnavailableError extends Error {
  readonly code = 'AI_UNAVAILABLE' as const;
  /** Distinguishes "the key/config is wrong" from "the provider is just
   * down" for server-side logs only — the user-facing message is
   * intentionally the same either way (never reveal which one it is). */
  readonly reason: 'auth' | 'server' | 'unknown';
  constructor(message: string, reason: 'auth' | 'server' | 'unknown' = 'unknown') {
    super(message);
    this.reason = reason;
  }
}
export class ProviderTimeoutError extends Error {
  readonly code = 'AI_TIMEOUT' as const;
}
export class ProviderRateLimitError extends Error {
  readonly code = 'AI_RATE_LIMITED' as const;
}
