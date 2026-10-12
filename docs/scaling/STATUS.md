# Scaling to 100K users: status

Branch `perf/scale-100k`, one commit per phase, not pushed. Nothing was applied to live Supabase or Vercel.
Owner steps (SQL, settings, benchmark) are in [APPLY.md](APPLY.md).

Legend: PASS = verified locally with the evidence shown. BLOCKED = needs an owner step; the unblock condition is given.

## Environment notes

- `supabase/` is gitignored ("local migrations stay private"), so the new SQL files sit in `supabase/migrations/` on disk but are **not in the commits**. The SQL tests include them from there, as the existing fixture already did.
- `pnpm --filter @qr-chat/api test:sql` was broken on `master` for two reasons. PostgreSQL refused to start with no locale set, so the runner now sets `LC_ALL=C`. Also, `schema-regression.sql` includes three private base migrations that are no longer on disk. Read-only catalog queries against the live project were blocked by the session's permission policy, so this branch adds a self-contained model of the current schema instead: `packages/api/tests/sql/scaling.sql`, built from the applied migration text. `test:sql` now runs that model. `node tests/run-sql.mjs schema-regression.sql` still runs the old fixture once the private files are restored.
- Live facts were taken from earlier sessions' read-only catalog output:
  - `pg_cron` runs `select private.expire_qr_memberships()` every minute.
  - The `supabase_realtime` publication contains `profiles`, `group_members`, `messages` and `friendships`.

## Phase 1: Vercel cleanup

| Acceptance item | Status | Evidence |
| --- | --- | --- |
| `/`, `/profile`, `/sign-in` and `/welcome` are static, and `/chats` is not a page | PASS | `pnpm --filter web build` lists them as `○ (Static)`. `/chats` is a `next.config` redirect. |
| Proxy covers only what it needs, or is gone | PASS (gone) | `src/proxy.ts` and `src/lib/supabase/proxy.ts` are deleted. `tests/proxy.test.mjs` asserts that no proxy or middleware file exists. |
| Signed-out visit to `/` goes to `/sign-in?next=/` | PASS | `tests/networking.test.mjs` ("static app shell…") and `tests/auth-redirect.test.mjs`. Browser check against `next start`: `/?code=Room%2B1` became `/sign-in?next=/?code=Room%2B1`. |
| Signed-in visit to `/sign-in?next=/profile` lands on `/profile`; an unsafe `next` falls back to `/` | PASS (unit) | `auth-redirect.test.mjs` and `proxy.test.mjs`. A real signed-in browser redirect needs a Google session and is deferred to e2e. |
| `/chats?code=X` goes to `/?code=X` | PASS | `proxy.test.mjs` and `chats-overview.test.mjs`. `curl` against `next start` returned `307 location: /?code=A%2BB`. |
| `/design-preview`: 404 on a non-local host, works on a local host | PASS | Production: the page is `page.dev.tsx`, built only on the dev server; `curl` returned 404 with no function. Dev on localhost: the `/` rewrite shows the preview frame (browser check). `proxy.test.mjs` covers the host-conditioned rewrites, including a `localhost.evil.example` spoof. |
| `/api/qr-name` skipped for named groups, still called for unnamed ones (web and mobile) | PASS | `packages/api/tests/api.test.mjs` ("resolveGroup skips…") and `apps/mobile/tests/screens.test.mjs` ("joining a group the server already named…"). Both clients pass the known name to `api.resolveGroup(code, knownName)`. |
| `<Analytics />` only on `/welcome` | PASS | Browser check: `/_vercel/insights/script.js` loads on `/welcome` and not on `/sign-in`. |
| `pnpm check` | PASS | exit 0 (tooling 12, domain 11, api 57, web 55, mobile 99 tests, typecheck, lint) |

Decisions:
- The design preview is no longer served by the proxy:
  - On the dev server, `next.config` rewrites with a `host` condition handle it.
  - The page only builds in development (`pageExtensions`).
  - `[::1]` is no longer a preview host, because Next strips the port by splitting on `:`. Use `localhost` or `127.0.0.1`.
- `join_qr_group` now also returns `name` (`20261012100000_join_returns_group_name.sql`). Until the owner applies it, `name` is `undefined` and clients fall back to calling `/api/qr-name`, as before.
- The root layout no longer reads `headers()`. `MobileOnly` detects the preview host in the browser.

Noticed, not changed: `apps/web/src/app/actions/auth.ts` (`signOut` server action) has no callers, because the web app signs out through `api.signOut()`.

## Phase 2: Realtime resilience, retention and rate limits

