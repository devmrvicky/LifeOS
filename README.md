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

---

## Phase 1.1 — Engineering Upgrade

### Audit summary (as required before changes)

**Current architecture (Phase 1 baseline):** React 19 + Vite + Tailwind, IndexedDB-only storage accessed directly by stores, single local rule-based extraction provider, no server component.

**What was working:** the full capture → confirm → remind loop, file/OCR/PDF handling, validation, error states, demo data.

**What was incomplete:** no server-side AI (Phase 1 could only ever be as good as a regex parser), no repository abstraction (stores talked to IndexedDB directly), `event_time` was conflated with `reminder_time`, no relative-date parsing, no PWA manifest/service worker, unlinked form labels.

**What changed:**
- Added `server/` — a real Express extraction API backed by the Anthropic SDK, with file security, error classification, and a fallback-safe contract.
- Added `src/repositories/` + `src/lib/storage/` — a `StorageAdapter` interface between the UI and IndexedDB.
- `AIService` now composes a primary provider (remote LLM, when configured) with the local engine as an automatic one-shot fallback.
- Added `event_time` as its own field, separate from `reminder_time`.
- Added relative-date parsing ("tomorrow", "next Monday", "in 3 days") resolved against an explicit reference date.
- Added a PWA manifest, real generated icons, and a service worker that caches the app shell only — never the extraction API.
- Linked every form `<label>` to its input; added `aria-label`s to icon-only interactive elements.

**What did NOT change:** the core loop, the UI design system/tokens, the local extraction engine's category naming (kept as the original plurals — see `src/types/index.ts` for why), IndexedDB as the Phase 1 store, and everything explicitly out of scope (no WhatsApp/email/calendar integration, no family accounts, no habit tracker, etc.).

### Running the server extraction API

```bash
cd server
cp .env.example .env   # then edit .env and add a real ANTHROPIC_API_KEY — never commit this file
cd ..
npm run server          # starts on :8787
```

Then set `VITE_EXTRACTION_ENDPOINT=http://localhost:8787/api/extract` in a `.env` at the project root before `npm run dev`/`build`, so the frontend's `RemoteLLMProvider` picks it up. Leave it unset to keep using the local engine only (Phase 1 behavior).

**Genuinely verified, not just unit-tested:** the server was actually started and hit over real HTTP in this environment, including one real network round-trip to `api.anthropic.com` — which correctly failed on an invalid test key and was cleanly remapped to a 503 with no leaked internals. File-security rejection of a spoofed-extension upload was verified live (415). A real `ANTHROPIC_API_KEY` was never available in this environment, so an actual successful extraction call has not been verified — that's the one thing to check first when you add your own key.

### A caught bug worth knowing about

The extraction prompt originally never told the model to return `source_type`, but the shared validation schema required it — every real extraction would have failed validation. Caught by the test suite (not by inspection), fixed by having the server inject `source_type` from the request itself rather than trusting the model to echo it back. Server and frontend validation schemas are duplicated by design (see `server/schema.ts`), not shared, since this is two separate build targets without a workspace set up — a deliberate simplicity trade-off per the "don't over-engineer an MVP" instruction, but it does mean the two must be kept in sync by hand.

### Dependency note

`dotenv`'s CLI output prints a random promotional "tip" line on every load (e.g. `tip: ⌘ enable debugging`). One of these, observed during testing, referenced a domain unrelated to dotenv's own product. It wasn't acted on or visited. Worth a quick look at `dotenv`'s changelog/issues before relying on it in production, independent of anything else in this codebase.

### Known gaps carried forward

- No successful end-to-end LLM extraction has been verified (no real API key available here).
- Vision/PDF-document extraction (Step 8/9) sends the file directly to the model as an image/document content block rather than degrading through OCR first, per the spec's preference — this is implemented but, like the above, unverified against a live key.
- PWA service worker covers the app shell only; AI processing (either provider) still requires network, and this is stated plainly in the UI/README rather than hidden.

---

## Phase 1.2 — Architecture Separation + Free AI Provider

### Audit summary (as required before changes)

