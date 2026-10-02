# Networking optimization rollout

Implemented 2 October 2026. The additive overview/access RPCs and pagination indexes are applied to the linked Supabase project. Web and native code are changed in this checkout; neither client release nor the Vercel server release has been deployed.

| Area | Implemented behavior | Main files |
|---|---|---|
| Coordination | One store per client session, 100 ms coalescing, one request per resource, trailing work for changes received during a request | `packages/api/src/store.ts`, `coordinator.ts` |
| Authentication | Local session IDs for query filters; account generations abort reads and discard stale results. RLS still authorizes every query/write | `packages/api/src/index.ts`, `store.ts` |
| Database | Authenticated security-invoker overview/access RPCs, lateral DM previews, latest group preview and 50-ID head, ID pagination indexes | `supabase/migrations/20261002170940_chat_traffic_optimization.sql`, `20261002174918_chat_overview_preview.sql` |
| Messages | Returned mutation rows reused; affected IDs queried in batches of at most 100; history loaded only for open conversations; pagination fetches one older page | `packages/api/src/store.ts`, `index.ts` |
| Recovery | Overlapping newest-page recovery after detected gaps; reconnect/resume revalidates the loaded range to recover older missed inserts, edits and deletes; access checked before publishing loaded messages | `packages/api/src/store.ts` |
| Lifecycle | One overview safety timer, jittered to 114–120 seconds. Hidden/offline web and background/offline native stop scheduling and subscriptions. Activation reconciles before restoring messages | Web session provider; native auth/chat providers |
| Vercel | Name/image share one operation; each request authenticates with verified claims; successful public metadata uses Next Data Cache for one hour; responses remain `no-store` | `apps/web/src/app/api/qr-name/route.ts`, `qr-name-route.ts` |
| Diagnostics | Optional observed fetch emits category, measurement trigger, duration, status and available response size; no identifiers, tokens, URLs or message bodies | `packages/api/src/requests.ts` |

