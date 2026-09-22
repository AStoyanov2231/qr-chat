# QR Chat Native

The Expo client implements the current mobile-web product flow on iOS and Android: sign-in, QR scanning or manual entry, a single temporary group, group messages, profiles, friendship requests, and direct messages.
The visual direction follows the web client and `../../Design1.png`.
Native tabs adopt Liquid Glass on supported iOS versions and Material navigation on Android, with system navigation on older iOS versions.
The current light palette matches web; native dark mode is not introduced independently.

## Local Setup

Run commands from the repository root.

```sh
pnpm install
cp apps/mobile/.env.example apps/mobile/.env.local
pnpm --filter mobile start
```

Set the public Supabase URL and publishable key to the same project used by web.
Set `EXPO_PUBLIC_WEB_ORIGIN` to the exact web origin, without a trailing slash, so a web QR handoff and its raw code join the same room.
Other URLs remain opaque QR values, and keys remain case-sensitive.
The Expo client targets iOS and Android; `apps/web` remains the web client.

Expo Go can open the app, but the custom OAuth callback requires a native app build.
Google and Apple buttons are hidden by default.
The sign-in screen explains when it is opened in Expo Go rather than a native build.

## Native Sign-in Checkpoint

1. In the same Supabase project as web, open Authentication, then URL Configuration.
2. Under Redirect URLs, add the exact value `qrchat://auth/callback` and save it, retaining the existing web URLs and Site URL.
3. Open Authentication, then Sign In / Providers, and confirm the desired Google or Apple provider is enabled and configured.
4. In `apps/mobile/.env.local`, set `EXPO_PUBLIC_ENABLE_GOOGLE_AUTH=true` for the first local Google test.
5. Build the native app using the commands below, restart Metro after changing environment variables, and test login, cancellation, relaunch, and sign-out on both platforms.
6. Enable Apple locally only after its provider is configured, then repeat the same tests before enabling it in a distributed build.

