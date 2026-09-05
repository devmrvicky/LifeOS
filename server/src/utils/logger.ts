export interface UsageLogEntry {
  provider: string;
  model?: string;
  success: boolean;
  latencyMs: number;
  errorCode?: string;
}

/**
 * Logs enough to answer "is the free tier holding up" without ever writing
 * a document's contents, a prompt, a response body, or any credential to
 * the log — those never pass through this function's parameters at all,
 * so there's nothing to accidentally leak here.
 */
export function logUsage(entry: UsageLogEntry): void {
  if (process.env.NODE_ENV === 'test') return;
  const line = {
    ts: new Date().toISOString(),
    provider: entry.provider,
    model: entry.model,
    success: entry.success,
    latency_ms: entry.latencyMs,
    error_code: entry.errorCode,
  };
  console.info('[usage]', JSON.stringify(line));
}
