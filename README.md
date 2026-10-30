# GTM Engine

A blue, responsive AI onboarding flow: description and/or public website → Tavily extraction → editable product brief → human confirmation → suggested ideal customers → human confirmation → live sourced company candidates → exportable research.

## What works

- OpenAI Responses API Structured Outputs generates real product briefs and customer profiles using the explicit `gpt-6.1-sol` model for both steps.
- Briefs cover product features, technical constraints, benefits, audience, pricing, and existing customers. Unknown facts stay empty; important gaps become clarification questions.
- ICP suggestions include industries, size tiers, buyer roles, and possible buying triggers. Inferences and uncalibrated model confidence are clearly labeled. Users edit and approve both stages.
- Both AI stages share one Run ID. Provider response IDs and usage are recorded without logging product descriptions.
- Real loading states, skeletons, motion, mobile layouts, accessible native controls, and reduced-motion support are included.
- Browser-local workspace persistence and a JSON plan export work without an account. “Try an example” only fills illustrative input; the primary analysis action still makes a real model request.

## Model configuration

Both product briefs and customer profiles use GPT-6.1 Sol through Responses API Structured Outputs, with `reasoning.effort: low`, a 3,000-token output cap that includes reasoning, `service_tier: default`, and explicit 30-minute prompt-cache retention. Unsupported temperature settings are not sent. No fallback silently switches to the old model. Existing browser-saved drafts retain their original model receipts and edits; they are not automatically regenerated or charged after an upgrade. Run a new analysis from the first screen to use the new model.

