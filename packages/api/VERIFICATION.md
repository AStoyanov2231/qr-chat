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

## Member profiles and avatars — 2026-09-30

- 74 workspace unit tests passed, including 21 API tests. Lint/typecheck, production web build, iOS/Android bundle exports, and whitespace checks passed.
- Avatar tests cover JPEG/size/UUID validation, authenticated upload paths, profile-save ordering, keeping a photo during name edits, explicit removal, failed/ambiguous writes, cleanup failures, and avoiding deletion of other users' or provider files. Snapshots carry member/message avatar URLs.
- MCP applied `user_avatar_uploads`; bucket limits and owner policies were verified through read-only queries. Regenerated public database types match the existing file. Security advisor reports no Storage/RLS issue; its existing leaked-password-protection warning remains.
- No credentialed integration/browser tests or authenticated production uploads ran. Unit controls/Storage clients are mocked. Physical-device and live upload verification remain separate.
