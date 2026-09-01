import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA app-shell caching (Step 18). Registered after load so it never
// delays first paint. Safe to skip silently where service workers aren't
// supported — the app still works, just without offline shell caching.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal — LifeOS works fully online without the offline shell.
    });
  });
}