These are project-owner setup steps; an agent must use the approved production workflow before making hosted changes.
The custom scheme is already declared in `app.json`.
The Supabase redirect allowlist is separate from the OAuth provider callback, which remains the HTTPS Supabase callback configured for web.
See [Supabase's native linking guide](https://supabase.com/docs/guides/auth/native-mobile-deep-linking) for the scheme and redirect configuration.

The client uses the provider's hosted sign-in page through the system authentication browser, with PKCE S256 and a code exchange back into the app.
Provider secrets stay on the provider/Supabase side.
No provider dashboard, redirect allowlist, or database change is performed by installing these source files.

The provisional local bundle identifier and Android application ID are both `com.qrchat.mobile`.
Confirm ownership and the final identifiers before distribution or app-store registration.
Local compilation uses the existing Expo native generation workflow and requires the platform toolchains:

```sh
pnpm --filter mobile build:ios
pnpm --filter mobile build:android
```

These commands generate native projects through Expo; do not hand-edit generated native folders.
`pnpm --filter mobile ios` and `pnpm --filter mobile android` also build and launch the platform target using Expo's generated-project defaults.
Use `pnpm --filter mobile start` for subsequent Metro sessions without rebuilding.

Xcode 27 requires UIKit's scene lifecycle.
The pinned Expo `57.0.23` patch and `expo-build-properties` plugin enable it through `ios.enableSceneSupport` in `app.json`.
If an existing iOS build reports `UIScene life cycle is required`, stop Metro and regenerate the native project before rebuilding:

```sh
pnpm --filter mobile exec expo prebuild --platform ios
pnpm --filter mobile ios
```

Keep scene support enabled while this project uses SDK 57.
See [Expo's SDK 57 scene migration guide](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27).

No EAS, TestFlight, or Google Play workflow is configured.
Launcher assets are still development assets and need release branding before store submission.
Do not run `scripts/reset-project.js`.

## Test on Your iPhone

Local installation uses Xcode development signing; EAS and TestFlight are not required.
Connect your iPhone to the Mac with a cable, unlock it, and accept Trust This Computer.
Add your Apple Account in Xcode Settings, then Apple Accounts, and ensure a development signing certificate is available.
Enable Settings, then Privacy & Security, then Developer Mode on the iPhone, restarting and confirming when prompted.
See [Expo's signing setup](https://expo.fyi/setup-xcode-signing) and [Developer Mode instructions](https://docs.expo.dev/guides/ios-developer-mode/) if either step is missing.

Before building, complete the native sign-in checkpoint above and use the same public Supabase project settings as the hosted web client.
Keep `EXPO_PUBLIC_WEB_ORIGIN` set to the hosted web origin.
Never copy a service-role or secret key into the native environment.

For an installed copy that can run without the Mac or Metro, run from the repository root:

```sh
pnpm --filter mobile exec expo run:ios --device --configuration Release
```

Select your physical iPhone and your development signing team when prompted.
The local release configuration bundles JavaScript into the app and connects directly to Supabase over the phone's internet connection.
It is still a locally signed test installation, not an App Store submission.
Source and environment changes require rebuilding this installed copy.
If iOS asks you to trust the developer, follow its prompt under Settings, then General, then VPN & Device Management.
A free Apple Personal Team can test on a personal device, but its provisioning expires after seven days and requires rebuilding and reinstalling; see [Apple's account limits](https://developer.apple.com/help/account/basics/about-your-developer-account).

For frequent UI edits instead, install a debug copy once:

```sh
pnpm --filter mobile exec expo run:ios --device
```

Keep the Mac and iPhone on the same Wi-Fi and allow Local Network access if prompted.
For later debug sessions, start Metro with `pnpm --filter mobile start --lan` and open the installed QR Chat app.
Use LAN for a real phone; `--localhost` is appropriate for the simulator on the Mac.
JavaScript and styling edits reload without reinstalling packages or rebuilding the debug app.
Rebuild when native dependencies or native configuration change.
Run `pnpm install` for initial setup or dependency changes, not for every test session.

Open the hosted site in Safari on the iPhone to compare Home, Groups, and Profile against the installed native app.
Use the same account to compare its profile and current group across clients.
Use two accounts joined to the same QR code when testing messages and friendships between distinct participants.
Check the Home tip above the tab bar, the Groups empty state, scrolling with larger text, and long friend lists.

To verify cross-client chat, keep both clients open on separate devices, scan the same QR, confirm both show two members, and send a message in each direction without refreshing.
For a quick camera-independent check, enter the exact value `QRChat-Test-1` in both clients.
The Metro QR opens the development app; use a stable venue/test QR for repeatable chat tests.
QR values containing percent escapes must remain unchanged: `Room%2FA` and `Room/A` are different room keys.
After updating an older native build affected by double decoding, rescan the original QR to join the web room; existing rooms are not merged.
On a single iPhone, switching between Safari and the native app backgrounds one client, so confirm messages appear when returning to it rather than expecting both to stay connected simultaneously.

## Architecture

- `@qr-chat/domain` owns shared QR interpretation, display contracts, and message-age rules.
- `@qr-chat/api` owns authorized snapshot loading, cursor pagination, Supabase operations, and filtered Realtime reconciliation.
- `@qr-chat/validation` validates untrusted input; `@qr-chat/types` supplies database contracts.
- `src/providers` owns native auth state, refresh lifecycle, and screen state.
- `src/lib` owns secure session storage and exact OAuth callback validation.
- `src/components` and `src/app` own React Native presentation and navigation.

Sessions and PKCE verifiers use device-secure storage, including chunking for large Unicode session values.
Session replacement is serialized and publishes the new manifest only after its chunks are written.
Sign-out unmounts protected screens and discards their in-memory chat state.
Backgrounding stops automatic token refresh and active Realtime subscriptions; foregrounding reconciles with Supabase.
An incoming `qrchat://join?code=...` destination is validated and retained in memory through sign-in.
Universal/App Links for opening HTTPS web URLs directly in the installed app are not configured.
Scanning a first-party HTTPS QR link inside the app still resolves the same code as web.
Database authorization and existing transactional RPCs remain authoritative.
No client cache or navigation guard replaces RLS.

The camera only mounts on its focused, foreground screen.
Scanning requests camera access only; microphone recording permissions are disabled.
Messages use a virtualized list, cursor pagination, and native keyboard avoidance.
An open room stays tied to its group ID; an external membership switch cannot retarget its messages or composer.
Expired rooms expose the same rejoin flow as web, and direct-message pagination survives background/foreground.
Loading placeholders follow the screen layout without continuous motion.
Unsupported reference concepts stay explanatory placeholders, with no fabricated venue, notification, or lifetime-statistics data.

## Automated Verification

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm --filter mobile exec expo export --platform ios --platform android --output-dir /tmp/qr-chat-native-export
pnpm --filter web exec next build --webpack
git diff --check
```

Expo generates typed routes during development.
If existing `.expo` route declarations are stale after changing routes, start Expo once to regenerate them before type checking.
Do not edit generated declarations manually.

The unit tests cover shared snapshot reconciliation and authorization failures, QR interpretation, PKCE callback validation, secure-storage failure/concurrency behavior, and native auth lifecycle.
Screen-flow tests exercise scan/join/rejoin, profile saves, friendship actions, revoked access, failed sends, and resume pagination using mocked platform controls on both platform branches.
QR navigation tests use the installed Expo href serializer, query parser, and route hooks to verify that native sends the same opaque key to the shared API as web.
They use the Node test runner, the existing TypeScript compiler to load TSX, and the dev-only `react-test-renderer` version matching native React.
The renderer emits its upstream deprecation notice; these tests do not claim native rendering, gesture, layout, or accessibility-engine coverage.
Bundle exports verify Metro and Hermes compilation; they do not prove native linking, camera access, OAuth configuration, or device behavior.
Production-backed integration and E2E suites require separate approval, disposable accounts, and verified cleanup.

## Manual iOS and Android Checklist

- Verify the Home, Groups, and Profile layouts against mobile web, including large text, VoiceOver/TalkBack, safe areas, native tabs, back gestures, and modal dismissal.
- Complete configured Google/Apple sign-in, cancel it, relaunch, and sign out; protected chats must disappear after sign-out.
- Scan and enter the same raw and web-link QR values; deny camera permission, recover through settings, and confirm the camera stops after leaving the screen or backgrounding.
- Open `qrchat://join?code=...` while signed out, sign in, and confirm the original code is offered without automatically joining.
- Join, switch, and leave groups; send messages from web and native; load older messages; verify expiry/removal clears access and offers rejoin.
- Switch groups from web while a native room is open; the native screen must not show the new group's messages in the old room.
- Request, accept, decline, cancel, and remove friendships; exchange DMs between clients and verify removal clears the conversation.
- Test the keyboard, long messages, background/foreground, airplane-mode recovery, and failed sends without losing the draft or repeating a successfully sent message.
