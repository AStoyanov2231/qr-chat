# Native Client Implementation Verification

Date: 2026-09-19.
This report covers local source and build checks, not manual device testing or production-provider verification.

## Implemented Behavior

Home, Groups, and Profile implement the mobile-web visual structure and current product scope at source level.
Pixel-level and native interaction parity remain unverified until the user completes device testing.
Native tabs provide platform navigation, while conversations, camera entry, profile editing, and settings use native stacks and modal presentation.
The app implements QR scanning and manual entry, profile editing, group joining/switching/leaving, group and direct messages, pagination, friendship actions, and Realtime recovery.
Native storage, OAuth PKCE callbacks, foreground token refresh, and camera lifecycle belong to the native client.
Shared domain and API packages provide the same QR and snapshot behavior to web and native.
Existing database rules and RLS remain authoritative.

## Parity Evidence

| Requirement | Current evidence | Remaining evidence |
| --- | --- | --- |
| Home, Groups, Profile design | Source comparison against web colors, hierarchy, sizes, rows, placeholders, and `Design1.png`; native bundle compilation. | Side-by-side device review, large text, safe areas, and VoiceOver/TalkBack. |
| Liquid Glass / Material navigation | Expo Router native tabs and stacks; SF Symbols / Material icons. | Actual rendering and gestures on supported iOS and Android versions. |
| Authentication and protected state | PKCE callback, secure-storage, auth-event races, pending QR destination, and foreground refresh unit tests. | Native provider setup and real login/cancel/relaunch/sign-out on each platform. |
| QR scanning and joining | Tests for invalid input, same-group shortcuts, profile hydration, permission recovery, background camera unmounting, and join destination. | Hardware scanning and real camera permission prompts. |
| Group chat and expiry | Shared API snapshot tests; native room-identity, member actions, rejoin, draft preservation, and failed-refresh tests. | Cross-client messages, actual expiry, gestures, keyboard, and pagination scroll position. |
| Friendships and direct messages | Native request/accept/decline/cancel/remove flows, revoked conversation access, and resume pagination tests; shared authorization tests. | Production-backed cross-client flows with approved disposable accounts. |
| Validation and authorization | Shared schemas, RPC operations, authorization-failure tests, and fail-closed reconciliation. | Approved integration/E2E authorization runs against production. |

Screen-flow tests initially reproduced wrong same-group navigation, late-profile initialization, and automatic retargeting of an open room after membership changed.
Those tests passed after the fixes on both platform branches.
Additional coverage found and fixed stale connected state and lost direct-message pagination when backgrounding.

## Automated Results

| Command | Result |
| --- | --- |
| `pnpm test` | Passed: 55 tests, zero failures; domain 2, API 14, mobile 36, web 3. |
| `pnpm typecheck` | Passed: all six workspace packages. |
| `pnpm lint` | Passed: both configured application lint tasks, no lint warnings. |
| `pnpm --filter mobile exec expo export --platform ios --platform android --output-dir /tmp/qr-chat-native-export` | Passed: both Metro/Hermes bundles generated. |
| `pnpm --filter web exec next build --webpack` | Passed: production web build and route generation. |
| `pnpm --filter mobile exec expo config --type introspect --json` | Passed: callback scheme, native IDs, camera permission, no microphone permission, and legacy external-storage permissions removed. |
| `CI=1 EXPO_OFFLINE=1 pnpm --filter mobile exec expo prebuild --no-install` | Generated native projects through Expo. Android was regenerated after correcting the splash configuration. |
| `pod install` from `apps/mobile/ios` | Passed: 107 native pods installed. |
| `xcodebuild -workspace QRChat.xcworkspace -scheme QRChat -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/qr-chat-ios-derived CODE_SIGNING_ALLOWED=NO build` from `apps/mobile/ios` | Passed: unsigned iOS Simulator application compiled without launching a simulator. |
| `JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ANDROID_HOME='/Users/andy/Library/Android/sdk' ./gradlew :app:assembleDebug --no-daemon` from `apps/mobile/android` | Passed: Android debug APK compiled, 353 tasks. No emulator/device launched or app installed. |
| `git diff --check` | Passed. |

Native export/config commands used `CI=1 EXPO_OFFLINE=1`.
Tests run against in-memory fakes and local logic, with no backend writes.
The Node test runner emitted its informational module-type warning for TypeScript helpers in the Expo package; tests passed.
Native screen tests use mocked host controls and the Node runner, with a TypeScript TSX loader and a dev-only renderer matching native React.
React emits its upstream `react-test-renderer` deprecation notice; no warning is suppressed.

