# LifeOS — Phase 1 MVP

> "Don't remember it. Just give it to LifeOS."

Capture → Understand → Confirm → Remind. Upload a screenshot, a PDF, or
paste text; LifeOS extracts a structured task/reminder, you confirm or
edit it, it lands on Home.

## 1. Project audit

No existing project was found — this is a fresh build. Stack chosen below
is a modern, maintainable, production-appropriate MVP stack (React 19 +
TypeScript + Vite 8 + Tailwind v4), well suited to an offline-first,
sync-optional app.

## 2. Architecture

```
Capture UI (image / pdf / text)
        |
        v
AIService.extractActionableInformation(input)   <- src/services/aiService.ts
        |  (provider is swappable -- see §6)
        v
Zod validation layer                             <- src/lib/validation.ts
        |  (never trusts raw AI output; malformed/inconsistent data
        |   is rejected here, not downstream)
        v
Confirmation UI (user reviews, edits, confirms)   <- ConfirmationCard.tsx
        |
        v
Zustand stores (taskStore, captureStore)          <- src/store/
        |
        v
IndexedDB (offline-first, local-only in Phase 1)  <- src/lib/db.ts
        |
        v
(future) Supabase sync for signed-in users        <- supabase/schema.sql
```

Every layer only talks to the layer directly below it through a typed
interface, so any one of them (a real LLM provider, a Postgres backend,
push notifications) can be swapped without a rewrite.

### Why a local rule-based provider, not a live AI call

There is no backend or API key available in this build environment, and
the brief is explicit: do not fake AI processing if no backend exists.
So Phase 1's default `AIProvider` (`LocalRuleBasedProvider`) genuinely:

1. Runs OCR on images in-browser via `tesseract.js`.
2. Extracts text from PDFs in-browser via `pdfjs-dist`.
3. Runs a real rule-based parser (`src/services/textExtractor.ts`) over
   that text — regex-driven date/amount/category detection, event-vs-
   deadline classification, reminder-date suggestion, and a genuine
   confidence score. Output depends entirely on the input; nothing is
   hard-coded or canned.

This is honestly a simpler engine than an LLM (it won't parse unusually
phrased text as well as GPT/Claude would), but it is real, it runs with
zero configuration, and the whole Capture → Understand → Confirm → Remind
loop is fully testable today. See §6 for wiring up a production LLM.

## 3. Database schema

`supabase/schema.sql` — `users`, `captures`, `tasks`, `reminder_events`,
plus an `entitlements` scaffold (architecture-only, no payment gateway
per spec). Row-level security policies restrict every table to its
owning user. Phase 1 itself runs entirely on the client against a
field-for-field mirror in IndexedDB (`src/lib/db.ts`), so wiring Supabase
later is an upsert layer, not a remodel.

## 4. Environment variables / services

None are required to run Phase 1 as shipped. One optional variable:

| Variable | Purpose | Required? |
|---|---|---|
| `VITE_EXTRACTION_ENDPOINT` | URL of a server route that calls a real LLM with a server-side key. When unset, LifeOS uses the local rule-based provider. | No — Phase 1 default |

No API keys live in this codebase. `RemoteLLMProvider` (in
`src/services/aiService.ts`) posts the capture to your own server
endpoint — it never calls a model provider directly from the browser.

## 5. Running it

```bash
npm install
npm run dev       # local dev server
npm run build     # production build → dist/
npm run test      # vitest — extraction engine test suite
```

Open Settings → "Load demo data" to seed the 5 sample tasks from spec
§23 (electricity bill, insurance renewal, doctor appointment, exam
deadline, flight ticket) without touching real captures.

## 6. Enabling a production AI provider

1. Stand up a server route (Vercel/Cloudflare function, Supabase Edge
   Function, etc.) that accepts the same `FormData` shape
   `RemoteLLMProvider` sends (`sourceType`, `text` or `file`), calls your
   model with a server-side API key, and returns JSON matching
   `ExtractedTaskData` in `src/types/index.ts`.
