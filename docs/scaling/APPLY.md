# Owner apply guide

Everything here is for you (the owner) to run. The branch changed only code and local files.
Run the SQL files in the Supabase SQL editor **in this order**, each in one go. Every file is safe to re-run.

## 1. Migrations (in order)

| # | File (`supabase/migrations/`) | What it changes | Rollback |
| --- | --- | --- | --- |
| 1 | `20261012100000_join_returns_group_name.sql` | `join_qr_group(text)` also returns `name`, so clients skip `/api/qr-name` for named groups. | Re-run the `join_qr_group` part of `20261011150000_server_owned_group_metadata.sql` after `drop function public.join_qr_group(text); drop function private.join_qr_group(text);`. |
| 2 | `20261012110000_group_message_retention.sql` | Adds `private.delete_old_group_messages()` and a daily pg_cron job, `delete-old-group-messages` (03:17 UTC), that deletes QR group messages older than 30 days. Direct messages are never touched. **Optional:** skip it to keep full history in active groups. | `select cron.unschedule('delete-old-group-messages'); drop function private.delete_old_group_messages();` |
| 3 | `20261012120000_rate_limits.sql` | Message limit (30/min per user), slow mode (above 300 members, 1 message per 5s), join limit (60/hour, `private.qr_join_log`), and the index `messages_sender_id_created_at_idx` replacing `messages_sender_id_idx`. | `drop trigger limit_message_rate on public.messages; drop function private.limit_message_rate();` then re-run file 1 to restore `join_qr_group` without the limit, `drop table private.qr_join_log;`, `create index messages_sender_id_idx on public.messages(sender_id);` |

## 2. Dashboard settings

- **Vercel → Project → Settings → Deployment Retention**: keep about 30 days of deployments.
- **Supabase → Database → Extensions**: confirm `pg_cron` is enabled. It already runs `expire-qr-memberships` every minute; file 2 adds one more job.

## 3. After applying: deploy and smoke test

- Deploy `perf/scale-100k` as a preview first, then:
  - Signed out, open `/?code=Test`: you should land on `/sign-in?next=/?code=Test`.
  - Sign in: you should come back to `/?code=Test`.
  - Open `/chats?code=X`: you should get a 307 to `/?code=X`.
  - Open `/design-preview`: you should get a 404.
- In Vercel Usage, Function Invocations should now come only from `/api/qr-name` and `/auth/callback`.