Native offline/reconnect signals use SDK-compatible `expo-network@~57.0.2`, which requires rebuilding the native app. Existing AppState handling remains. Expo documents the [network-state API](https://docs.expo.dev/versions/latest/sdk/network/). There is no persistent message storage, new Realtime transport or paid cache infrastructure.

The project's public JWKS exposes an ES256/EC key. `getClaims()` can use this asymmetric signing setup; previously issued tokens and cold signing-key fetches can still require network access. Cookie refresh handling is retained. Authentication failures and unsuccessful metadata lookups never populate the public metadata cache. Existing DNS pinning, redirect/body/time limits and SSRF checks are retained. [Next Data Cache reference](https://nextjs.org/docs/app/api-reference/functions/unstable_cache).

## Measurements and verification

- **53 API unit tests pass**, including request deduplication, mutation/event reuse, access loss during reads, account switches, startup readiness, late committed IDs, missed deletes, preview updates, pagination, room-specific view tracking and exponential retry after access failures.
- **30-minute simulated idle:** 15 overview calls, no history/preview GETs and zero remote user lookups, including open group and DM views. The conservative old model is 540 Auth/Data calls: one 30-second refresh with nine calls, excluding duplicate watchers. This is **97.2% fewer** modeled calls, not a measured production improvement.
- SQL batching/RLS tests pass for 100 accepted friends, pending/removed friendships, outsiders and expired membership. The live authorization suite passed for the initial RPC migration; the additive group-preview authorization was verified locally.
- Authenticated local plans with 10,000 matching plus 10,000 unrelated rows used ordered index scans without a full-history sort. Representative local execution times were approximately **0.42 ms group / 0.03 ms DM**; these are warm local fixture results, not production latency forecasts. PostgreSQL may choose the primary-key index when its cost estimate is lower than the new conversation index.
- Type checking, lint, tooling/boundary checks and the web production build pass. Web build command: `pnpm --filter web exec next build --webpack`; Turbopack could not bind its CSS compiler's local port in this environment.
- Web networking/auth/metadata tests pass. Full web suite: 25/26. Full native suite: 70/72, including offline handling and a DM-send check that forbids reloading the overview. The three remaining failures are existing own-message avatar rendering expectations in unmodified UI components. `pnpm check` therefore remains red; these unrelated UI changes were left out of this rollout.
- Live API integration and browser E2E commands were attempted but could not run without `QR_CHAT_TEST_USERS_FILE`. Browser E2E also needs the host-provided Playwright module and a running browser/test server. These are pending, not passing checks.

The original measured daily baseline is in `SUPABASE_TRAFFIC_REPORT.md`. The **3,000–7,000 total requests/day**, **100–500 Auth user lookups/day** and **2,000–5,000 main-table reads/day** targets remain estimates until the same accounts, activity and session durations are measured after deployment. RPC calls must be included in the new Data API totals: moving reads into RPCs does not eliminate database execution or bytes.

## Running the isolated benchmark

`packages/api/tests/traffic-benchmark.mjs` refuses the current production project. Supply a separate Supabase environment with both migrations applied and disposable confirmed accounts. Setup joins temporary benchmark rooms, edits their display names and replaces their test friendships; cleanup leaves rooms and removes those relationships. It does not create accounts or delete history. Only dedicated test accounts are suitable.

```sh
export QR_CHAT_BENCHMARK_ENV=test
export QR_CHAT_TEST_SUPABASE_URL='https://YOUR_TEST_PROJECT.supabase.co'
export QR_CHAT_TEST_SUPABASE_PUBLISHABLE_KEY='YOUR_TEST_PUBLIC_KEY'
export QR_CHAT_TEST_USERS_FILE='/absolute/path/disposable-users.json'
QR_CHAT_BENCHMARK_CLIENTS=100 QR_CHAT_BENCHMARK_ROOM_SIZE=10 \
  QR_CHAT_BENCHMARK_MODE=idle QR_CHAT_BENCHMARK_SECONDS=1800 \
  QR_CHAT_BENCHMARK_OUTPUT=/tmp/traffic-100-idle.json \
  node packages/api/tests/traffic-benchmark.mjs
```

Repeat with 1,000 clients after the 100-client run succeeds. The user confirmed that no separate setup is available, so both live capacity runs remain pending. One distinct `{id,email,password}` account is required per client. Vary room size and `QR_CHAT_BENCHMARK_FRIENDS` between 0, 1 and 100; equal-degree friend fixtures require an even total degree and more accounts than friends. Account sign-ins are staggered to avoid an instantaneous burst; environment quotas still determine whether a given test can run.

Use `QR_CHAT_BENCHMARK_MODE=messages` for the fixed ten-message script and `resume` for paused delivery/recovery. Reports contain request counts/errors, known wire bytes, decoded response bytes, per-category HTTP p95, expected/received deliveries and delivery latency. Message mode asserts all deliveries within two seconds. `QR_CHAT_BASELINE_FILE` compares normalized Auth/Data request rates and enforces an 80% idle reduction against a compatible measured baseline. Database execution time must also be sampled from the test project's query statistics; client request duration is not database execution time. Realtime WebSocket bytes/heartbeats are outside the HTTP observer and must be measured separately.

Run regression commands:

```sh
pnpm check
pnpm --filter @qr-chat/api test:sql
pnpm --filter @qr-chat/api test:integration
QR_CHAT_PLAYWRIGHT_MODULE='/absolute/path/playwright/index.mjs' \
  pnpm --filter web test:e2e
```

Integration/browser tests use the existing public `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` variables and require disposable test accounts. Reuse identical account/friend/room/page counts and client activity when comparing before/after. For web/Vercel verification, also record metadata cache hits, cold/warm claims validation and inactive-tab requests against the deployed test server; the shared-client capacity harness does not measure Vercel function invocations.

## Release gates and rollback

1. Validate web/API/E2E flows with disposable credentials and fix the existing avatar test failures separately before requiring a green full check.
2. Release web first and measure identical 30-minute idle and messaging runs. Confirm 80% fewer Auth/Data requests, healthy delivery within two seconds and access-change recovery by the next safety interval under healthy connectivity. Failed verification hides content and retries rather than displaying false expiry.
3. Rebuild/release native and repeat foreground, background, offline and account-switch scenarios.
4. Release the Vercel metadata cache separately and measure warm-cache reuse, authentication and URL protection.
5. Run isolated 100/1,000-client tests, including varied room/friend counts, bytes and database time.

Roll back the affected client/server build on a correctness regression. Keep both additive RPCs and indexes available so older deployed clients remain compatible. A reconnect can intentionally reread the already loaded history range; routine events and older-page pagination do not reread it. Supabase Postgres Changes authorization/fan-out costs remain and require capacity measurement at scale.

Automatic approval review rejected representative fixture inserts/EXPLAINs on the live database because of temporary production load. Representative query-plan testing was completed in disposable local PostgreSQL instead. The advisor also retains the pre-existing [disabled leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); no Auth settings were changed.