Approved dependency changes were applied through pnpm:

```sh
pnpm --filter mobile add expo-camera@~57.0.5 expo-secure-store@~57.0.4 expo-crypto@~57.0.3 @supabase/supabase-js@2.116.0
pnpm --filter web --filter @qr-chat/api add '@qr-chat/domain@workspace:*'
pnpm install --frozen-lockfile
pnpm --filter mobile add -D react-test-renderer@19.2.3
```

Initial sandboxed installation attempts failed because registry DNS was blocked.
The authorized registry-access retries and full frozen installation succeeded and repaired incomplete package links.
Initial type checks then identified stale generated Expo routes and the missing TypeScript extension-import setting.
The setting was added, and route declarations were regenerated through the installed Expo generator; generated files were not hand-edited.
`expo customize tsconfig.json` and a brief offline Expo start were also used while investigating route generation.
No browser, simulator, or device was operated for subjective verification.

Native dependency installation required approved network/cache access after sandbox restrictions prevented CocoaPods and Gradle downloads.
The initial Android native compile reproduced a missing `splashscreen_logo` resource when the splash plugin had only a background color.
The source configuration now supplies a transparent drawable, preserving the plain splash, and Android was regenerated with `CI=1 EXPO_OFFLINE=1 pnpm --filter mobile exec expo prebuild --platform android --no-install`.
The SDK expects `android.drawable.icon` as an object property; an initial string configuration was corrected before the successful regeneration.
No generated native project file was hand-edited.
Expo generation set the `ios` and `android` scripts to its native `run` defaults; documentation now reflects those build-and-launch commands.
Both native compilers emitted warnings from pinned framework dependencies, including deprecated APIs and Gradle features; neither native build reported a compilation error on the final run.

Local outputs:

- iOS Simulator app: `/tmp/qr-chat-ios-derived/Build/Products/Debug-iphonesimulator/QRChat.app`.
- Android debug APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

These are development binaries; the debug clients use Metro for JavaScript.
Both platform JavaScript bundles were separately verified through Expo export.

## Xcode 27 Launch Compatibility Follow-up

The user reported a startup failure after the initial compile-only verification.
An automated `simctl launch --console --terminate-running-process` on the already-running iPhone 18 Pro simulator reproduced the UIKit error: `Application failed to launch: UIScene life cycle is required for apps built with this SDK`.
The local toolchain is Xcode 27.0, and the generated SDK 57 entry point still used the legacy application lifecycle.

