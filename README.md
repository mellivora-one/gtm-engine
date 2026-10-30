# GTM Engine

A blue, responsive AI onboarding flow: description and/or public website → Tavily extraction → editable product brief → human confirmation → suggested ideal customers → human confirmation → exportable discovery plan.

## What works

- OpenAI Responses API Structured Outputs generates real product briefs and customer profiles using the pinned `gpt-4.1-mini-2025-04-14` model.
- Briefs cover product features, technical constraints, benefits, audience, pricing, and existing customers. Unknown facts stay empty; important gaps become clarification questions.
- ICP suggestions include industries, size tiers, buyer roles, and possible buying triggers. Inferences and uncalibrated model confidence are clearly labeled. Users edit and approve both stages.
- Both AI stages share one Run ID. Provider response IDs and usage are recorded without logging product descriptions.
- Real loading states, skeletons, motion, mobile layouts, accessible native controls, and reduced-motion support are included.
- Browser-local workspace persistence and a JSON plan export work without an account. “Try an example” only fills illustrative input; the primary analysis action still makes a real model request.

## Website intake (Tavily)

The first screen accepts a public website URL without a description. On **Understand my product**, the server validates the URL/DNS, atomically reserves the demo allowances, and calls Tavily's official `/extract` endpoint with one URL, `extract_depth: basic`, and no automatic retries. Bounded website text is passed to OpenAI as untrusted evidence, not instructions. The editable brief shows source [S1], retrieval time, an extracted excerpt, and website-origin field labels. Website claims are not independent verification. Only the submitted page is read: no recursive crawling, automatic search, or pricing-page discovery.

LinkedIn URLs are not scraped. Users are asked to provide the chosen project's public website or remove the link and paste a description. An employer is never silently assumed to be the product. Local/private/IP-literal targets, credentials, and nonstandard ports are rejected. The app only fetches the fixed Tavily API endpoint; remote-page access and redirects are handled by the provider. Failed/empty extraction does not dispatch OpenAI or fall back to fabricated evidence. Inputs remain editable and manual mode is available.

## Spending and abuse protection

A dedicated **private Vercel Blob** stores one durable ledger. Conditional writes use ETags (`ifMatch`), and reads bypass the CDN cache. Model dispatch happens only after an atomic reservation succeeds.

- One fixed 72-hour application window: no reset on deployment, process restart, error, or browser refresh.
- A $40 **reservation allowance**, with a conservative $0.10 reserved per attempt: at most 400 model dispatches across local and deployed use.
- The input body is capped at 18 KB; the model and output-token limit are fixed server-side. At verified standard pricing ($0.40 / million input tokens, $1.60 / million output tokens), the bounded maximum request cost fits well below the $0.10 allowance.
- Reservations are never refunded on failure, timeout, cancellation, refusal, or unknown outcome. The application may stop before actual API usage reaches $40. Displayed reserved amounts are **not** measured charges.
- Published-rate cost estimates and provider-reported token counts are stored separately from reservations. They are not billing receipts.
- Rate limits: 3 attempts per minute and 40 per day per hashed connection identifier; 12 per minute globally. This is a public demo with rate/spend controls, not authenticated user accounts.
- Tavily has a separate **200-credit application reservation ceiling**, authorized for this demo including testing. Each single-page basic attempt conservatively reserves 1 credit (official pricing is 1 credit per 5 successful URL extractions). At most 200 attempts; actual provider-reported credits are recorded separately. Reservations are never refunded, including failed/unknown attempts. No search/crawl/research endpoint or paid-plan change is enabled. This does not cap use of the key elsewhere or change provider billing settings.
- Tavily and OpenAI reservations are committed together in the existing ledger, preserving its original fixed cutoff. Redeployments do not reset either allowance. Description-only generation can continue after the Tavily allowance is exhausted, within the OpenAI limits.
- Duplicate IDs are blocked before dispatch; SDK automatic retries are disabled. Ledger outages and sustained conflicts fail closed.
- The ledger stores only request/run IDs, one-way keyed IP identifiers, timestamps, reservation status, and usage metadata—not product text or generated briefs.

The cutoff and allowance protect **this application only**. They do not expire/revoke the OpenAI key or restrict use of it elsewhere. Provider-side key expiration is not verified. Vercel hosting/storage usage is separate from the OpenAI reservation allowance; no paid-plan upgrade was made.

## Scope and privacy

**Single-page website retrieval is connected. LinkedIn reading, live prospect discovery, contact enrichment, graphs, billing, and outreach are not connected.** Buying signals are suggested criteria, not observed events. The final screen exports a plan, not real leads.

Public website URLs are sent to Tavily when website analysis is requested. Bounded extracted text, descriptions, and confirmed brief fields are sent to OpenAI when the user requests generation; `store: false` is set. This does not override OpenAI's applicable API data-retention policies. Inputs/results otherwise remain in browser-local storage, which is device-specific and unencrypted. Do not enter credentials or sensitive personal information. The browser never receives API keys or Blob credentials.

Manual editing and export remain available after AI errors or the cutoff; there is no hidden mock-generation fallback. Public visitors cannot read another browser's locally saved brief through this application.

## Development

Node.js 22+ and npm:

```sh
npm ci
npm run dev
```

Use ignored `.env.local` with `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, and `TAVILY_API_KEY`. Never use a `NEXT_PUBLIC_` prefix for credentials. The configured private store must already contain the ledger at `gtm-engine/ai-budget-v1.json`; the application deliberately never initializes or resets it at runtime. Schema version 2 preserves the original window and reservations and makes older deployed handlers fail closed instead of accidentally discarding Tavily accounting fields. Missing configuration disables AI.

Routes: `/`, `/brief`, `/customers`, `/discover`; API routes: `/api/ai/brief`, `/api/ai/profile`, `/api/ai/status`.

```sh
npm test
npm run typecheck
npm run build
npm start
```

## Deployment

The public GitHub repository is connected to Vercel. Production uses normal Next.js Functions (not static export) and the project's security headers. Production environment variables are configured as Secrets. No GitHub Actions workflows, matrices, scheduled jobs, or new CI runners were added.

## Acceptance path

Enter a public product website URL (description optional) → **Understand my product** → review the real brief, source link, excerpt, and unknown fields → edit a fact → **Confirm product brief** → review model-generated customer suggestions and assumptions → **Confirm customers** → preview/export the discovery plan. Verify both AI reservations and provider response IDs for the same Run ID in the private ledger.

This release is not a hackathon submission. The website retrieval integration does not imply that live lead discovery or every proposed sponsor integration works.
