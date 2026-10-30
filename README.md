# GTM Engine

A blue, responsive AI onboarding flow: product description → editable product brief → human confirmation → suggested ideal customers → human confirmation → exportable discovery plan.

## What works

- OpenAI Responses API Structured Outputs generates real product briefs and customer profiles using the pinned `gpt-4.1-mini-2025-04-14` model.
- Briefs cover product features, technical constraints, benefits, audience, pricing, and existing customers. Unknown facts stay empty; important gaps become clarification questions.
- ICP suggestions include industries, size tiers, buyer roles, and possible buying triggers. Inferences and uncalibrated model confidence are clearly labeled. Users edit and approve both stages.
- Both AI stages share one Run ID. Provider response IDs and usage are recorded without logging product descriptions.
- Real loading states, skeletons, motion, mobile layouts, accessible native controls, and reduced-motion support are included.
- Browser-local workspace persistence and a JSON plan export work without an account. “Try an example” only fills illustrative input; the primary analysis action still makes a real model request.

## Spending and abuse protection

A dedicated **private Vercel Blob** stores one durable ledger. Conditional writes use ETags (`ifMatch`), and reads bypass the CDN cache. Model dispatch happens only after an atomic reservation succeeds.

- One fixed 72-hour application window: no reset on deployment, process restart, error, or browser refresh.
- A $40 **reservation allowance**, with a conservative $0.10 reserved per attempt: at most 400 model dispatches across local and deployed use.
- The input body is capped at 18 KB; the model and output-token limit are fixed server-side. At verified standard pricing ($0.40 / million input tokens, $1.60 / million output tokens), the bounded maximum request cost fits well below the $0.10 allowance.
- Reservations are never refunded on failure, timeout, cancellation, refusal, or unknown outcome. The application may stop before actual API usage reaches $40. Displayed reserved amounts are **not** measured charges.
- Published-rate cost estimates and provider-reported token counts are stored separately from reservations. They are not billing receipts.
- Rate limits: 3 attempts per minute and 40 per day per hashed connection identifier; 12 per minute globally. This is a public demo with rate/spend controls, not authenticated user accounts.
- Duplicate IDs are blocked before dispatch; SDK automatic retries are disabled. Ledger outages and sustained conflicts fail closed.
- The ledger stores only request/run IDs, one-way keyed IP identifiers, timestamps, reservation status, and usage metadata—not product text or generated briefs.

The cutoff and allowance protect **this application only**. They do not expire/revoke the OpenAI key or restrict use of it elsewhere. Provider-side key expiration is not verified. Vercel hosting/storage usage is separate from the OpenAI reservation allowance; no paid-plan upgrade was made.

## Scope and privacy

**Retrieval/RAG, website/LinkedIn reading, prospect discovery, contact enrichment, graphs, billing, and outreach are not connected.** URLs are saved but never fetched. Buying signals are suggested criteria, not observed events. The final screen exports a plan, not real leads.

Descriptions and confirmed brief fields are sent to OpenAI when the user requests generation; `store: false` is set. This does not override OpenAI's applicable API data-retention policies. Inputs/results otherwise remain in browser-local storage, which is device-specific and unencrypted. Do not enter credentials or sensitive personal information. The browser never receives API keys or Blob credentials.

Manual editing and export remain available after AI errors or the cutoff; there is no hidden mock-generation fallback. Public visitors cannot read another browser's locally saved brief through this application.

## Development

Node.js 22+ and npm:

```sh
npm ci
npm run dev
```

Use ignored `.env.local` with `OPENAI_API_KEY` and `BLOB_READ_WRITE_TOKEN`. Never use a `NEXT_PUBLIC_` prefix for credentials. The configured private store must already contain the ledger at `gtm-engine/ai-budget-v1.json`; the application deliberately never initializes or resets it at runtime. Missing configuration disables AI.

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

Enter a **new** named product with some known facts and unknown pricing → **Understand my product** → review the real brief and unknown fields → edit a fact → **Confirm product brief** → review model-generated customer suggestions and assumptions → **Confirm customers** → preview/export the discovery plan. Verify both AI reservations and provider response IDs for the same Run ID in the private ledger.

This release is not a hackathon submission or a claim of working retrieval/sponsor integrations.
