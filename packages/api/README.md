# QR Chat API

`@qr-chat/api` is the shared, framework-independent Supabase data layer.
It depends only on `@supabase/supabase-js`, `@qr-chat/types`, and `@qr-chat/validation`.
It does not import React, Next.js, DOM APIs, localStorage, or platform authentication storage.

## Client setup

Inject a typed, authenticated Supabase client into `createChatApi(client)`.
The web app uses its existing `@supabase/ssr` browser client and OAuth cookies.
Expo clients can inject a `createClient<Database>` instance with their platform's session-storage adapter and app foreground/background auth-refresh lifecycle.
Use only a publishable key in client configuration.
Never put a secret or service-role key in a client application or a `NEXT_PUBLIC_` variable.

The API covers profiles, current membership, room members, QR join/leave, group messages, friend requests, acceptance/removal, DMs, and sign-out.
Errors reject with `ChatApiError`; invalid input rejects with a validation error.
`profile()` and `currentMembership()` return `null` when no visible row exists.
An empty result is never interpreted as permission to create memberships or friendships directly.

## Database contract

The approved PostgreSQL schema and RLS are authoritative.
All membership and friend mutations call the existing transactional RPCs.
Profile writes are limited to allowed columns, and message senders come from the authenticated user.
Client validation improves feedback; it is not the authorization boundary.

QR keys are opaque, case-sensitive strings.
Every successful join replaces the caller's previous membership and gives it the database-defined expiration, at most one day.
The last member leaving deletes the group and its messages through existing triggers.
Repeated join RPC calls can recreate a sole-member room; callers should open an existing current room without rejoining.
Mutations are not automatically retried after ambiguous network failures.
The schema has no closed-room flags, QR aliases, or heartbeat presence, so the UI shows database memberships rather than simulated online presence.

Messages use descending identity cursors with one extra row to determine `nextCursor`.
Pass `nextCursor` as `before` to get older messages, then render each page in ascending order as appropriate.
IDs are validated as safe integers because that is the generated Supabase type for these identity columns.

## Realtime and recovery

`watchChanges` requires a table, an allowed filter column, and a UUID.
It invalidates queries instead of inserting Realtime payloads into trusted state.
A channel join and the subsequent PostgreSQL readiness acknowledgement both cause reconciliation, closing the initial subscription gap.
Connection failures recreate the channel with bounded exponential backoff.
Disposal cancels polling and retries and removes the channel.

Periodic reconciliation handles filtered DELETE limitations and expiration without a delivered event.
The host should also refetch on foregrounding and network recovery; the web adapter does both.
The web adapter rechecks membership after multi-query reads, clears potentially unauthorized cached messages on reconciliation failure, and discards superseded responses.
Membership expiration schedules a refresh but never extends membership locally.
Sign-out removes subscriptions and redirects the web app through the existing authentication boundary.

## Verification

Run unit tests with `pnpm --filter @qr-chat/api test` and `pnpm --filter web test`.
Run `tests/sql/authorization.sql` through Supabase SQL execution or `psql` against the approved schema.
It asserts RLS, hostile input rejection, message authorization, expiration, and cascading cleanup, then rolls back every fixture.
It neither installs extensions nor changes the approved schema.

For the integration suite, provide three disposable, confirmed test users in a JSON file containing `{ "id", "email", "password" }` records.
Set `QR_CHAT_TEST_USERS_FILE`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then run `pnpm --filter @qr-chat/api test:integration`.
The suite uses only public credentials and the supplied users, tests real concurrent joins and Realtime recovery, and leaves its rooms and removes its test friendships afterward.
Use dedicated test users with no other memberships or friendships, since those supplied users are exclusively controlled by the tests.
Remove the test users and the `qrchat-integration-<first-user-id>` and `qrchat-integration-<first-user-id>-other` QR keys after verification using trusted administrative tooling.
No local Supabase or Docker installation is required.

The web E2E script is `apps/web/tests/backend.e2e.mjs`.
It uses the same test-user file and public configuration, an already-running web app, and an existing Chromium debug endpoint through `QR_CHAT_BROWSER_URL`.
Set `QR_CHAT_PLAYWRIGHT_MODULE` to a host-provided Playwright module, or install Playwright in the test host.
It checks two independent authenticated browser sessions, group pagination, friends, DMs, reconnect recovery, profile editing, leave, sign-out, and responsive layout.
Its uniquely named `qrchat-ui-<first-user-id>` QR key must also be removed after testing.

## Generated types

`packages/types/src/database.ts` was generated by Supabase from the approved project schema.
Do not edit it by hand.
Regenerate it through Supabase type generation after an approved schema change.
