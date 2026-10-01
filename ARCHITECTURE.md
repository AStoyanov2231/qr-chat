# Architecture

## Ownership

pnpm/Turborepo; TypeScript; Next.js web; Expo native; Supabase Auth/PostgreSQL/Realtime; Zod; Node test runner. Versions: manifests and lockfile.

| Path | Owns |
| --- | --- |
| `apps/web` | Browser UI, SSR sessions, protected routes, OAuth callbacks, authenticated Node metadata route and safe public-page fetching |
| `apps/mobile` | Native UI/navigation, secure sessions, deep links, camera, app lifecycle |
| `packages/domain` | Pure product decisions, QR interpretation, display transformations |
| `packages/api` | Typed Supabase operations, snapshots, pagination, Realtime transport |
| `packages/validation` | Shared input schemas |
| `packages/types` | Shared contracts and generated database types |
| `supabase/migrations` | Read-only history |

Shared packages never import apps. Domain excludes frameworks, platform APIs, storage, and navigation. API accepts an authenticated Supabase client; it excludes UI frameworks and platform session storage. Imports between workspaces use declared package dependencies and public package exports; [the boundary checker](scripts/check-boundaries.mjs) checks direct imports and manifests.

Shared package dependencies follow this DAG: API may depend on domain, validation, and types; domain may depend on validation and types; validation may depend on types; types has no shared package dependencies. Apps may depend on declared shared packages, and never on each other.

## Data flow

`Client hook/provider → shared API + validation → authenticated Supabase client → PostgreSQL/RLS/RPCs`.

- PostgreSQL authorizes and owns state; caches and navigation never grant access.
- Membership/friendship mutations use transactional RPCs. Messages use cursor pagination.
- Filtered Realtime invalidates authorized snapshots; reconciliation handles missed events, expiry, reconnect, and foreground recovery.
- Web uses SSR cookies, server claims, PKCE callbacks, and validated return paths.
- Native uses secure storage, PKCE app callbacks, and foreground/background refresh; data connects directly to Supabase.
- After a camera scan, the shared API asks PostgreSQL for the QR code's saved name. If none exists, it calls the authenticated web `/api/qr-name` route. The route accepts web cookies or a native bearer token and fetches public HTML with bounded DNS-pinned requests; it never forwards Supabase credentials to the linked site. Native uses `EXPO_PUBLIC_WEB_ORIGIN` for this route.
- `apps/web` parses page metadata and passes candidates to the pure `packages/domain` name resolver. The domain resolver rejects generic, technical, and conflicting candidates. The API joins through the strict named RPC or names an existing active membership without rejoining it; PostgreSQL stores the first name atomically on the QR record.
- QR values are opaque and case-sensitive; only first-party handoff URLs unwrap through shared domain logic.
- New joins originate from camera scans. Native keeps a transient scanned value in its chat provider; web creates a join preview only from the scanner callback. Incoming links cannot initiate a new join. This governs client navigation; it does not prove camera use to PostgreSQL.
- Supabase Storage's public `avatars` bucket holds JPEG photos under `<auth-user-id>/<upload-id>.jpg`, with owner folder policies and a 2 MB limit. Platforms crop/resize photos; shared API uploads, saves the profile URL, and cleans up previous custom photos. See [avatar storage](packages/api/AVATARS.md).

## Contracts and runtime

- Lifecycle and feature scope: [PRODUCT.md](PRODUCT.md). API details: [API README](packages/api/README.md). Code and verification guidance: [CODING.md](docs/CODING.md), [TESTING.md](docs/TESTING.md).
- Vercel hosts web; native runs locally. Desktop currently shows a mobile-only notice. EAS/store distribution is unconfigured.
- Production is also the development backend; Supabase operations follow [AGENTS.md](AGENTS.md).
