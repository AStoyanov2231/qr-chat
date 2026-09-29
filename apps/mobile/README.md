# Native

Expo iOS/Android client with native tabs, stacks, camera, and keyboard handling. Shared [product](../web/PRODUCT.md), [architecture](../../ARCHITECTURE.md), [design](../../DESIGN.md).

## Setup

```sh
cp apps/mobile/.env.example apps/mobile/.env.local
pnpm --filter mobile start
```

Run from the root after `pnpm install`. Set public Supabase URL/key and the exact `EXPO_PUBLIC_WEB_ORIGIN` without a trailing slash. Google/Apple flags default to false.

## OAuth checkpoint

Owner setup (agents require approval): allow `qrchat://auth/callback` in Supabase, configure the provider, then enable its local flag and test login/cancel/relaunch/sign-out on both platforms. PKCE uses the system authentication browser; secrets stay hosted. Expo Go cannot use the custom callback. HTTPS Universal/App Links are unconfigured.

## Commands

| Need | Command |
| --- | --- |
| Metro | `pnpm --filter mobile start` |
| Build/launch | `pnpm --filter mobile ios` or `pnpm --filter mobile android` |
| Lint/types | `pnpm --filter mobile lint`, `pnpm --filter mobile typecheck` |
| Unit tests | `pnpm --filter mobile test`; full logic gate: `pnpm test` |
| Bundle check | `pnpm --filter mobile exec expo export --platform ios --platform android --output-dir /tmp/qr-chat-native-export` |
| iPhone Release install | `pnpm --filter mobile exec expo run:ios --device --configuration Release` |
| iPhone debug install | `pnpm --filter mobile exec expo run:ios --device` |
| Phone development session | `pnpm --filter mobile start --lan` |

Run only required commands. Physical install needs a trusted device, Developer Mode, Xcode account/team, and signing. Release bundles JS; debug needs Metro. Rebuild for native config/dependency changes or to update an installed Release copy.

## Native constraints

- `app.json` owns scheme/IDs/plugins. IDs are provisional; launcher assets are developmental. No EAS/store workflow.
- Xcode 27 / Expo 57 requires `ios.enableSceneSupport`; keep the configured scene support. Regenerate stale iOS projects with `pnpm --filter mobile exec expo prebuild --platform ios` when required.
- Expo owns generated projects/routes. Stale typed routes require an Expo start, not manual edits.
- Sessions/PKCE use secure storage; background stops refresh/subscriptions, foreground reconciles. Camera mounts only when focused/foreground.
- QR codes preserve percent escapes: `Room%2FA` differs from `Room/A`. Pending joins survive sign-in without automatically joining.

## Manual checks

- Home/Groups/Profile, native tabs/back/modal gestures, safe areas, large text, VoiceOver/TalkBack.
- Configured login/cancel/relaunch/sign-out; camera permission denial/recovery and background shutdown.
- With two accounts, join the same exact QR; send web/native both ways; test group switch/expiry, friendships/DMs, pagination.
- Keyboard, failed-send draft retention, airplane mode, background/resume. On one phone, verify delivery after returning to the backgrounded client.

Evidence: [VERIFICATION.md](VERIFICATION.md). Provider setup and physical-device behavior need live verification. Signing help: [Expo](https://expo.fyi/setup-xcode-signing); scene support: [SDK 57 guide](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27).
