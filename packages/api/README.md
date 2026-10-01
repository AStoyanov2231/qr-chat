# API Contract

`createChatApi(client)` accepts an authenticated typed Supabase client. Platforms own sessions/storage; this package owns operations, snapshots, pagination, and Realtime. Dependencies: domain, types, validation, Supabase SDK.

## Operations and invariants

- Profiles/current membership may return `null`; mutations reject validation errors or `ChatApiError`.
- `saveProfileWithAvatar(name, photo?)`: omit photo to keep it, pass `null` to remove it, or supply JPEG `ArrayBuffer` bytes and a fresh UUID for each save attempt. Platform image preparation stays in the apps. Storage setup, limits, and cleanup behavior: [AVATARS.md](AVATARS.md).
- Membership/friendship mutations use transactional RPCs; profile writes use allowed columns, message sender is authenticated.
- QR keys are opaque/case-sensitive. Joining replaces membership; repeated sole-member joins can recreate the room. Open a current room without rejoining.
- `resolveQrChatName(code, signal?)` checks the authenticated shared QR name first, then requests a bounded metadata suggestion from the web app. It returns `saved`, `suggested`, or `missing`; timeout, invalid pages, and transport errors return `missing`. Native needs the configured `EXPO_PUBLIC_WEB_ORIGIN`; without it, participants can still supply a name.
- New clients use `joinNamedGroup(code, name)`, which requires a validated name and returns the canonical name that won the database race. `joinGroup` retains the legacy optional-name RPC contract for already shipped clients. `nameCurrentQrChatIfEmpty(code, name)` names the caller's active QR membership without leaving/rejoining it, preserving the room and messages.
- Names live on the QR record and persist after room deletion. Database row locking and a first-non-null update make the first committed name shared by subsequent joins. Existing nameless rooms display as “Unnamed chat” until named.
- The strict named join is idempotent for a caller already active on the same QR code: retries return the existing room and preserve its original expiry and messages. Other mutations must not be automatically retried after ambiguous failures. Empty results never authorize direct membership/friend inserts.
- Message pages descend by identity, fetch one extra row, and expose `nextCursor`; pass it as `before`, render chronologically. IDs must be safe integers.
- Membership indicators are not online presence. Feature/lifecycle scope: [PRODUCT.md](../../PRODUCT.md).

## Recovery

`watchChanges`: table + allowed filter column + UUID. Events invalidate rather than become trusted state. Channel join and PostgreSQL readiness both reconcile; reconnect uses bounded backoff. Disposal cancels polling/retries and removes the channel.

Periodic/foreground/network reconciliation handles missed deletes and expiry. Snapshot loaders recheck authorization, discard superseded reads, and fail closed; expiration timers never extend membership. Sign-out clears subscriptions/protected state.

## Verification

Run focused package tests for affected behavior and use [docs/TESTING.md](../../docs/TESTING.md) to select broader checks. `pnpm check` runs the repository's automated gate. Historical evidence: [VERIFICATION.md](VERIFICATION.md).

Production-writing tests require explicit approval per [AGENTS.md](../../AGENTS.md), three dedicated confirmed disposable users, and unique fixture prefixes. `QR_CHAT_TEST_USERS_FILE` is a JSON array of `{id,email,password}`; also set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

QR-name parser, SSRF-boundary, and API-auth tests use fixtures and do not fetch arbitrary live QR pages. `pnpm --filter @qr-chat/api test:sql` runs the naming regression fixture against a temporary local PostgreSQL cluster (PostgreSQL 17 binaries required); it checks that same-QR retries preserve the active room, original expiry, and messages, as well as first-name persistence, recovery of a legacy unnamed room, and validation preserving prior membership. Neither command writes to production, and concurrent live-user behavior was not tested. SQL changes are retained in `sql/qr-group-names.sql` and `sql/qr-group-named-join-idempotency.sql`.

- API integration: `pnpm --filter @qr-chat/api test:integration`.
- Web E2E: `pnpm --filter web test:e2e`; requires running web, `QR_CHAT_BROWSER_URL`, and host Playwright via `QR_CHAT_PLAYWRIGHT_MODULE` or host installation.
- Authorization SQL: `tests/sql/authorization.sql`, approved production MCP execution; fixtures roll back.
- Verify removal of fixture messages, memberships, friendships, accounts, and QR keys. Prefixes: `qrchat-integration-<first-user-id>` (including `-other`) and `qrchat-ui-<first-user-id>`.

Regenerate `packages/types/src/database.ts` through MCP after approved schema changes; never hand-edit it.