| Acceptance item | Status | Evidence |
| --- | --- | --- |
| Each refusal signal starts polling at about 5s | PASS | `packages/api/tests/realtime.test.mjs`: `too_many_connections`, `too_many_joins` and `tenant_events` each switch to `polling`. Ticks land at 5000 ms (jitter 0.8–1.2). |
| A successful resubscribe stops polling | PASS | Same test: no polls after `SUBSCRIBED` plus system `ok`, and the state returns to `connected`. `store.test.mjs` shows the same end to end. |
| Hidden or offline stops polling and the socket | PASS | `store.test.mjs` ("realtime refusal polls…"): `pause()` removes every channel and no calls follow. Web and mobile hosts already call `pause()` when hidden, backgrounded or offline (`networking.test.mjs`, unchanged). |
| No duplicate intervals | PASS | `realtime.test.mjs` ("one transient drop…"): repeated failures keep one timer, and `stop()` clears it. |
| SQL: 31st message in a minute fails | PASS | `scaling-assertions.sql`, run by `pnpm --filter @qr-chat/api test:sql` (SQLSTATE `PT429`). A mutation check (limit set to 31) made it fail as expected. |
| SQL: 61st join in an hour fails | PASS | Same file. Leaving a group does not reset the count, and log rows older than an hour stop counting. |
| SQL: slow mode only above 300 members | PASS | Same file: 301 members is limited and 300 is not. A message 6s later goes through. |
| SQL: retention | PASS | Same file: QR group messages older than 30 days are deleted. Those at 29 days, direct messages (even 400 days old), friendships and groups are kept. |
| SQL: cron job registered | PASS | Same file: `delete-old-group-messages` at `17 3 * * *`, exactly once after two runs. The existing `expire-qr-memberships` job is untouched. |
| Web and mobile show the rate-limit notice | PASS | Web: `chats-overview.test.mjs` (failed bubble shows the notice) and `networking.test.mjs`. Mobile: `screens.test.mjs` (slow-mode notice on a failed send, join-limit notice on the scanner) and `chat-provider.test.mjs`. `api.test.mjs`: `PT429` becomes `ChatApiError` with code `RATE_LIMITED`. |
| `pnpm check`, `test:sql`, `web build` | PASS | `pnpm check` exit 0 (tooling 12, domain 11, api 61, web 55, mobile 103). `test:sql` prints "All scaling assertions passed". The build route table is unchanged from Phase 1. |

Decisions:
- **What "group expired" means.** A QR membership expires 1 day after `joined_at` (`public.expires_at`). The live pg_cron job runs `private.expire_qr_memberships()` every minute and deletes expired memberships. The `clear_empty_group` trigger then deletes a group's messages when its last membership goes. So a group "expires" when its last membership does, and its messages are already gone about a minute later. A literal "delete 30 days after expiry" job would never find anything.
  - What actually grows without limit is the history of QR groups that never empty. `20261012110000_group_message_retention.sql` therefore deletes **QR group messages older than 30 days**, daily.
  - DM groups (`code_key is null`) are never touched.
  - **Owner decision point:** if you want active groups to keep full history, skip this file. Nothing else depends on it.
- **No row deletion for memberships or groups.**
  - Memberships are already deleted by the existing job.
  - Group rows hold the server-resolved name and photo and are reused on every rejoin by `code_key`, so they stay.
- **Join limit uses a log, `private.qr_join_log`.** Counting current memberships could be reset by leaving a group. Every `join_qr_group` call counts, including rejoins, which also caps rejoin spam that would fan out membership events. The function prunes each user's rows older than an hour, so there are at most 60 rows per user.
- **Message limit index.** `messages_sender_id_created_at_idx (sender_id, created_at)` serves the 1-minute and slow-mode checks. It replaces `messages_sender_id_idx`, whose leading column it covers, including the `sender_id` foreign key.
- **Rate-limit errors** use SQLSTATE `PT429`, which PostgREST returns as HTTP 429. The message text is the user notice. Thresholds are named constants: `c_messages_per_minute`, `c_slow_mode_min_members`, `c_slow_mode_interval` and `c_joins_per_hour`.
- **The polling state is `polling`.** Existing UI already treats anything other than `connected` as not live: muted dot and "Reconnecting…" subtitle. The full-width "Reconnecting…" banner shows only for `reconnecting`, so a refused client keeps working without a scary banner. No new screens.
- **Design system.** The DesignSystem-v2 artifact was read. The only visible change is copy inside the existing failed-message line (`message-failed` and `colors.danger`); no new styles or tokens.
- **What polling reads.** Polling calls the store's overview refresh, not the reconnect validation. Conversations whose head ids did not change download nothing (`store.test.mjs` asserts overview-only calls).
