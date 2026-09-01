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
