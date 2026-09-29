# Backend Verification — 2026-09-14

Historical production evidence, not current validation. Project: `zkgvdeluswvmwirhhufi`.

| Check | Recorded result |
| --- | --- |
| Node units | 12 passed: validation, QR, writes, cursors, RPCs, sign-out, subscription/recovery |
| Authorization SQL | Passed: RLS, hostile inputs, sender/profile ownership, friendships/DMs, expiry/cascades; fixtures rolled back |
| Live API integration | 6 workflows passed: concurrent joins, pagination, permissions, Realtime/reconnect, sign-out |
| Browser E2E | Two users: joining, messaging, friends/DMs, offline recovery, profile persistence, leaving, route protection, overflow |
| Lint/typecheck/build | Passed, including mobile types and production Next.js build |
| Whitespace | `git diff --check` passed |

Fixed profile-load overwrite and composer alignment; subscription tests cover the PostgreSQL readiness gap. React Doctor's 7 state-updater findings referred to an event-action helper; complexity warnings remained, final score unavailable. Security advisor reported existing disabled leaked-password protection.

Cleanup confirmed zero fixture users/QR records; temporary credentials/browser/server artifacts removed. No schema, RLS, RPC, publication, cron, OAuth configuration, commit, or deployment change. No local Supabase.
