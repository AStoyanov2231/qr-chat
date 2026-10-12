# Scaling runbook

What to watch, when to act, and how to load test. Limits are the plan allowances as of October 2026; check the
Supabase and Vercel pricing pages before relying on a number.

## Metrics and alert thresholds (alert at 70%)

| Metric | Where to read it | Free / Hobby limit | Pro limit | Alert at 70% (current plan) |
| --- | --- | --- | --- | --- |
| Peak Realtime connections | Supabase → Reports → Realtime | 200 | 500 included | 140 |
| Realtime messages per second (peak) | Supabase → Reports → Realtime | 100/s | 500/s | 70/s |
| Realtime messages per month | Supabase → Usage | 2M | 5M included | 1.4M |
| Egress, uncached | Supabase → Usage | 5 GB | 250 GB included | 3.5 GB |
| Egress, cached (Storage CDN) | Supabase → Usage | 5 GB | 250 GB included | 3.5 GB |
| Database size | Supabase → Usage | 500 MB | 8 GB included | 350 MB |
| Fast Data Transfer | Vercel → Usage | 100 GB | 1 TB included | 70 GB |
| CDN (edge) requests | Vercel → Usage | 1M | 10M included | 700K |
| Function invocations | Vercel → Usage | 1M | 1M included, then metered | 700K |

How to alert:
- **Supabase:** Settings → Billing → Usage, plus the email notices sent at 80% and 100%. Add a weekly look at Reports → Realtime peak connections. Supabase has no custom-threshold alert on Free; on Pro, set a spend cap or use a log drain.
- **Vercel:** Settings → Billing → Spend Management, with notifications at 70%.

What normal looks like after this branch:
- **Function invocations** come only from `/api/qr-name` (unnamed groups, at most one Open Food Facts call per new barcode) and `/auth/callback` (sign-ins). Page views and the analytics beacon no longer invoke functions. A jump here means a crawler or a client calling `/api/qr-name` in a loop. Check Vercel logs for the path.
- **Realtime connections:** one per open tab or foregrounded app (all topics share one socket). Hidden tabs and backgrounded apps disconnect.
- **Realtime messages:** one per message per online member of its group, plus a few per membership, friendship or profile change. Rooms above 300 members send no member-change events.
- **Database size** grows with direct messages and 30 days of QR group history. Expired groups empty within a minute (`expire-qr-memberships` plus the `clear_empty_group` trigger), and older QR history goes nightly (`delete-old-group-messages`).

## Upgrade triggers

- **Supabase Pro ($25/month plus compute):** when peak Realtime connections regularly exceed **150**, i.e. more than once a week. Above 200, new clients are refused and fall back to 5-second polling. Nothing breaks, but polling costs more requests and egress than Realtime. Database size above 350 MB or egress above 3.5 GB a month are also triggers.
- **Vercel Pro ($20/month per member):** when Fast Data Transfer exceeds about **80 GB a month**, or edge requests near 700K.
- **Beyond Pro:**
  - Raise the Realtime connection quota (Supabase → Settings → Realtime; billed per 1,000 peak connections).
  - Size compute to the connection count, from Small up.
  - Add an index on `messages(created_at)` only if the nightly retention delete shows in slow queries.

## Signals that something is wrong

- **Many clients in `polling`.** Realtime is refusing joins (connection quota, joins per second, or tenant events). Check Supabase → Realtime → Inspector and logs for `too_many_connections` or `too_many_joins`. Raise the quota or upgrade.
- **Function invocations rising without sign-ins.** Look for repeated `/api/qr-name` calls. The products cache should make repeats cheap; a 503 spike means Open Food Facts is rate-limiting (about 15 product reads per minute per server IP).
- **Users report "Not sent. You are sending messages too fast."** That's the database limit of 30 messages per minute per user. In rooms above 300 members, slow mode allows one message per 5s. Thresholds are constants in `20261012120000_rate_limits.sql`.

## Load test (owner-run, test project only)

The benchmark refuses the production project. Use a separate Supabase project with all migrations from `APPLY.md` applied, and one disposable account per simulated client.

```bash
export QR_CHAT_BENCHMARK_ENV=test
export QR_CHAT_TEST_SUPABASE_URL=https://<test-project>.supabase.co
export QR_CHAT_TEST_SUPABASE_PUBLISHABLE_KEY=<test publishable key>
export QR_CHAT_TEST_USERS_FILE=/path/to/users.json   # [{"id","email","password"}...], disposable accounts
```

| Scenario | Command | Pass condition |
| --- | --- | --- |
| Idle cost, 30 minutes | `QR_CHAT_BENCHMARK_CLIENTS=50 QR_CHAT_BENCHMARK_MODE=idle node packages/api/tests/traffic-benchmark.mjs` | Reports requests per client per minute. With `QR_CHAT_BASELINE_FILE`, an 80% reduction against the baseline. |
| Broadcast fan-out, large room | `QR_CHAT_BENCHMARK_CLIENTS=400 QR_CHAT_BENCHMARK_ROOM_SIZE=400 QR_CHAT_BENCHMARK_MODE=messages QR_CHAT_BENCHMARK_SECONDS=60 node packages/api/tests/traffic-benchmark.mjs` | Every delivery arrives within 2s (`deliveryMaxMs`). Pacing respects slow mode. |
| Overflow to polling | On a Free test project: `QR_CHAT_BENCHMARK_CLIENTS=250 QR_CHAT_BENCHMARK_MODE=overflow QR_CHAT_BENCHMARK_SECONDS=60 node packages/api/tests/traffic-benchmark.mjs` | `connectionStates.polling` > 0, every delivery arrives, and `deliveryMaxMs` ≤ 8000. |
| Rate limits | `QR_CHAT_BENCHMARK_CLIENTS=1 QR_CHAT_BENCHMARK_MODE=ratelimit QR_CHAT_BENCHMARK_SECONDS=10 node packages/api/tests/traffic-benchmark.mjs`, then the same with `CLIENTS=301 ROOM_SIZE=301` for slow mode | `rejections.messages` is 1, or `rejections.slowMode` ≥ 1 in the big room. |
| Pause and resume | `QR_CHAT_BENCHMARK_CLIENTS=20 QR_CHAT_BENCHMARK_MODE=resume QR_CHAT_BENCHMARK_SECONDS=60 node packages/api/tests/traffic-benchmark.mjs` | Every message missed while paused arrives after resume. |

Notes:
- `QR_CHAT_BENCHMARK_CLIENTS` is capped at 1,000 per run. Run several machines for more.
- Each run joins and leaves its own `benchmark-<run id>-…` rooms and removes the accounts' friendships.
- Set `QR_CHAT_BENCHMARK_OUTPUT=report.json` to keep the aggregate report. It contains no tokens or message bodies.
