# API Contract

`createChatApi(client)` accepts an authenticated typed Supabase client. Platforms own sessions/storage; this package owns operations, snapshots, pagination, and Realtime. Dependencies: domain, types, validation, Supabase SDK.

## Operations and invariants

- Profiles/current membership may return `null`; mutations reject validation errors or `ChatApiError`.
- Membership/friendship mutations use transactional RPCs; profile writes use allowed columns, message sender is authenticated.
- QR keys are opaque/case-sensitive. Joining replaces membership; repeated sole-member joins can recreate the room. Open a current room without rejoining.
- Never automatically retry mutations after ambiguous failures. Empty results never authorize direct membership/friend inserts.
- Message pages descend by identity, fetch one extra row, and expose `nextCursor`; pass it as `before`, render chronologically. IDs must be safe integers.
- Membership indicators are not online presence. Feature/lifecycle scope: [PRODUCT.md](../../apps/web/PRODUCT.md).

## Recovery

`watchChanges`: table + allowed filter column + UUID. Events invalidate rather than become trusted state. Channel join and PostgreSQL readiness both reconcile; reconnect uses bounded backoff. Disposal cancels polling/retries and removes the channel.

Periodic/foreground/network reconciliation handles missed deletes and expiry. Snapshot loaders recheck authorization, discard superseded reads, and fail closed; expiration timers never extend membership. Sign-out clears subscriptions/protected state.

## Verification

Unit: `pnpm --filter @qr-chat/api test`; all logic changes: `pnpm test`. Historical evidence: [VERIFICATION.md](VERIFICATION.md).

Production-writing tests require explicit approval per [AGENTS.md](../../AGENTS.md), three dedicated confirmed disposable users, and unique fixture prefixes. `QR_CHAT_TEST_USERS_FILE` is a JSON array of `{id,email,password}`; also set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

- API integration: `pnpm --filter @qr-chat/api test:integration`.
- Web E2E: `pnpm --filter web test:e2e`; requires running web, `QR_CHAT_BROWSER_URL`, and host Playwright via `QR_CHAT_PLAYWRIGHT_MODULE` or host installation.
- Authorization SQL: `tests/sql/authorization.sql`, approved production MCP execution; fixtures roll back.
- Verify removal of fixture messages, memberships, friendships, accounts, and QR keys. Prefixes: `qrchat-integration-<first-user-id>` (including `-other`) and `qrchat-ui-<first-user-id>`.

Regenerate `packages/types/src/database.ts` through MCP after approved schema changes; never hand-edit it.
