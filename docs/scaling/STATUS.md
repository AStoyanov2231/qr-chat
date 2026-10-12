# Scaling to 100K users: status

Branch `perf/scale-100k`, one commit per phase, not pushed. Nothing was applied to live Supabase or Vercel.
Owner steps (SQL, settings, benchmark) are in [APPLY.md](APPLY.md).

Legend: PASS = verified locally with the evidence shown. BLOCKED = needs an owner step; the unblock condition is given.

## Environment notes

- `supabase/` is gitignored ("local migrations stay private"), so the new SQL files sit in `supabase/migrations/` on disk but are **not in the commits**. The SQL tests include them from there, as the existing fixture already did.
- `pnpm --filter @qr-chat/api test:sql` was broken on `master` for two reasons. `initdb` failed on the empty locale; fixed with `--locale=C`. Also, `schema-regression.sql` includes three private base migrations that are no longer on disk. Read-only catalog queries against the live project were blocked by the session's permission policy, so Phase 2 adds a self-contained model of the current schema instead: `packages/api/tests/sql/scaling.sql`, built from the applied migration text. `test:sql` now runs that model. `node tests/run-sql.mjs schema-regression.sql` still runs the old fixture once the private files are restored.
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