**Current structure (Phase 1.1 baseline):** a single npm package at the repo root mixing frontend (`src/`) and server (`server/`) code and dependencies together; `server/schema.ts` duplicated the frontend's validation schema by hand; Anthropic was the only AI backend and required a paid key just to run the project at all.

**Problems:** no independent deployability for frontend vs. server; a paid API key was a hard requirement for anyone trying the project; the duplicated schema had already caused one real bug in Phase 1.1 (caught by tests, not by review).

**Files that moved:** everything under `src/` → `frontend/src/`; `public/`, `index.html`, `vite.config.ts`, and the frontend `tsconfig*.json` → `frontend/`; the flat `server/*.ts` files → a layered `server/src/{routes,controllers,services,validators,middleware,utils}/` structure; the extraction schema and all shared types → `shared/`.

**Files that stayed:** the core product loop, the UI design system, IndexedDB as local storage, `supabase/schema.sql`, the local rule-based extraction engine (still the frontend's automatic fallback).

**Architecture after refactor:**

```
frontend  →  POST /api/extract  →  server  →  AIProvider (OpenRouter | Anthropic)
                                       │
                                       ├── OCR (server-side, text-only-model fallback)
                                       └── PDF text extraction
```

The frontend never sees a provider name, a model name, or a key — only `shared/types/api.ts`'s `ApiResponse` envelope.

**Potential breaking changes:** the `/api/extract` response shape changed from a bare object to `{success, data}` / `{success, error}` — the frontend's `extractionApi.ts` was updated to match. `event_time` field naming, task/capture data model, and all UI behavior are unchanged.

### Folder structure

```
lifeos/
├── frontend/     # React/Vite UI — no AI keys, no provider knowledge, calls /api/extract only
├── server/       # Express API — the only place with API keys, provider selection, OCR/PDF processing
├── shared/       # Types + zod schema — the single source both sides import (npm workspace package)
└── supabase/     # Future sync schema (unused by Phase 1.2 itself)
```

### AI provider

**Default: OpenRouter**, specifically the `openrouter/free` auto-router, which picks an available free model and — per OpenRouter's own docs — automatically prefers one that supports image input when a request needs it. No paid key required to run Phase 1.2 end to end. Get a free key at https://openrouter.ai/keys.

The server depends on `AIProvider` (`server/src/services/ai/AIProvider.ts`), never on OpenRouter specifically — `providerFactory.ts` is the one place that reads `AI_PROVIDER` from the environment and picks an implementation. Anthropic is still available (`AI_PROVIDER=anthropic`, paid, optional) behind the exact same interface. Adding Gemini or OpenAI later is one new file plus one new branch in `providerFactory.ts` — nothing else changes.

If the configured model can't accept images, `OPENROUTER_TEXT_ONLY=true` routes images through server-side OCR (`services/ocr/`) first. PDFs always get their text extracted server-side (`services/pdf/`) before reaching any provider, since OpenRouter's chat-completions API has no native document input the way Anthropic's does.

### Local setup

```bash
npm install                          # installs all three workspaces from the root
cp server/.env.example server/.env   # then add a free OPENROUTER_API_KEY — never commit this file
npm run dev                          # starts server + frontend together
```

Or run them separately: `npm run dev:server` / `npm run dev:frontend`.

### Genuinely verified, not just claimed

The restructured server was actually started and hit over real HTTP after the refactor — health check, CORS (both an allowed origin correctly reflected and a disallowed one correctly rejected), and one real network round-trip to OpenRouter with an invalid test key, which correctly failed and was cleanly remapped to `AI_UNAVAILABLE`/503 with no leaked internals. 49 automated tests pass across both workspaces (`npm test` from the root). A real `OPENROUTER_API_KEY` was never available in this environment, so an actual successful extraction call is still unverified — check that first once you add your own free key.

Two real bugs were caught by tooling during this refactor, not by inspection: `shared/` had no `node_modules` of its own, so `zod` failed to resolve until the project became proper npm workspaces (hoisting shared deps to the root); and Vitest doesn't read TypeScript's `paths` config the way `tsx` does, so the server needed its own explicit `vitest.config.ts` alias for `@shared` even though `tsc` and `tsx` already had it working.

### Known gaps carried forward

- Scanned/image-only PDFs return a clear, honest error asking for an image upload instead — true scanned-PDF support would need a PDF-to-image rendering dependency (poppler/pdfium) that wasn't added, per the "don't add unnecessary tooling" instruction for this phase.
- `ReminderService` (`server/src/services/reminders/`) is an interface-level placeholder — nothing calls it yet. Reminders are still created and stored entirely client-side in IndexedDB, same as Phase 1.1.
- As in Phase 1.1: real push notifications, and PWA offline shell only (AI processing always requires network) — see the Phase 1.1 section above for what production push would require.

---

## Phase 1.2.1 — Reliability, Scanned PDF Fallback, AI Robustness

### Audit summary (as required before changes)

**Working correctly:** frontend/server separation, OpenRouter as the default free provider, provider abstraction, text extraction, image extraction (vision-first with OCR fallback for text-only models), 401/429/5xx/timeout classification, one-retry policy, manual task creation, CORS, no secret exposure.

**Problems found:**
1. Scanned/image-only PDFs simply failed with an error asking the user to upload an image instead — no real OCR fallback existed yet, despite being flagged as a known gap.
2. The `pdf-parse` npm package threw `bad XRef entry` on a perfectly valid, freshly-generated PDF during testing for this phase — a real reliability bug, not a hypothetical one.
3. Server-side OCR (tesseract.js) depended on a runtime fetch to `cdn.jsdelivr.net` for language data — an unnecessary external dependency for something that should work offline once deployed.
4. The retry policy retried authentication failures (401/invalid key) exactly like transient server errors — wasting a call on something that will never succeed on retry, contrary to this phase's own Step 6.
5. A message/regex mismatch in the frontend's error classifier meant a "file too large" message could fall through to a generic error instead of the correct one.

**Changes required:** replace the PDF pipeline with poppler-utils, bundle OCR language data locally, add a true scanned-PDF→OCR fallback, distinguish auth failures from generic unavailability in the retry policy and server logs, fix the message-classification bug.

### A. Changed files (most important)

- `server/src/services/pdf/pdfTextService.ts` — full rewrite: poppler-utils (`pdftotext`/`pdftoppm`) instead of `pdf-parse`; real scanned-PDF→render→OCR fallback; distinct `PasswordProtectedPdfError` / `CorruptedPdfError` / `ScannedPdfOcrFailedError`.
- `server/src/services/ocr/ocrService.ts` — bundled local training data (`server/tessdata/`) instead of a runtime CDN fetch.
- `server/src/services/extraction/extractionService.ts` — wires the new PDF error types to error codes; fixes the retry policy to never retry an auth failure; exact spec-mandated user-facing copy for timeout/rate-limit/unavailable.
- `server/src/services/ai/AIProvider.ts`, `AnthropicProvider.ts`, `OpenRouterProvider.ts` — `ProviderUnavailableError` now carries a `reason: 'auth' | 'server'` used only for server-side logging (`"AI authentication failure"` on 401/403) — the user-facing message is intentionally identical either way.
- `frontend/src/store/captureStore.ts` — error classifier now preserves the server's already-friendly message instead of overwriting it; fixed the "file too large" matching bug; threads a new `usedOcrFallback` signal.
- `shared/types/api.ts`, `shared/types/index.ts` — added `meta` to the success envelope and new `pdf_password_protected`/`pdf_unreadable` error codes.
- `server/src/services/pdf/__fixtures__/` (new) — real test PDFs (text, scanned, corrupted, password-protected, blank) used by genuine integration tests, not mocks.
- Removed: `pdf-parse` / `@types/pdf-parse` (replaced by poppler-utils; no longer used anywhere).

### B. Final architecture

```
Frontend  →  POST /api/extract  →  Extraction Service
                                          │
                                          ├── Text: straight to AI Provider
                                          ├── Image: vision (default) or OCR → text, then AI Provider
                                          └── PDF: text layer → AI Provider
                                                    │ (no usable text)
                                                    ↓
                                              render pages → OCR → AI Provider
                                          │
                                          ↓
                                   AI Provider (OpenRouter default | Anthropic optional)
                                          │
                                          ↓
                                  Zod Validation (shared schema)
                                          │
                                          ↓
                                Frontend Confirmation (flags OCR-derived
                                results for extra review)
```

### C. Test results

All genuinely run, not assumed:

| Test | Result |
|---|---|
| Text extraction | **PASS** — real HTTP call, correctly reached the AI provider call |
| Image extraction | **PASS** — real HTTP call with a real PNG, correctly reached the AI provider call via the vision path |
| Normal PDF | **PASS** — real text layer extracted via poppler-utils, verified by integration test and live HTTP call |
| Scanned PDF | **PASS** — OCR fallback verified by integration test (real render + real OCR, recovered the actual text) and live HTTP call |
| Password-protected PDF | **PASS** — correctly short-circuits before OCR/AI, distinct `PDF_PASSWORD_PROTECTED`/422 |
| Corrupted PDF | **PASS** — distinct `CorruptedPdfError`, no raw parser error leaked |
| AI failure (401, invalid key) | **PASS** — live HTTP call against a real invalid key, correctly mapped to `AI_UNAVAILABLE`/503 with the exact spec-mandated message, zero retries (verified by call-count test) |
| 429 (rate limit) | **PASS** — unit-tested via mocked provider, zero retries |
| Timeout | **PASS** — unit-tested, exactly one retry then a clean failure |
| Build | **PASS** — `npm run build` succeeds; `tsc --noEmit` clean on both frontend and server |
| Full test suite | **PASS** — 59 tests (38 server, including 7 real integration tests against real PDF files; 21 frontend) |

### D. Known limitations (stated plainly)

- **No real `OPENROUTER_API_KEY` was available in this environment.** Every AI-provider call in the manual end-to-end tests above used a deliberately invalid key to verify the *pipeline and error handling* — an actual successful extraction from a live free model has still never been verified. Check that first.
- **poppler-utils is now a required system dependency**, not an npm package — `pdftotext` and `pdftoppm` must be installed on whatever machine runs the server (`apt install poppler-utils` on Debian/Ubuntu; already present in most container base images with PDF tooling). This is a new, real deployment requirement introduced by this phase, not previously true.
- **OCR quality**: tesseract.js is meaningfully weaker than a vision-capable LLM on messy/low-contrast scans — this is exactly why vision is preferred whenever the configured model supports it, and OCR-derived results are now flagged in the confirmation UI for extra scrutiny rather than presented with equal confidence.
- **No true push notifications** — reminders are still local-only (IndexedDB) and fire only while the app is open. `ReminderService` remains an interface-level placeholder; nothing calls it yet.
- **Password-protected PDFs are not decrypted** — LifeOS asks the user to remove the password rather than attempting to guess or crack it, which is the only responsible behavior here.
- A dotenv "tip" line referencing an unrelated domain (`vestauth.com`) appeared again during this phase's testing, exactly as noted in the Phase 1.2 section above — still not acted on, still worth an independent look before relying on this dependency long-term.

### E. Run instructions

```bash
npm install
cp server/.env.example server/.env   # add a free OPENROUTER_API_KEY — https://openrouter.ai/keys
npm run dev                          # starts server + frontend together
```

**Requirements:** Node.js 20+, and `poppler-utils` installed on the machine running the server (provides `pdftotext`/`pdftoppm` — required for any PDF upload, not just scanned ones).

**Troubleshooting:**
- *"AI processing is temporarily unavailable"* — check `OPENROUTER_API_KEY` is set correctly in `server/.env`; server logs will say `AI authentication failure` specifically if it's a bad key vs. a general outage.
- *429 / "AI usage limit reached"* — the free tier is rate-limited; wait and retry, or create the reminder manually in the meantime.
- *AI timeout* — the request took too long; try again, or switch `OPENROUTER_MODEL` to a smaller/faster free model.
- *Scanned PDF taking a while* — expected; OCR runs server-side and is slower than a direct text read.
- *Unsupported file* — only PNG/JPEG/WebP/HEIC images and PDFs are accepted; both the extension and the actual file content are checked.
- *`pdftotext: command not found`* — install poppler-utils on the server host.
