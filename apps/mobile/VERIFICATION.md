# Native Verification — 2026-09-19

Historical evidence; source/bundle checks do not establish physical-device readiness. Results below belong to separate recorded passes.

| Pass | Recorded result |
| --- | --- |
| Initial implementation | 55 units passed (domain 2/API 14/mobile 36/web 3); lint/types, iOS/Android bundles, config introspection, iOS Simulator compile, Android debug compile passed |
| Xcode 27 scene fix | Expo 57.0.23/build-properties 57.0.21 + scene support; 49 units, lint/types, bundles, signed simulator build/launch passed |
| Safe-area/scrolling fix | 51 units, lint/types passed; bounded viewport and single application of tab insets |
| Encoded QR identity fix | Four regressions failed before fix; opaque percent-escaped values preserved through native navigation; subsequent units/types/lint/bundles passed |
| Authorized live cross-client test | Two users in one room; messages delivered both directions without refresh; stopped-native recovery, leave/rejoin, single join sheet passed |
| Final live-test code gate | 58 units passed (domain 2/API 14/mobile 39/web 3); workspace lint/types, both bundles, whitespace passed |

## What was exercised

- Shared validation/authorization snapshots, QR parsing, pagination, friendship/DM flows, secure-storage concurrency/failure, PKCE/auth lifecycle.
- Native screen tests use mocked controls/TSX loading and a matching dev renderer; they do not verify native rendering/accessibility engines.
- Room-identity, profile hydration, pending deep links, draft preservation, reconnect, and compiler regressions were reproduced and fixed.
- iOS scene launch required simulator signing for Keychain. Both native compilers had framework warnings; no final compilation failure.
- Live web used the hosted build through a local SSR gateway; this did not verify a new production-origin Google login. Reliable suspension evidence was unavailable.

## Production operations recorded

- QR investigation: read-only project/QR/group/RPC/Realtime/authorization inspection; no private messages or tokens retrieved.
- Explicitly authorized live test: one disposable auth identity, profile/membership, four marked messages, existing user's leave/rejoin.
- Cleanup: signed out fixture user, removed four messages and fixture account; verified zero fixture identities/sessions/tokens/profiles/memberships/messages. Existing user, membership, and original history remained.
- Test gateway/Metro/credentials were removed. No schema, provider, deployment, store, commit, or push change.

## Remaining verification

Physical camera/iPhone, Android devices, provider login/cancel/relaunch, real background suspension, accessibility, keyboard/gestures, and release signing remain separate checks. Broad production API integration/E2E was not rerun in the native passes. Use the [manual checklist](README.md#manual-checks).

The live follow-up updated room/auth coordination, pending joins, related regressions, and local web origin; no native dependency or binary rebuild was needed. The unpinned `serve-sim@latest` helper was rejected before execution and never installed. Earlier scene dependencies were explicitly approved; generated native files were never hand-edited.
