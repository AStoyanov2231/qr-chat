# Owner apply guide

Everything here is for you (the owner) to run. The branch changed only code and local files.
Run the SQL files in the Supabase SQL editor **in this order**, each in one go. Every file is safe to re-run.

## 1. Migrations (in order)

| # | File (`supabase/migrations/`) | What it changes | Rollback |
| --- | --- | --- | --- |
| 1 | `20261012100000_join_returns_group_name.sql` | `join_qr_group(text)` also returns `name`, so clients skip `/api/qr-name` for named groups. | Re-run the `join_qr_group` part of `20261011150000_server_owned_group_metadata.sql` after `drop function public.join_qr_group(text); drop function private.join_qr_group(text);`. |

## 2. Dashboard settings

- **Vercel → Project → Settings → Deployment Retention**: keep about 30 days of deployments.

## 3. After applying: deploy and smoke test

- Deploy `perf/scale-100k` as a preview first, then:
  - Signed out, open `/?code=Test`: you should land on `/sign-in?next=/?code=Test`.
  - Sign in: you should come back to `/?code=Test`.
  - Open `/chats?code=X`: you should get a 307 to `/?code=X`.
  - Open `/design-preview`: you should get a 404.
- In Vercel Usage, Function Invocations should now come only from `/api/qr-name` and `/auth/callback`.
