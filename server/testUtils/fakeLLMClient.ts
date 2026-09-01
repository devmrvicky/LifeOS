import type { LLMClient, ContentInput } from '../llmClient';

/** Returns a fixed string every time — for testing the parse/validate path. */
export class ScriptedLLMClient implements LLMClient {
  private response: string | (() => string);
  constructor(response: string | (() => string)) {
    this.response = response;
  }
  async extract(_systemPrompt: string, _content: ContentInput): Promise<string> {
    return typeof this.response === 'function' ? this.response() : this.response;
  }
}

/** Always throws the given error — for testing error-classification paths. */
export class FailingLLMClient implements LLMClient {
  private error: Error;
  constructor(error: Error) {
    this.error = error;
  }
  async extract(): Promise<string> {
    throw this.error;
  }
}
