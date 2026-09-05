import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from './app';
import { createAIProvider } from './services/ai/providerFactory';

// Load server/.env regardless of the working directory the process was
// started from.
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const port = Number(process.env.PORT ?? 8787);
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : undefined;

const provider = createAIProvider(process.env);
const app = createApp(provider, allowedOrigins ? { allowedOrigins } : {});

app.listen(port, () => {
  console.log(`[server] LifeOS extraction API listening on :${port} (provider: ${provider.name})`);
});
