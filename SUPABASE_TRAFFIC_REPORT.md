# Supabase traffic review

Pre-implementation baseline recorded 2 October 2026: repository commit `3f4d664a`, live read-only logs for project `qr-chat`, database indexes, cron, and query statistics. The findings below describe that earlier checkout. See [the implementation and rollout results](NETWORKING_OPTIMIZATION.md) for the current changes and verification status.

**Finding: the clients repeatedly reload substantially more data than they need.** This is confirmed by both the code and live requests. Optimizing shared API and client refresh behavior should come before increasing database capacity.

The linked image is absent from this worktree. The copy at `/Applications/Coding/qr-chat/SupabaseTrafic.png` renders as Vercel analytics setup, so its intended Supabase chart could not be verified. The measurements below come directly from Supabase instead.

**Measured traffic: 1 October 19:43 to 2 October 19:43, Europe/Sofia.**

| Measurement | Requests |
|---|---:|
| Total HTTP gateway requests | 36,250 |
| Web SDK clients | 32,257 (89%) |
| Native SDK client | 2,752 (7.6%) |
| Server SDK clients | 99 (0.27%) |
| Successful authentication user lookups | 15,978 (44% of total) |
| Successful membership reads | 6,289 |
| Successful friendship reads | 4,722 |
| Successful direct-message reads | 3,714 |
| Successful profile reads | 2,197 |
| Successful group-message reads | 2,061 |

Client categories and endpoint counts overlap; do not add them together. There were only 23 successful message inserts and 35 token requests. Routine token renewal is therefore not the main cause. Logs contain **five distinct authenticated user IDs**, which may be your test accounts; this is not a measured single-account workload. Several browser/device signatures contributed. The busiest complete hour had 4,933 requests, while some hours had none, including 04:00–08:00 Sofia time. The inspected window does not show uninterrupted HTTP traffic all day.

**Recommended changes, in implementation order:**

| Priority | Cause and implementation location | Suggested fix |
|---|---|---|
| 1 | Every `userId()` in `packages/api/src/index.ts:62` calls remote Auth. `loadChatSnapshot()` in `packages/api/src/snapshot.ts:48` performs seven such calls with a group, six without. | Use the host's current session identity for client-side query filters, with Supabase RLS enforcing access. Track account/session changes locally and discard stale results. For server identity verification, prefer verified `getClaims()` where appropriate; asymmetric signing is required to avoid a remote check. Retain remote checks where immediate revocation verification is required. |
| 1 | Each `watchChanges()` in `packages/api/src/realtime.ts:89` polls every 30 seconds, even when Realtime works. Web adds another timer in `apps/web/src/hooks/use-chat-backend.ts:58`. Up to four timers reload the same global snapshot. | Give each client one reconciliation scheduler shared across watchers. Use Realtime for prompt updates, a slower lightweight authorization/recovery check (initially 2–5 minutes), and immediate checks on resume/reconnect and membership expiry. Pause web polling/subscriptions while hidden or offline. Keep native AppState gating in `apps/mobile/src/providers/chat-provider.tsx` and `auth-provider.tsx`, which already stops inactive work. |
| 1 | Any group message or direct preview event reloads profile, membership, friends, members, previews, and all loaded group pages. Watchers serialize only their own refreshes; generation counters discard responses but do not prevent requests. | Share one in-flight coordinator across timers, events, mutations, and resume. Coalesce event bursts and refresh only the affected resource. Preserve the refresh after PostgreSQL replication readiness: existing tests document a startup race. |
| 2 | `loadDirectPreviews()` in `packages/api/src/snapshot.ts` issues one query per accepted friend on every global refresh. Four concurrent workers limit concurrency, not request count. | Fetch previews in one RLS-protected SQL query/RPC returning the latest message per authorized connection. Fetch only the changed preview after a DM event; reuse the active conversation's data. Paginate contacts as they grow. |
| 2 | Both snapshot loaders reread every previously loaded message page; friendship/membership are also rechecked repeatedly. | Retain older pages in a session-scoped cache; query only new messages or the next older cursor. Invalidate on access loss, edits/deletes, and account changes. Consider a coherent RLS-protected bootstrap RPC to batch related reads without removing authorization safeguards. Select only displayed columns. |
| 3 | Vercel `/api/qr-name` uses remote `getUser()` in `apps/web/src/lib/qr-name-route.ts:49`; `qr-name-metadata.ts:274` fetches external metadata without a reusable cache. | Cache successful public URL metadata internally with bounded TTL, briefly cache misses, and combine name/image lookup client-side. Authenticate each request; rate-limit by verified identity. Review redundant proxy/route verification. Keep personalized chat responses private; do not apply shared CDN caching to them. |
| 3 | Message queries order by `id`, whereas current compound indexes are `(group_id, created_at DESC, id DESC)` and `(friend_connection_id, created_at DESC, id DESC)`. | Measure authenticated query plans with representative history. If sorting becomes expensive, add indexes matching `(group_id, id DESC)` and `(friend_connection_id, id DESC)`, or align pagination with the existing index. Indexes reduce database work, not HTTP count. Live performance advisors currently report no findings. |

Supabase documents that [`getUser()` makes a network request](https://supabase.com/docs/reference/javascript/auth-getuser), while [`getClaims()` can verify through cached signing keys](https://supabase.com/docs/reference/javascript/auth-getclaims). Vercel documents [private response caching](https://vercel.com/docs/caching/cache-control-headers).

**What 1,000 users could mean.** With one group page, a global snapshot currently costs `14 + F` HTTP calls, where `F` is accepted friends. Three web timers without friends produce about 5,040 calls/hour; four timers with one friend produce about 7,200. These are code-derived steady-state estimates excluding startup, events, writes, and browser throttling. At 1,000 simultaneously visible clients with those states, that is roughly **1,400–2,000 requests/second before message activity**. Registered users and concurrent active clients are different sizing inputs; do not multiply today's aggregate by 1,000.

There is separate background database activity: membership cleanup runs every minute, and Realtime performs internal replication queries. Cumulative statistics since 13 September show 207,362 `realtime.list_changes` calls and 27,338 expiry calls; these are **not 24-hour client HTTP counts**. Cleanup already has an expiry index. Changing its frequency is lower priority and requires verifying expiry enforcement independently of cleanup.

For busy rooms, evaluate [private Realtime Broadcast](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes) after the client fixes. [Postgres Changes checks authorization per subscriber per event](https://supabase.com/docs/guides/realtime/postgres-changes); a message that causes every participant to reload a full snapshot adds another large fan-out. Preserve authorization, revocation, missed-event recovery, and membership expiry when changing transports.

**Verification before rollout:** record request count, response bytes, query latency, and refresh reason for identical 30-minute idle and messaging scenarios. Require no routine data polling while hidden/backgrounded, one refresh per coalesced trigger, one preview query regardless of friend count, and no history-page rereads for a new message. Re-run `packages/api/tests/realtime.test.mjs`, `snapshot.test.mjs`, SQL authorization tests, and client lifecycle tests with coverage for account switches, removed friendships, expiration, reconnects, and missed deletes. Then load-test 100 and 1,000 concurrent clients using realistic room sizes. A reasonable initial target is **80% fewer idle Auth/Data API requests**, to be measured rather than assumed.
