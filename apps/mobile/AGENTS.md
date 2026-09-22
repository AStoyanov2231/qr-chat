# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Native Scope

Read the repository root `AGENTS.md` first.
The Expo application is an active implementation target for native iOS and Android.
It must maintain behavioral parity with mobile web while using platform-native UI components and navigation.
The current source implements the authenticated QR Chat flow.
Native OAuth configuration and manual device verification are separate checkpoints; never equate passing bundle exports with verified provider login.

Use `Design1.png` at the repository root as the only visual source of truth.
Treat its unsupported Nearby, history, saved-place, notification, username, venue-media, and lifetime-statistics content as future concepts rather than implemented data.

## Architecture

Use `@qr-chat/api` for Supabase operations, `@qr-chat/domain` for pure product logic, `@qr-chat/validation` for input validation, and `@qr-chat/types` for shared contracts.
Connect directly to Supabase with a publishable key.
Do not proxy ordinary chat data through the Vercel web application.

Native code owns platform authentication lifecycle, secure session storage, OAuth deep links, navigation, camera permission handling, foreground and background refresh, and native presentation.
Store sessions in platform-secure storage.
Never place tokens in ordinary AsyncStorage, source files, logs, or public documentation.
Use native navigation components where they improve platform fidelity.
The shared `Screen` component bounds its scroll viewport with the native screen's safe area; keep `disableAutomaticContentInsets` on its native tab triggers so navigation insets are applied once.

Do not hand-edit generated `ios/` or `android/` directories.
Do not run `scripts/reset-project.js`.

## Native Commands

Run these from the repository root:

- Start Expo: `pnpm --filter mobile start`
- Build and launch iOS locally when requested: `pnpm --filter mobile ios`
- Build and launch Android locally when requested: `pnpm --filter mobile android`
- Lint: `pnpm --filter mobile lint`
- Type check: `pnpm --filter mobile typecheck`
- Unit tests: `pnpm --filter mobile test`
- Local native compilation when requested: `pnpm --filter mobile build:ios` or `pnpm --filter mobile build:android`

EAS, TestFlight, and Google Play are future distribution targets.
Do not add or run deployment commands without explicit approval and committed configuration.
Do not spawn computer-use agents or perform manual simulator or device verification.
Provide the user with a concise iOS and Android manual test checklist.
