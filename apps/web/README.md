# Web

Next.js mobile client at widths ≤767px. Desktop currently shows a mobile-only notice; marketing/handoff remains planned.

## Setup

Configure `.env.local` from `.env.example`: Supabase URL/publishable key, public app origin, Apple enable flag. Enable Apple only after provider verification.

```sh
pnpm --filter web dev
```

Run from the root. Open `http://localhost:3000`; phones use the network origin printed by Next.js.

## Checks

| Need | Command |
| --- | --- |
| Unit tests | `pnpm --filter web test` |
| Lint/types | `pnpm --filter web lint`, `pnpm --filter web typecheck` |
| Production build | `pnpm --filter web build` |
| Sandbox Turbopack port failure | `pnpm --filter web exec next build --webpack` |
| Approved production E2E | `pnpm --filter web test:e2e` |

Full unit suite for logic changes: `pnpm test`. E2E credentials/cleanup: [API README](../../packages/api/README.md). Manual: affected flow, loading/error states, keyboard/focus, small viewport, safe areas, reduced motion.

Navigation: [scoped instructions](AGENTS.md), [architecture](../../ARCHITECTURE.md), [product](PRODUCT.md), [design](../../DESIGN.md).
