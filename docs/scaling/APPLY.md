# Owner apply guide

Everything here is for you (the owner) to run. The branch changed only code and local files.
Run the SQL files in the Supabase SQL editor **in this order**, each in one go. Every file is safe to re-run.
Shortcut: `supabase/APPLY_ALL.sql` is files 1–6 concatenated in order (tested end to end, twice in a row). It does **not** include the deferred cleanup.
The `messages` index in file 3 is built without `CONCURRENTLY` (the editor runs a transaction), so it briefly blocks message inserts. That's fine at today's size.

## 1. Migrations (in order)

| # | File (`supabase/migrations/`) | What it changes | Rollback |
| --- | --- | --- | --- |
| 1 | `20261012100000_join_returns_group_name.sql` | `join_qr_group(text)` also returns `name`, so clients skip `/api/qr-name` for named groups. | Re-run the `join_qr_group` part of `20261011150000_server_owned_group_metadata.sql` after `drop function public.join_qr_group(text); drop function private.join_qr_group(text);`. |
| 2 | `20261012110000_group_message_retention.sql` | Adds `private.delete_old_group_messages()` and a daily pg_cron job, `delete-old-group-messages` (03:17 UTC), that deletes QR group messages older than 30 days. Direct messages are never touched. **Optional:** skip it to keep full history in active groups. | `select cron.unschedule('delete-old-group-messages'); drop function private.delete_old_group_messages();` |
| 3 | `20261012120000_rate_limits.sql` | Message limit (30/min per user), slow mode (above 300 members, 1 message per 5s), join limit (60/hour, `private.qr_join_log`), and the index `messages_sender_id_created_at_idx` replacing `messages_sender_id_idx`. | `drop trigger limit_message_rate on public.messages; drop function private.limit_message_rate();` then re-run file 1 to restore `join_qr_group` without the limit, `drop table private.qr_join_log;`, `create index messages_sender_id_idx on public.messages(sender_id);` |
| 4 | `20261012130000_realtime_broadcast.sql` | Private Broadcast: `private.can_receive_topic` plus the policy `qr_chat_receive_topics` on `realtime.messages`, and id-only broadcast triggers on `messages` (insert), `group_members`, `friendships` and `profiles`. The publication is left as is for installed apps. | `drop trigger broadcast_message on public.messages; drop trigger broadcast_membership on public.group_members; drop trigger broadcast_friendship on public.friendships; drop trigger broadcast_profile on public.profiles; drop policy qr_chat_receive_topics on realtime.messages;` then drop the `private.broadcast*` and `private.can_receive_topic` functions. Old clients keep working on Postgres Changes. |
| 5 | `20261012150000_products_cache.sql` | Server-only `public.products` cache (GTIN, name, photo path, not-found flag, fetch time), and `groups_image_path_check` now also accepts shared product photos `p/<gtin>.jpg`. | `drop table public.products;` then restore the old check: `alter table public.groups drop constraint groups_image_path_check, add constraint groups_image_path_check check (image_path ~ '^[0-9a-f-]{36}\.jpg$');` (fails if any group already uses a `p/` photo; clear those first). |
| 6 | `20261013100000_membership_broadcast_expired_only.sql` | Member-change broadcasts are skipped only for expired rows (the per-minute expiry job). Service-role deletes, such as account deletion, notify the group again. **If you already applied files 1–5, run just this file.** | Re-run the `broadcast_membership` function from file 4. |

**Order:** apply files 1–6, *then* deploy the web app and ship the mobile release. Clients built from this branch fall back to 5s polling until file 4 exists, so a mismatch slows updates but breaks nothing.

### Deferred cleanup (not in the order above)

`supabase/deferred/20261012140000_drop_postgres_changes_publication.sql` removes `profiles`, `group_members`, `messages` and `friendships` from the `supabase_realtime` publication.
- **When it's safe:** only after every installed mobile build includes Phase 3 (force-update or retire older versions). Older builds subscribe with Postgres Changes and stop receiving live updates once it runs; they still refresh every 120s.
- **Rollback:** the command is in the file header.

## 2. Dashboard settings

- **Vercel → Project → Settings → Deployment Retention**: keep about 30 days of deployments.
- **Supabase → Realtime → Settings**: Broadcast authorization uses the RLS policy from file 4. Optionally turn **off** "Allow public access" so only private channels are accepted; clients from this branch only use private channels. Leave it on until the deferred cleanup if you're unsure. Old builds use Postgres Changes, which this setting does not govern, but check after flipping.
- **Supabase → Database → Extensions**: confirm `pg_cron` is enabled. It already runs `expire-qr-memberships` every minute; file 2 adds one more job.

## 3. After applying: deploy and smoke test

- Deploy `perf/scale-100k` as a preview first, then:
  - Signed out, open `/?code=Test`: you should land on `/sign-in?next=/?code=Test`.
  - Sign in: you should come back to `/?code=Test`.
  - Open `/chats?code=X`: you should get a 307 to `/?code=X`.
  - Open `/design-preview`: you should get a 404.
- In Vercel Usage, Function Invocations should now come only from `/api/qr-name` and `/auth/callback`.

## 4. Benchmark and e2e (after the SQL is applied)

Use a **test** Supabase project with files 1–5 applied. The benchmark refuses the production project.

- **Load tests:** `docs/scaling/RUNBOOK.md` → "Load test" lists the scenarios and their environment variables: `QR_CHAT_BENCHMARK_ENV=test`, `QR_CHAT_TEST_SUPABASE_URL`, `QR_CHAT_TEST_SUPABASE_PUBLISHABLE_KEY`, `QR_CHAT_TEST_USERS_FILE`, plus `QR_CHAT_BENCHMARK_CLIENTS`, `_ROOM_SIZE`, `_MODE` and `_SECONDS`.
- **Backend integration** (private Broadcast delivery and reconnect):

  ```bash
  pnpm --filter @qr-chat/api test:integration
  ```

  This needs the same test-project variables the suite already reads (see `packages/api/tests/integration/backend.test.mjs`).
- **Web e2e** against a deployed preview:

  ```bash
  pnpm --filter web test:e2e
  ```

  Check the sign-in redirect, the `/chats` redirect, and "Not sent. …" notices.

## 5. Rollback

Per-file rollback commands are in the table above. Code rollback means redeploying the previous Vercel deployment and the previous mobile build. Clients from this branch keep working against the old schema in reduced form:
- without file 4 they poll every 5 seconds;
- without file 1 they call `/api/qr-name` as before.