Official references: [model](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [migration](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra.md#migration-quickstart), [pricing](https://developers.openai.com/api/docs/pricing).

## Website intake (Tavily)

The first screen accepts a public website URL without a description. On **Understand my product**, the server validates the URL/DNS, atomically reserves the demo allowances, and calls Tavily's official `/extract` endpoint with one URL, `extract_depth: basic`, and no automatic retries. Bounded website text is passed to OpenAI as untrusted evidence, not instructions. The editable brief shows source [S1], retrieval time, an extracted excerpt, and website-origin field labels. Website claims are not independent verification. Only the submitted page is read: no recursive crawling, automatic search, or pricing-page discovery.

LinkedIn URLs are not scraped. Users are asked to provide the chosen project's public website or remove the link and paste a description. An employer is never silently assumed to be the product. Local/private/IP-literal targets, credentials, and nonstandard ports are rejected. The app only fetches the fixed Tavily API endpoint; remote-page access and redirects are handled by the provider. Failed/empty extraction does not dispatch OpenAI or fall back to fabricated evidence. Inputs remain editable and manual mode is available.

## Live company discovery

After confirming the product and customer profile, **Find companies** runs one Tavily basic Search request and one GPT-6.1 Sol assessment. The query is visible/editable before submission. For small SaaS teams the starting query uses YC company pages; it is a retrieval strategy, not a requirement that customers be YC-backed. Broaden the query for other sources. Batches request up to 5 or 10 companies, not a guaranteed count; the previous 25-company plan option is not a live batch size.

The server requests at most 20 public search hits, disables automatic depth selection, generated answers, and automatic retries, and caps response/model-input size. Only HTTP(S) public-domain links are retained. Tavily raw text is requested in the same basic Search call (not a separate extraction request) to capture explicit status/team-size metadata on direct YC company pages. Full raw pages are not returned to the browser or model; only bounded search snippets and recognized metadata are retained. Explicitly inactive profiles are excluded server-side; other operational status remains unverified. Search-index snippets may be cached; the receipt records when this search ran, not proof that each page was freshly crawled.

Each company has a model-inferred fit assessment, a verbatim evidence quote, and source links. Server checks require names present in the cited source text/title/URL, valid retrieved source IDs, exact matching quotes, distinct names, and exclusion of the user's own product. Unbacked candidates are dropped. This is not independent company verification: employee count, founder involvement, location, event attendance, and purchase intent may remain unknown. The system can return fewer or zero candidates rather than invent matches.

Results, sources, query and provider receipts persist only in the current browser and export to JSON. Changing criteria or query marks the previous result stale and excludes it from current results/exports. No search runs on load, refresh, edit, export, or navigation. Contact enrichment, people research and outreach remain disconnected.

Company discovery shares the existing ledger, original cutoff and both spending allowances. For compatibility with deployed ledger readers, company-fit assessments use the legacy `profile` reservation category with an explicit `:discover:` request ID; this preserves all existing reservations without a migration or reset. Each click reserves $0.10 for the bounded model request and 1 Tavily credit before either provider is called. Failed/unknown attempts are not refunded. Basic Search costs 1 API credit; no advanced search, crawl, research endpoint, top-up or upgrade is enabled.

## Spending and abuse protection

A dedicated **private Vercel Blob** stores one durable ledger. Conditional writes use ETags (`ifMatch`), and reads bypass the CDN cache. Model dispatch happens only after an atomic reservation succeeds.

- One fixed 72-hour application window: no reset on deployment, process restart, error, or browser refresh.
- A $40 **reservation allowance**, with a conservative $0.10 reserved per attempt: at most 400 model dispatches across local and deployed use.
- The input body is capped at 18 KB; the model and output-token limit are fixed server-side. The GPT-6.1 Sol bound uses the actual fixed instructions and JSON schema plus a 2,048-token framing allowance, the maximum 30-minute cache-write input rate ($2.50/million), output including reasoning ($10/million), and a 10% regional cushion. Both stage bounds fit within the unchanged $0.10 reservation. A runtime check fails closed before dispatch if future configuration changes exceed it.
- Reservations are never refunded on failure, timeout, cancellation, refusal, or unknown outcome. The application may stop before actual API usage reaches $40. Displayed reserved amounts are **not** measured charges.
- Standard-rate estimates account for uncached input ($2/million), cache reads ($0.10/million), 30-minute cache writes ($2.50/million), and output including reasoning ($10/million). Provider-reported token counts and these estimates are stored separately from reservations. They are not billing receipts.
- Rate limits: 3 attempts per minute and 40 per day per hashed connection identifier; 12 per minute globally. This is a public demo with rate/spend controls, not authenticated user accounts.
- Tavily has a separate **200-credit application reservation ceiling**, authorized for this demo including testing. Each single-page basic attempt conservatively reserves 1 credit (official pricing is 1 credit per 5 successful URL extractions). At most 200 attempts; actual provider-reported credits are recorded separately. Reservations are never refunded, including failed/unknown attempts. Only basic Search and basic single-page Extract are enabled; no advanced search/crawl/research endpoint or paid-plan change is enabled. This does not cap use of the key elsewhere or change provider billing settings.
- Tavily and OpenAI reservations are committed together in the existing ledger, preserving its original fixed cutoff. Redeployments do not reset either allowance. Description-only generation can continue after the Tavily allowance is exhausted, within the OpenAI limits.
- Duplicate IDs are blocked before dispatch; SDK automatic retries are disabled. Ledger outages and sustained conflicts fail closed.
- The ledger stores only request/run IDs, one-way keyed IP identifiers, timestamps, reservation status, and usage metadata—not product text or generated briefs.

The cutoff and allowance protect **this application only**. They do not expire/revoke the OpenAI key or restrict use of it elsewhere. Provider-side key expiration is not verified. Vercel hosting/storage usage is separate from the OpenAI reservation allowance; no paid-plan upgrade was made.

## Scope and privacy

**Single-page website retrieval and public-source company discovery are connected. LinkedIn reading, people/contact enrichment, graphs, billing, and outreach are not connected.** Buying signals remain criteria unless supported by cited search evidence. Company candidates require review and are not verified buyers.

Public website URLs are sent to Tavily when website analysis is requested; the reviewed search query is sent when company discovery is requested. Bounded extracted text, descriptions, and confirmed brief fields are sent to OpenAI when the user requests generation; `store: false` is set. This does not override OpenAI's applicable API data-retention policies. Inputs/results otherwise remain in browser-local storage, which is device-specific and unencrypted. Do not enter credentials or sensitive personal information. The browser never receives API keys or Blob credentials.

Manual editing and export remain available after AI errors or the cutoff; there is no hidden mock-generation fallback. Public visitors cannot read another browser's locally saved brief through this application.

## Development

Node.js 22+ and npm:

```sh
npm ci
npm run dev
```

Use ignored `.env.local` with `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, and `TAVILY_API_KEY`. Never use a `NEXT_PUBLIC_` prefix for credentials. The configured private store must already contain the ledger at `gtm-engine/ai-budget-v1.json`; the application deliberately never initializes or resets it at runtime. Schema version 2 preserves the original window and reservations and makes older deployed handlers fail closed instead of accidentally discarding Tavily accounting fields. Missing configuration disables AI.

Routes: `/`, `/brief`, `/customers`, `/discover`; API routes: `/api/ai/brief`, `/api/ai/profile`, `/api/ai/discover`, `/api/ai/status`.

```sh
npm test
npm run typecheck
npm run build
npm start
```

## Deployment

The public GitHub repository is connected to Vercel. Production uses normal Next.js Functions (not static export) and the project's security headers. Production environment variables are configured as Secrets. No GitHub Actions workflows, matrices, scheduled jobs, or new CI runners were added.

## Acceptance path

Enter a public product website URL (description optional) → **Understand my product** → review the real brief, source link, excerpt, and unknown fields → edit a fact → **Confirm product brief** → review model-generated customer suggestions and assumptions → **Confirm customers** → review the query → **Find companies** → inspect real source-backed candidates and unknowns → export research. Refresh preserves results without another paid call; changing criteria invalidates them. Verify both AI reservations and provider response IDs for the same Run ID in the private ledger.

This release is not a hackathon submission. Sourced company discovery does not imply working people enrichment, outreach, or every proposed sponsor integration.