With explicit user approval, Expo was pinned to `57.0.23`, `expo-build-properties` was pinned to `57.0.21`, and `ios.enableSceneSupport` was enabled in `app.json`.
This follows [Expo's SDK 57 migration guide](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27).
The generated app delegate now provides the React Native factory to Expo's scene delegate, and the scene manifest selects `EXExpoAppSceneDelegate`.
No generated native file was hand-edited.
No application UI, product logic, authentication policy, or backend configuration was changed.

`tests/native-config.test.mjs` runs Expo's real config introspection in a clean temporary fixture and checks the generated scene manifest.
The fixture deliberately has no existing native directory, preventing a stale generated manifest from hiding a configuration regression.
The equivalent old configuration was also evaluated and confirmed to emit no scene manifest.

Follow-up commands:

- `pnpm --filter mobile add expo@57.0.23 expo-build-properties@57.0.21 --save-exact`, followed by `pnpm install` after explicitly pinning the Expo manifest to the approved version.
  pnpm initially retained the previous tilde range and resolved `57.0.24`; the final manifest, lockfile, installed package, and CocoaPods installation all use `57.0.23`.
- `CI=1 EXPO_OFFLINE=1 pnpm --filter mobile exec expo prebuild --platform ios --no-install`: passed.
- `pod install` from `apps/mobile/ios`: passed, 107 pods.
- `pnpm test`: passed, all 49 tests; unchanged workspace test tasks reused valid Turborepo results.
- `pnpm lint` and `pnpm typecheck`: passed.
- `CI=1 EXPO_OFFLINE=1 pnpm --filter mobile exec expo export --platform ios --platform android --output-dir /tmp/qr-chat-native-scene-export`: passed for both platforms.
- `xcodebuild -workspace QRChat.xcworkspace -scheme QRChat -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/qr-chat-ios-derived CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES build` from `apps/mobile/ios`: passed.
- `xcrun simctl install F9323394-8645-4974-9403-29F5A487C6AB /tmp/qr-chat-ios-derived/Build/Products/Debug-iphonesimulator/QRChat.app`, followed by `xcrun simctl launch --console --terminate-running-process F9323394-8645-4974-9403-29F5A487C6AB com.qrchat.mobile`: passed on the already-running iOS 27 simulator.
- `xcrun simctl spawn F9323394-8645-4974-9403-29F5A487C6AB launchctl list`: repeated checks confirmed the same app process remained alive while Metro delivered the JavaScript bundle.
- `git diff --check`: passed.

The first runtime check used the earlier compile-only command with `CODE_SIGNING_ALLOWED=NO`.
That binary passed the scene lifecycle check but could not access Keychain because it lacked the simulator entitlement.
Rebuilding with standard ad-hoc simulator signing supplied the simulated application identifier; the final launch had no UIKit lifecycle failure, Keychain exception, or fatal startup error in the process-specific logs, and no Metro errors after connecting.
The pinned Supabase SDK still emits a non-fatal deprecation warning for its `lock` option.
The temporary Metro server and test instance were stopped after verification.
This automated launch/process/log check did not assess UI appearance or interactions, and it does not establish physical-device or release-signing readiness.
Evidence is in `/tmp/qr-chat-ios-scene-reproduction.log`, `/tmp/qr-chat-ios-scene-build.log`, `/tmp/qr-chat-ios-scene-metro.log`, and `/tmp/qr-chat-ios-scene-runtime-errors.log`.

Source files changed for this follow-up are `apps/mobile/app.json`, `apps/mobile/package.json`, `pnpm-lock.yaml`, `apps/mobile/tests/native-config.test.mjs`, `apps/mobile/README.md`, and this report.
No source files were removed.
The Android native binary and web production build were not rebuilt for this iOS-specific follow-up; their earlier results above remain historical evidence.
Production-backed integration and E2E were not run because they require separate approval and disposable credentials.
There were no Supabase operations, provider changes, commits, pushes, or deployments.

Manual follow-up: relaunch the app, background and resume it, and verify QR and OAuth deep links after native sign-in configuration is complete.
Visual, interaction, and real-provider verification remain user-owned.

## Native Spacing and Scrolling Follow-up

The user's screenshots reproduced the Home tip under the floating tab bar and the Groups empty state sitting too low.
The shared scroll content filled the full viewport before UIKit added navigation insets, while the empty state expanded to fill unused space.
The two new platform regression cases failed before the screen-boundary fix and passed afterward.
They check the React component and navigator contract with mocked native controls, not native geometry or pixel output.

`Screen` now places its scroll viewport inside the native screen's safe area, and native tab triggers disable their separate automatic content insets.
Short content no longer requests vertical bouncing; real overflow remains scrollable for long lists and accessibility text.
Home spacing is tighter, the Groups empty state no longer stretches, and an empty friends section no longer inserts a spare gap.
The same native tab navigation, colors, typography, authentication, and backend rules remain in place.
No dependency installation, config plugin change, or native project regeneration was needed.
The installed debug app can load this change through Metro.

Final checks:

- `pnpm test`: passed, 51 tests with zero failures; domain 2, API 14, mobile 32, web 3.
- `pnpm lint`: passed, both application tasks.
- `pnpm typecheck`: passed, all six workspace tasks.
- `CI=1 EXPO_OFFLINE=1 pnpm --filter mobile exec expo export --platform ios --platform android --output-dir /tmp/qr-chat-native-layout-export`: passed for both platforms.
- `git diff --check`: passed.

Changed files for this follow-up: `apps/mobile/src/components/chat-ui.tsx`, `apps/mobile/src/components/app-tabs.tsx`, the native Home and Groups routes, `apps/mobile/tests/support/native-harness.mjs`, new `apps/mobile/tests/layout.test.mjs`, `apps/mobile/README.md`, `apps/mobile/AGENTS.md`, and this report.
No files were removed.
The README now documents cable installation with Xcode signing, standalone local Release builds, and the debug workflow that avoids rebuilding for JavaScript edits.
Physical-device installation was not performed; the user requested instructions and owns manual device verification.
Native binaries and the web production target were not rebuilt for this JavaScript-only layout change.
Production-backed integration/E2E remain unrun because they require separate approval and disposable credentials.
No Supabase operations, provider changes, commits, pushes, or deployments occurred.

Manual checks: verify the Home tip is fully visible above native tabs, Groups content sits higher without an empty section gap, and short pages do not scroll just to accommodate navigation insets.
Also verify Profile and modal fields remain reachable with larger text and the keyboard open, and that long friend lists still scroll.
Compare the installed app against hosted mobile web using the same Supabase project and account; use two accounts for cross-client message and friendship testing.

## Cross-client QR Identity Follow-up

The user supplied native and hosted-web screenshots showing different representations of the same scanned QR.
Read-only Supabase MCP inspection confirmed two different group IDs, each with one active member and one message.
The native key had decoded percent escapes while the web key retained them.
Both local client configurations point to the same production project, and both observed rooms exist there.
The shared API calls the same `join_qr_group` RPC; its production implementation maps each case-sensitive code key to its unique QR record and room.
No database normalization or room merge was applied.

Four new tests reproduced the native error before the fix on both iOS and Android branches.
They exercise scan, join, rejoin, Groups room navigation, and first-party handoff links with the installed Expo href serializer, query parser, and route hooks.
Expo Router 57's `useLocalSearchParams` decoded already-parsed query values a second time.
The native join and room screens now use `useRoomParams`, which reads the public `useRoute` parameters without another decoding pass.
The test harness now provides both real route contexts and uses the installed parameter hooks instead of returning parameters directly from a mock.
Tests compare the actual shared API RPC argument against the web resolver for the reported QR, nested percent escapes, case, Unicode, and reserved characters.

The read-only production checks also confirmed the four expected Realtime publication tables, active logical replication slots, authenticated subscriptions for the web room at inspection time, and membership-based message authorization policies.
There was no active subscription for the native room at that moment; this can happen while iOS has the native app in the background and does not identify the cause of the screenshot's reconnecting state.
No live two-client message exchange was performed, and persistent native connectivity remains unverified.
The existing shared Realtime recovery tests passed; no speculative transport or authorization change was made.
The relevant protocol distinguishes channel joining from PostgreSQL readiness; see [Supabase Realtime protocol](https://supabase.com/docs/guides/realtime/protocol).

Commands and results:

- `node --test apps/mobile/tests/qr-navigation.test.mjs`: initially failed all four cases with the reported decoding mismatch, then passed after the fix.
- `pnpm test`: passed all 55 tests, zero failures; domain 2, API 14, mobile 36, web 3.
- `pnpm lint`: passed both applications.
- `pnpm typecheck`: passed all six workspace packages.
- `CI=1 EXPO_OFFLINE=1 pnpm --filter mobile exec expo export --platform ios --platform android --output-dir /tmp/qr-chat-native-room-export`: passed both bundles.
- `git diff --check`: passed.

Files changed in this follow-up: native `join.tsx` and `room.tsx`, new `src/hooks/use-room-params.ts`, new `tests/qr-navigation.test.mjs`, `tests/support/native-harness.mjs`, `README.md`, and this report.
No files were removed, and no dependency installation or native regeneration was needed.
The web source and shared API were unchanged; their production build and native binary compilation were not repeated for this JavaScript-only fix.
Tests use local fakes for backend calls; production-writing integration/E2E require separate approval and disposable accounts and were not run.
Supabase operations were limited to read-only project metadata, QR/group counts, RPC definitions, publication/replication/subscription metadata, and authorization policies; private message bodies and tokens were not retrieved.
No production data, schema, provider setting, commit, push, deployment, or app-store submission was changed.

Manual verification: reload the debug app from Metro, or rebuild the installed Release app, then scan the original QR with two accounts and confirm both clients show two members.
Send one message each way, verify receipt without a refresh while both clients are open, and then background/resume native to check missed-message recovery.
The original wrongly decoded room is not merged into the web room; rescanning follows the existing membership-switch lifecycle.
On one iPhone, check receipt after returning from Safari to native because backgrounding deliberately stops native subscriptions.

## Live Cross-client Verification - 2026-09-19

The user explicitly authorized Computer Use, production-backed messaging tests, and a disposable test account.
After finding no installed signed-in app on iPhone 16, the user requested the already signed-in iPhone 18 Pro.
Only iPhone 18 Pro remained booted for the test.
The existing native binary loaded the local JavaScript changes through Metro; no dependency installation, native regeneration, or rebuild was needed.

The simulator and the directly hosted web session were both signed in as Andy, so they could not prove two-user delivery.
A disposable `testacc1` email identity was created through the production Supabase MCP, then signed in using the ordinary public password grant.
A temporary server bound only to `127.0.0.1:3401` supplied its SSR session cookies and served the unchanged build from `https://qr-chat-web.vercel.app`.
The browser still used the hosted bundle's normal authenticated Supabase API and RLS for chat operations.
This verifies the hosted web build through a local test gateway, not a new Google login on the production origin.
No production authentication route, provider setting, authorization policy, or schema was changed.

Observed UI results:

- Web `testacc1` and native Andy joined the same existing room using the exact percent-encoded QR value from the user's screenshot.
- Native manual QR entry preserved the encoded value through the join screen and RPC.
- Both clients displayed two members in group `480ef712-55ef-47aa-98ab-b3d209a68500`.
- A web message appeared in the native conversation without a manual refresh.
- A native reply appeared in the web conversation without a manual refresh.
- A message sent while native was explicitly stopped appeared after restarting and opening the room.
- The native room did not remain in the reconnecting state during these checks.
- Leaving and rejoining preserved the original room history while the disposable member remained present.
- The final external QR deep-link check displayed exactly one join sheet with the original encoded code.

The simulator Home-button attempt did not provide reliable evidence of suspension, so background/resume is not claimed as separately verified.
Physical camera scanning, a physical iPhone, Android device behavior, and a second Google-provider login were not exercised.
The native message's `qrchat` prefix was changed to `WeChat` by keyboard autocorrection; the unique test suffix remained intact and cleanup used its exact stored body.

Two additional native defects were reproduced and fixed during this run.
Leaving a room crashed the React-compiled screen because a callback's non-null assertion caused unsafe dependency accesses when the group disappeared.
The send callback now validates that the API and group are present; new tests run the room through the installed React compiler and cover empty, active, and ended membership on both platform branches.
Both compiler regression cases failed before the fix and passed afterward.
Incoming QR links also stacked the app's validated join screen above Expo's own destination; the pending-link handler now replaces that destination.
A regression test verifies that the encoded code is consumed once without pushing another join sheet.

The native Supabase adapter now uses the SDK's default auth coordination instead of the deprecated `processLock` option, following the [Supabase migration guide](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/migrations/lockless-coordination.md).
The prior warning banner had obscured native controls; it no longer appeared after the change and restart.
The ignored native `.env.local` now sets `EXPO_PUBLIC_WEB_ORIGIN=https://qr-chat-web.vercel.app` instead of the old LAN web origin so hosted QR handoff links use the configured first-party origin.

Production data operations and cleanup:

- Created one disposable auth user and email identity through Supabase MCP.
- Created its profile and membership through the actual web UI and shared API.
- Sent four uniquely marked messages through the two client UIs; read-only MCP verification confirmed two distinct senders in one room.
- Exercised Andy's leave/rejoin workflow, which renewed that membership's normal 24-hour lifetime.
- Signed out `testacc1` through the web UI, removed exactly four test messages through MCP, and deleted only the disposable auth account through MCP.
- Verified zero remaining fixture accounts, identities, sessions, refresh tokens, profiles, memberships, or marked messages.
- Verified Andy's membership and the one original message still exist in the original room; native UI returned to one member and the original history.
- Closed the test browser tab, restored the viewport, stopped the local gateway and Metro processes, and deleted the temporary account credentials and gateway script.

Checks after the final code changes:

- `pnpm test`: passed all 58 tests, zero failures; domain 2, API 14, mobile 39, web 3.
- `pnpm lint`: passed both applications.
- `pnpm typecheck`: passed all six workspace packages.
- `CI=1 EXPO_OFFLINE=1 pnpm --filter mobile exec expo export --platform ios --platform android --output-dir /tmp/qr-chat-cross-client-export`: passed both bundles.
- `git diff --check`: passed.

Changed in this live verification follow-up: `src/lib/supabase.ts`, `src/app/(app)/room.tsx`, `src/app/(app)/_layout.tsx`, `tests/support/native-harness.mjs`, `tests/auth-lifecycle.test.mjs`, new `tests/room-lifecycle.test.mjs`, this report, and ignored `.env.local`.
No repository files were removed.
The web production build and native binary compilation were not repeated because no web source, native dependency, or generated native project changed.
The established broad API integration and browser E2E suites were not run; this was the explicitly authorized, targeted live two-client test.
No commit, push, deployment, app-store submission, schema change, or unauthorized production operation occurred.
Automatic approval review rejected the unpinned `serve-sim@latest` helper before execution; it was not installed or run, and existing simulator tooling was used instead.

Remaining manual check: load these JavaScript changes on the physical iPhone, scan the same physical QR in native and hosted mobile web with two accounts, then verify delivery after switching between Safari and native.

## Changed Files

Modified for this task:

- `README.md`: current native status.
- `apps/mobile/AGENTS.md` and `apps/mobile/README.md`: native implementation, commands, setup, and verification boundaries.
- `apps/mobile/app.json`, `apps/mobile/package.json`, `apps/mobile/tsconfig.json`: app identity, permissions, approved modules, native commands, and shared TypeScript imports.
- `apps/mobile/src/app/_layout.tsx` and `apps/mobile/src/components/app-tabs.tsx`: protected navigation and platform tabs.
- `apps/web/package.json`, `apps/web/src/hooks/use-chat-backend.ts`, `apps/web/src/lib/chat-view.ts`, and `apps/web/src/components/mobile-chat.tsx`: shared package use without a web redesign.
- `packages/api/package.json` and `packages/api/src/index.ts`: shared snapshot exports and domain dependency.
- `packages/domain/package.json` and `packages/domain/src/index.ts`: shared display contracts, QR interpretation, age formatting, and tests.
- `pnpm-lock.yaml`: generated by pnpm.

Added:

- `apps/mobile/.env.example` and an ignored `apps/mobile/.env.local` using only existing public connection settings, with providers disabled.
- `apps/mobile/src/app/(app)/_layout.tsx` and `(tabs)/_layout.tsx`.
- Native tab screens: `(tabs)/index.tsx`, `(tabs)/chats.tsx`, and `(tabs)/profile.tsx`.
- Native flow screens under `(app)`: `scan.tsx`, `join.tsx`, `room.tsx`, `members.tsx`, `direct/[id].tsx`, `edit-profile.tsx`, and `settings.tsx`.
- Authentication routes: `apps/mobile/src/app/sign-in.tsx` and `apps/mobile/src/app/auth/callback.tsx`.
- Native components: `apps/mobile/src/components/chat-ui.tsx` and `conversation.tsx`.
- Native state: `apps/mobile/src/providers/auth-provider.tsx`, `chat-provider.tsx`, and `apps/mobile/src/hooks/use-direct-messages.ts`.
- Native adapters: `apps/mobile/src/lib/secure-storage.ts`, `auth-callback.ts`, `oauth.ts`, and `supabase.ts`.
- `apps/mobile/tests/auth.test.mjs`, `packages/api/tests/snapshot.test.mjs`, and `packages/domain/tests/domain.test.mjs`.
- `apps/mobile/tests/auth-lifecycle.test.mjs`, `screens.test.mjs`, and `tests/support/native-harness.mjs`.
- `apps/mobile/src/lib/room-route.ts` and `qr-link.ts`: stable conversation destinations and safe QR handoff links.
- `apps/mobile/assets/splashscreen.xml`: transparent Android splash drawable required by the Expo splash plugin when using a plain background.
- `packages/api/src/snapshot.ts` and this report.

Removed:

- `apps/mobile/src/app/index.tsx` and `explore.tsx`: starter routes replaced by QR Chat routes.
- `apps/mobile/src/components/app-tabs.web.tsx`: starter Expo-web navigation; Next.js remains the web client.

Pre-existing unrelated working-tree changes were preserved.

## Remaining Verification

Native provider callback configuration is not verified.
Google and Apple stay hidden until configured through the documented checkpoint in `README.md`.
The provisional application identifiers and development launcher assets need confirmation before distribution.
The iOS Simulator and Android debug targets compile successfully, but camera scanning, native OAuth, and device interaction have not been verified.
The simulator binary was rebuilt with standard ad-hoc signing for the launch check; physical-device and distribution signing remain separate checkpoints.
Production-backed integration/browser E2E suites were not run because they require separate approval and dedicated disposable credentials.
Manual iOS/Android verification belongs to the user under repository instructions.
Use the manual checklist in `README.md` for sign-in, camera permissions, navigation, cross-client chat/friendship behavior, keyboard handling, accessibility, and reconnect recovery.

The QR identity follow-up performed the read-only production inspections listed above; no Supabase mutation was performed.
No commit, push, pull request, deployment, provider change, or app-store submission was performed.
