import type { AnalyticsEvent } from '../types';

export interface AnalyticsSink {
  track(event: AnalyticsEvent, properties?: Record<string, unknown>): void;
}

/** Phase 1 sink: logs locally. Swap for a real analytics SDK later without touching call sites. */
class ConsoleAnalyticsSink implements AnalyticsSink {
  track(event: AnalyticsEvent, properties: Record<string, unknown> = {}): void {
    // eslint-disable-next-line no-console
    console.info(`[analytics] ${event}`, properties);
  }
}

class AnalyticsService {
  private sink: AnalyticsSink;
  constructor(sink: AnalyticsSink) {
    this.sink = sink;
  }
  track(event: AnalyticsEvent, properties?: Record<string, unknown>): void {
    this.sink.track(event, properties);
  }
}

export const analytics = new AnalyticsService(new ConsoleAnalyticsSink());
