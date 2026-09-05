import type { AIProvider } from './AIProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { AnthropicProvider } from './AnthropicProvider';

export interface ProviderEnv {
  AI_PROVIDER?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_TEXT_ONLY?: string;
  OPENROUTER_SITE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}

/**
 * Chooses the active AI provider from environment configuration. This is
 * the one place in the whole codebase that knows provider names exist —
 * routes, controllers, and the extraction service only ever see the
 * `AIProvider` interface. Adding Gemini or OpenAI later means adding one
 * more branch here, nothing else.
 *
 * Default: OpenRouter, so Phase 1.2 runs on the free tier with no paid key
 * required (Step 6/29). Set AI_PROVIDER=anthropic to use a paid Anthropic
 * key instead, if one is already configured.
 */
export function createAIProvider(env: ProviderEnv = process.env): AIProvider {
  const selected = (env.AI_PROVIDER ?? 'openrouter').toLowerCase();

  if (selected === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set.');
    }
    return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
  }

  if (selected === 'openrouter') {
    if (!env.OPENROUTER_API_KEY) {
      throw new Error(
        'OPENROUTER_API_KEY is not set. Get a free key at https://openrouter.ai/keys and add it to server/.env.'
      );
    }
    return new OpenRouterProvider({
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL ?? 'openrouter/free',
      textOnly: env.OPENROUTER_TEXT_ONLY === 'true',
      siteUrl: env.OPENROUTER_SITE_URL,
      appName: 'LifeOS',
    });
  }

  throw new Error(`Unknown AI_PROVIDER "${selected}". Supported: openrouter, anthropic.`);
}
