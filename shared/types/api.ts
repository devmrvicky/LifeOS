// Shared HTTP contract between frontend and server. Every server route
// responds with one of these two shapes — never a bare object, never a raw
// error — so the frontend has exactly one envelope to unwrap.

export interface ApiSuccess<T> {
  success: true;
  data: T;
  /** Side-channel info about how the data was produced — never part of the
   * domain payload itself. Currently: whether OCR was used as a fallback
   * (e.g. a scanned PDF, or a text-only model paired with an image), which
   * the frontend uses to suggest the user double-check the result rather
   * than presenting it with the same confidence as a clean extraction. */
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  code: string;
  message: string; // always human-readable and safe to show directly — never a stack trace or provider internal
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
