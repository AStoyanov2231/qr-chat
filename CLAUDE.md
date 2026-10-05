# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

QR Chat: scan a QR code to join a time-limited group chat tied to that code, then friend people and DM them. pnpm + Turborepo monorepo with a Next.js web app, an Expo (React Native) app, and shared TypeScript packages over Supabase (Postgres, Auth, Realtime, Storage).

## Commands

```bash
pnpm check                      # everything CI runs: tooling tests, boundaries, typecheck, lint, test
pnpm check:boundaries           # workspace import-boundary rules (scripts/check-boundaries.mjs)

pnpm --filter web dev           # http://localhost:3000
pnpm --filter mobile exec expo run:ios --device
pnpm --filter mobile exec expo run:android --device

pnpm --filter <web|mobile|@qr-chat/api|@qr-chat/domain> test
node --test apps/web/tests/chat-code.test.mjs                 # single test file
node --test --test-name-pattern="QR keys" apps/web/tests/chat-code.test.mjs   # single test
```

- Tests use the Node built-in runner (`node --test tests/*.test.mjs`) and import `.ts`/`.tsx` sources directly — no Jest/Vitest, no build step. Mobile tests render screens via `apps/mobile/tests/support/native-harness.mjs` (react-test-renderer with mocked native modules).
- `@qr-chat/api` extras: `test:sql` spins up a throwaway local Postgres (needs `initdb`/`pg_ctl`/`psql` on PATH) and runs `packages/api/tests/sql/schema-regression.sql` (pre-reduction stub → migrations → `authorization.sql`); `authorization.sql` also runs as-is against live via Supabase `execute_sql` (rolled back); `test:integration` hits a real Supabase project.
- Live/e2e suites (`apps/web/tests/*.e2e.mjs`, `pnpm --filter web test:e2e`, `scripts/release-*.mjs`) need disposable confirmed users in `QR_CHAT_TEST_USERS_FILE` (JSON `[{id,email,password}]`), `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and Playwright over CDP (`QR_CHAT_BROWSER_URL`, default `127.0.0.1:9222`). They are not part of `pnpm check`.
- Env: web uses `NEXT_PUBLIC_SUPABASE_*`; mobile uses `EXPO_PUBLIC_*` (see `apps/mobile/.env.example`). Public/publishable keys only — never service-role keys in clients.

## Architecture

**Package layering** (enforced by `pnpm check:boundaries`):

```
types  <-  validation (zod)  <-  domain  <-  api  <-  apps (web, mobile)
```

- `@qr-chat/types` — generated Supabase `Database` types (`src/database.ts`). Regenerate after migrations.
- `@qr-chat/validation` — zod schemas for every input crossing into the API.
- `@qr-chat/domain` — UI-facing view models (`Group`, `Message`, `Venue`, …) and pure helpers shared by both apps.
- `@qr-chat/api` — the only shared package allowed to import `@supabase/supabase-js`. Shared packages may not import React/Next/Expo/RN, Node built-ins, or platform storage. Apps import packages only via their public `"."` export, and must declare every import in their own `package.json`. Packages export raw `.ts` (no build).

**Data flow in `@qr-chat/api`:**
- `createChatApi(client)` (`src/index.ts`) wraps Supabase queries/RPCs; the host injects an already-authenticated client — session storage and auth lifecycle belong to each app.
- `createChatStore`/`getChatStore` (`src/store.ts`) — one session store per API instance; owns networking, page cache, DM state, connection state. Apps provide activity (focus/visibility) and subscribe.
- `watchChanges` (`src/realtime.ts`) — Realtime events only *invalidate* and trigger a refetch; payloads are never trusted as authorized data. Periodic reconciliation covers DELETEs and expiry that emit no events. `coordinator.ts` coalesces concurrent refreshes.
- Authorization lives in Postgres (RLS + RPCs). `supabase/migrations/` is the schema source of truth; `tests/sql/authorization.sql` covers RPC behavior, RBAC and hostile direct writes.
- Schema: `groups` (QR chat when `code_key` is set, DM when null), `group_members` (current QR chat per user, expires 1 day after `joined_at` via `public.expires_at`), `messages` (all messages), `friendships` (keyed by its DM `group_id`; the API exposes it as `friend.id`), `user_blocks`. RBAC: `roles`, `permissions`, `role_permissions`, `user_roles` — grants/revokes are plain inserts/deletes on `user_roles` checked by RLS via `private.has_permission`.

**Web (`apps/web`)** — Next.js 16 App Router, Tailwind v4, GSAP for motion. Auth via `@supabase/ssr` (`src/lib/supabase/{client,server,proxy}.ts`); `src/proxy.ts` is the Next 16 middleware replacement guarding `(protected)` routes. Google OAuth only in production. `use-chat-backend.tsx` bridges the shared store into React. Camera QR scanning via `qr-scanner`.

**Mobile (`apps/mobile`)** — Expo SDK 57 + expo-router (`src/app/`, `(app)` group is authenticated). `providers/auth-provider.tsx` owns the session (secure-storage backed); `providers/chat-provider.tsx` exposes the shared store via `useChat()`. `.web.tsx` files are react-native-web variants. `ios/` and `android/` are prebuilt native projects.

**QR codes** — code keys are case-sensitive; only links on the app's own origin (`?code=`) are unwrapped, any other scanned text is the raw key (see `resolveCode` in `apps/web/src/lib/chat-view.ts`, `apps/mobile/src/lib/qr-link.ts`).
