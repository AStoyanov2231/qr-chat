# QR Chat

QR Chat is a mobile-first authenticated social app for joining temporary venue-based conversations through physical QR codes.
Users can join one active group, exchange messages, connect as friends, and continue through direct messages.

The product has three active client targets:

- Mobile web through the Next.js application
- Native iOS through Expo
- Native Android through Expo

The clients share product logic, validation, data contracts, and Supabase access while keeping platform-native presentation and navigation.
Desktop web is reserved for a marketing homepage and QR handoff rather than the chat application.

## Repository

- `apps/web`: Next.js mobile-web client, authentication, and desktop web surface
- `apps/mobile`: Expo application for native iOS and Android
- `packages/domain`: pure shared product logic
- `packages/api`: typed Supabase operations and Realtime handling
- `packages/validation`: shared Zod input schemas
- `packages/types`: shared contracts and generated database types
- `supabase/migrations`: historical database migration artifacts
- `Design1.png`: canonical product design reference

## Requirements

- Node.js 22.18 or newer
- pnpm 12.4.1 through the repository's `packageManager` declaration
- Access to the hosted Supabase project for authenticated development

Install dependencies from the repository root:

```sh
pnpm install
```

## Development

Start all configured development tasks:

```sh
pnpm dev
```

Start only the web client:

```sh
pnpm --filter web dev
```

Start the native client locally:

```sh
pnpm --filter mobile start
pnpm --filter mobile ios
pnpm --filter mobile android
```

Native clients connect directly to Supabase through the shared API package.
Vercel hosts the web client and future public OAuth or deep-link handoff pages.

## Configuration

The web client reads these public configuration variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_ENABLE_APPLE_AUTH`

Native uses the `EXPO_PUBLIC_*` variables documented in `apps/mobile/.env.example` and the setup steps in `apps/mobile/README.md`.
Native provider buttons remain hidden until the callback is configured and the corresponding provider is enabled for local testing.
Do not put service-role keys, OAuth secrets, signing keys, test passwords, or access tokens in client configuration or documentation.

## Verification

Run the full non-credentialed repository gate:

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Production-backed integration and browser E2E suites require disposable credentials and explicit approval because they write temporary records:

```sh
pnpm --filter @qr-chat/api test:integration
pnpm --filter web test:e2e
```

See `packages/api/README.md` for the required variables, test-user contract, and cleanup responsibilities.

## Current Status

The web client and shared Supabase data layer implement the current authenticated QR Chat flow.
The Expo application implements the same product flow with native iOS and Android navigation.
Native OAuth provider setup and manual device verification remain separate checkpoints; see `apps/mobile/README.md`.
The desktop web route currently shows a mobile-only gate while the marketing homepage is completed.

Reporting and blocking are approved safety requirements but are not present in the current schema.
Nearby discovery, multiple or historical groups, saved places, notifications, usernames, venue media, and lifetime statistics remain future product concepts.

## Documentation

- `apps/web/PRODUCT.md`: stable product behavior and boundaries
- `apps/web/README.md`: web setup and implementation notes
- `apps/mobile/README.md`: native setup and current status
- `packages/api/README.md`: shared backend contract and credentialed verification
- `packages/api/VERIFICATION.md`: dated historical verification evidence
- `design-qa.md`: dated comparison against `Design1.png`

Agent-specific rules live in `AGENTS.md` and the scoped files under each application.