2. Set `VITE_EXTRACTION_ENDPOINT` to that route's URL.
3. Nothing else changes — `aiService` picks up `RemoteLLMProvider`
   automatically (see the bottom of `src/services/aiService.ts`), and
   every downstream layer (validation, confirmation UI, storage) is
   already provider-agnostic.

## 7. Enabling production push notifications

`src/services/notificationService.ts` currently only supports in-page
browser notifications (real, but only fire while the tab is open — it
does not pretend to deliver background push). To get real background
push:

1. Register a service worker and subscribe it via the Push API (or wrap
   the app for FCM/APNs if it ships as a native/PWA install).
2. Store the push subscription against the `users` row server-side.
3. Run a scheduler that polls `reminder_events` for
   `scheduled_for <= now() and status = 'scheduled'` and delivers
   through that subscription, then marks the row `fired`.

## 8. Known risks / blockers (Phase 1)

- **OCR quality**: `tesseract.js` is noticeably weaker than a modern
  multimodal LLM on messy or low-contrast screenshots. Expect lower
  confidence scores and more manual correction than a production LLM
  provider would need. This is surfaced to the user in the confirmation
  card whenever confidence is low, per spec §8/§9.
- **tesseract.js bundle size**: it lazy-loads its WASM core and language
  data from the network at OCR time — the very first image capture needs
  connectivity even though the rest of the app is offline-first. This is
  a real gap in the "everything offline" pitch, disclosed rather than
  hidden.
- **No real push notifications**, by design (see §7) — reminders only
  fire while the app tab is open, matching the "do not fake notification
  functionality" instruction.
- **No auth yet**: Phase 1 uses a locally-generated anonymous user id
  (`src/lib/localUser.ts`) so the data model already matches "signed-in"
  shape; a real auth flow (and the Supabase sync it would unlock) is
  explicitly out of Phase 1 scope per spec §2.
- **Rule-based extraction has real limits**: natural-language dates
  outside the "Month Day[, Year]" / "Day Month" patterns, relative dates
  ("next Friday"), and multi-date documents (e.g. a PDF with several line
  items) are not reliably handled. Swapping in a real LLM provider (§6)
  is the intended fix, not a bigger regex.

## 9. What's deliberately not built (per spec §2/§32)

Social features, family accounts, collaboration, calendar/WhatsApp/email
integration, voice assistant, habit tracking, expense management, a full
chatbot, autonomous agents, an analytics dashboard, B2B features, real
payments, gamification. All excluded so Phase 1 stays focused on proving
one loop: will people repeatedly hand LifeOS information because they
trust it to remember for them?

## 10. Definition of done — status

- [x] User can open the app, understand the product immediately (empty state)
- [x] Upload image → OCR → structured extraction
- [x] Upload PDF → text extraction → structured extraction
- [x] Paste text → structured extraction
- [x] Processing state shown ("LifeOS is understanding this…")
- [x] AI output validated before touching UI/DB (zod)
- [x] User reviews + can edit every field before confirming
- [x] Confirmed task appears on Home (Today/Upcoming/Recently Captured)
- [x] Task can be completed, edited, deleted
- [x] "No actionable information" path (no auto-created task) + manual fallback
- [x] Error states for unsupported file, oversized file, OCR/PDF failure, AI failure — human-readable, no stack traces
- [x] Mobile-first responsive UI, bottom navigation
- [x] No secrets in frontend code
- [x] No fake functionality presented as real (documented honestly in §8 instead)
- [x] Analytics event abstraction (console sink, no dashboard)
- [x] Demo/seed data, clearly separated (`demo-` id prefix, only loaded from Settings)
- [x] `npm run build` and `npm run test` both verified green
- [ ] Two-user data isolation (scenario 7) — not testable in Phase 1 since there is no auth/backend yet; the schema's RLS policies (`supabase/schema.sql`) are what will enforce it once sync ships
