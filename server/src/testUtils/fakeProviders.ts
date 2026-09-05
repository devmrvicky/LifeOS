import type { AIProvider, ContentInput } from '../services/ai/AIProvider';

/** Returns a fixed string every time — for testing the parse/validate path. */
export class ScriptedProvider implements AIProvider {
  readonly name = 'scripted';
  readonly supportsVision: boolean;
  private response: string | (() => string);

  constructor(response: string | (() => string), supportsVision = true) {
    this.response = response;
    this.supportsVision = supportsVision;
  }

  async extract(_systemPrompt: string, _content: ContentInput): Promise<string> {
    return typeof this.response === 'function' ? this.response() : this.response;
  }
}

/** Always throws the given error — for testing error-classification paths. */
export class FailingProvider implements AIProvider {
  readonly name = 'failing';
  readonly supportsVision = true;
  private error: Error;

  constructor(error: Error) {
    this.error = error;
  }

  async extract(): Promise<string> {
    throw this.error;
  }
}
