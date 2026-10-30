# GTM Engine

A responsive blue onboarding interface for defining a product, confirming ideal customers, and preparing a discovery plan.

## What works

1. Describe a product, add a website/LinkedIn URL, or load an explicitly labeled example.
2. Review and edit the product brief, then confirm it.
3. Define industry, company size, location, buyer roles, buying signals, and exclusions.
4. Configure discovery and download the confirmed brief and search plan as JSON.

The interface includes staggered page entrances, step-completion feedback, responsive focus/hover states, and animated dialogs. Layout-matched skeletons cover initial hydration and genuinely pending navigation; fast navigation is not artificially delayed. Reduced-motion preferences disable animation and shimmer.

State persists in this browser using versioned local storage. Start over clears it after confirmation. No account, backend, API key, analytics, or database is required. No user input is sent to external services by the application.

## Prototype boundaries

**This is a UI prototype, not a working AI GTM research engine.**

- Product text is copied into an editable brief; it is not analyzed by an LLM.
- Websites and LinkedIn profiles are saved as inputs, not fetched or verified. For a personal profile, the user manually identifies the project.
- The example contains predefined illustrative suggestions. Custom products do not receive fabricated research or ICP suggestions.
- Live discovery, contact enrichment, knowledge graphs, billing, and outreach are not connected.
- The final action previews and exports a plan, not a list of actual leads. No paid calls or outbound messages occur.
- Local storage is device/browser-specific and unencrypted. Do not enter secrets or sensitive personal information. Public access to the site does not expose one visitor's browser-local brief to another.

## Development

Node.js 22+ and npm:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Routes: `/`, `/brief`, `/customers`, `/discover`. Incomplete steps redirect to the earliest available step.

```sh
npm test
npm run typecheck
npm run build
```

The build uses Next.js static export. Vercel deploys the generated static pages with the project's `vercel.json` security headers. The CSP permits same-origin Next.js inline bootstrapping; user content is rendered as text, never raw HTML. No credentials or environment variables are needed.

## Deployment

Import this public GitHub repository into Vercel with the Next.js preset. Use `npm run build`; Next.js generates `out/`. Production must remain publicly accessible without Vercel login. No GitHub Actions workflows or additional CI runners are configured.

## First acceptance path

Use **Try an example** → **Understand my product** → edit a brief field → **Confirm product brief** → adjust customer criteria → **Confirm customers** → **Preview discovery plan** → **Download plan (.json)**. Refresh to verify browser-local persistence.

This release does not constitute hackathon submission or verification of sponsor integrations.
