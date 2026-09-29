# Architecture

## Ownership

pnpm/Turborepo; TypeScript; Next.js web; Expo native; Supabase Auth/PostgreSQL/Realtime; Zod; Node test runner. Versions: manifests and lockfile.

| Path | Owns |
| --- | --- |
| `apps/web` | Browser UI, SSR sessions, protected routes, OAuth callbacks |
| `apps/mobile` | Native UI/navigation, secure sessions, deep links, camera, app lifecycle |
| `packages/domain` | Pure product decisions, QR interpretation, display transformations |
| `packages/api` | Typed Supabase operations, snapshots, pagination, Realtime transport |
| `packages/validation` | Shared input schemas |
| `packages/types` | Shared contracts and generated database types |
| `supabase/migrations` | Read-only history |

Shared packages never import apps. Domain excludes frameworks, platform APIs, storage, and navigation. API accepts an authenticated Supabase client; it excludes UI frameworks and platform session storage.

## Data flow

`Client hook/provider → shared API + validation → authenticated Supabase client → PostgreSQL/RLS/RPCs`.

- PostgreSQL authorizes and owns state; caches and navigation never grant access.
- Membership/friendship mutations use transactional RPCs. Messages use cursor pagination.
- Filtered Realtime invalidates authorized snapshots; reconciliation handles missed events, expiry, reconnect, and foreground recovery.
- Web uses SSR cookies, server claims, PKCE callbacks, and validated return paths.
- Native uses secure storage, PKCE app callbacks, and foreground/background refresh; data connects directly to Supabase.
- QR values are opaque and case-sensitive; only first-party handoff URLs unwrap through shared domain logic.

## Contracts and runtime

- Lifecycle and feature scope: [PRODUCT.md](apps/web/PRODUCT.md). API details: [API README](packages/api/README.md).
- Vercel hosts web; native runs locally. Desktop currently shows a mobile-only notice. EAS/store distribution is unconfigured.
- Production is also the development backend; Supabase operations follow [AGENTS.md](AGENTS.md).
