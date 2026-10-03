# QR Chat release candidate

Status: **READY FOR REVIEW** — 2026-10-03 (Europe/Sofia). All in-scope acceptance checks passed and all 16 independent QA findings are resolved. Original iOS session restored; disposable backend accounts, data and private credentials cleaned up. Nothing was published or submitted to an app store.

## Review entry points

- [Local production landing](http://127.0.0.1:3000/welcome). The app opens on touch mobile browsers; desktop visitors receive the landing page.
- [Changed implementation and validation files](changed-files.txt), [web handoff](web.md), [native handoff](native.md), [independent QA report](qa.md).
- Android Release APK: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` (53,427,424 bytes). SHA256 `278b58b061cd28a40fc8d3911d76a593c00081d17b87cf42f3c42509faeee672`. [Artifact manifest](evidence/native-artifacts.json), [independent hash verification](evidence/native-artifacts-verified.json).
- Final iOS Simulator build is installed; both platforms also have successful production Hermes exports at `/private/tmp/qr-chat-native-export`. Metro remains available on loopback port 8081 for the installed iOS Debug app.

The [goal objective](/Users/andy/.codex/attachments/8e636b46-3255-4a04-80aa-f7d03fe2ea36/goal-objective.md) explicitly defers actual Google OAuth and physical-device validation. Native store distribution and public deployment are outside this delivery.

## What changed

Web and native now share a consistent system of typography, colors, spacing, icons and interaction states. Web profiles remain full pages; native profiles use system form sheets. Unsupported Saved Places, Notifications and Messages/Places statistics were removed. Privacy and Help remain useful, and Google is the only product sign-in provider. The responsive landing has a working web entry/QR and clearly unavailable, empty native download slots.

Shared API fixes keep profile names/avatars current in cached conversations, including delayed pagination responses; receive friendship deletion events for already-authorized connection IDs; and refresh membership at both local and visible peer expiry deadlines. Native fixes cover the React Compiler DM subscription, Android keyboard overlap, iOS status-bar configuration, avatar initials and long text. Web fixes cover camera permission classification, rapid scanner reopen, real Safari keyboard positioning, and preventing the initial QR link from replaying after reconnect or expired access. Native profile navigation dismisses the underlying search keyboard before presenting the sheet.

The existing shared API/domain/types/validation architecture and business rules remain: one active group, server-enforced 24-hour access, accepted-friend DMs, existing QR interpretation and local-device sign-out. Test accounts use normal public Supabase authentication through external tooling; no product authentication bypass was added. Pre-existing user deletions `SupabaseTrafic.png` and `design_assets/Design1.png` were preserved.

## Feature-by-client acceptance

Every PASS below has executed runtime evidence. Owner notes distinguish unit regressions, live API assertions and actual UI interactions.

| Acceptance | Mobile web | iOS Simulator | Android Emulator | Evidence |
|---|---|---|---|---|
| Google-only entry, protected routes, sign-out | PASS | PASS | PASS | Actual native sign-out and new-process cold launch; browser-local sign-out leaves native session usable |
| QR scan/join, naming, membership, Leave | PASS real optical decoder, switch/rescan | PASS Join/Leave UI and denial/recovery; optical capture deferred | PASS actual optical camera decode, denial/settings recovery, Leave/rejoin | [Scanner lifecycle](evidence/camera-lifecycle.json), [Android optical video](evidence/android-release-optical-scan.mp4), [iOS permission](evidence/ios-camera-permission.json) |
| Group messaging and pagination | PASS | PASS | PASS | All platform pairs; web57, iOS63 and Android59 unique rendered rows; [iOS exact ID/body verification](evidence/ios-pagination-validation.json), [Android pagination](evidence/android-group-pagination.json) |
| Requests, acceptance, decline/removal, DMs | PASS | PASS | PASS | All three friendship/DM pairs; native DM pagination iOS50→57 and Android50→61; removal purges access/cache |
| Search, profiles, avatars | PASS actual Safari/Android Chrome plus Chromium | PASS native picker/crop/save/remove | PASS native picker/crop/save/remove | Both native uploads independently fetched as512×512 JPEG; same-account profile/avatar convergence |
| Settings, Privacy, Help | PASS | PASS | PASS | Actual controls/dialogs inspected; unsupported content removed |
| Failed operations, reconnect, draft retention | PASS failed/slow transport and offline recovery | PASS real scoped transport refusal/retry | PASS airplane mode/reconnect | [iOS recovery](evidence/ios-native-transport-recovery.json), [Android lifecycle](evidence/android-native-lifecycle.json), [web results](evidence/web-acceptance.json) |
| Background/resume, keyboard, safe areas | PASS actual Safari/Android Chrome | PASS warm Home/resume and software keyboard | PASS Home/resume and software keyboard | Missed messages arrive exactly once; composer/profile controls remain visible |
| Own/peer expiry and retained friendships | PASS | PASS | PASS | Open private group history/composer clear without reload; accepted DMs remain usable; server reads/writes denied after expiry |
| Accessibility and visual consistency | PASS | PASS | PASS | Independent rendered comparison, touch targets, long-title truncation and native accessible labels |
| Required builds | PASS production Next build | PASS native build/install/run | PASS native Debug and final Release build/install/run | Both production Hermes exports also pass |

Actual web↔iOS, web↔Android and iOS↔Android group/DM messages were authored through their UIs and verified at recipients. Actual Safari/native and Android Chrome/native same-account sessions converged on profiles, membership and expiry. Browser sign-out preserved the corresponding native session, proven by a subsequent native UI message; native sign-out then remained signed out after cold launch.

Timed expiry was observed on all clients: web at `01:22:09.731903Z`, Android at `01:44:20.210702Z`, and iOS at `01:45:29.490107Z` on 2026-10-03. Foreground native screens cleared history and composer automatically; resumed mobile browsers did the same without reopening the scanner. Server probes independently confirmed zero accessible group messages, rejected sends and retained both accepted friendships/DM histories: [web](evidence/web-expiry-authorization.json), [Android](evidence/android-expiry-authorization.json), [iOS](evidence/ios-expiry-authorization.json).

## Verification results

| Check | Result | Evidence |
|---|---|---|
| `pnpm check` | PASS;193 tests plus typecheck, lint and package boundaries | [Integrated log](evidence/check.log); tooling12/domain7/API58/web35/native81 |
| `pnpm --filter web build` | PASS; final production server running | [Build log](evidence/web-build.log) |
| Both actual native builds | PASS; final Android Release also rebuilt from frozen source | [iOS build](evidence/ios-build.log), [Android build](evidence/android-build.log), [Android Release build](evidence/android-native-release-build.log) |
| Both production Hermes exports | PASS | [Export log](evidence/native-production-export.log) |
| Production browser acceptance | PASS;17 strengthened live checks, clean exit | [Results](evidence/web-acceptance.json), [log](evidence/web-live.log) |
| Live public-client API integration | PASS;12 checks, clean exit | [Log](evidence/live-api.log); profile/deletion convergence, avatar ownership and local sign-out isolation |
| Server authorization | PASS live rollback-only suite and both local SQL suites | [Live authorization](evidence/live-authorization.md), [local SQL](evidence/local-sql.log) |
| Responsive landing | PASS at1440/768/390/320; no overflow, QR decoded, unavailable slots empty, targets≥44px | [Results](evidence/landing-acceptance.json) |
| Independent review | PASS;16 reproduced findings fixed and retested; no open finding | [QA report](qa.md) |

The final web run measured decline convergence at307ms and peer/same-account leave at475ms. Rapid scanner close/reopen in8.2ms retained a live stream after the old300ms cleanup and decoded real QR pixels. Reconnect checks preserved drafts and counted receipts by exact message IDs. Historical test-harness resend duplicates are identified in QA notes and are not represented as product failures or clean unique-token evidence.

## Screenshots and recordings

| Flow | Web | iOS | Android |
|---|---|---|---|
| Conversation/keyboard | [Safari](evidence/ios-safari-group-keyboard.jpg) | [Native](evidence/ios-native-group-software-keyboard.jpg) | [Final header](evidence/android-release-header-final.png) |
| Profile | [Same account](evidence/web-profile-same-account.png) | [Native sheet/keyboard](evidence/ios-native-profile-software-keyboard.jpg) | [Saved native avatar](evidence/android-native-avatar-saved.png) |
| Access expired | [Browser](evidence/web-expired-group.png) | [Native](evidence/ios-native-own-expiry.jpg) | [Native](evidence/android-release-own-expiry.png) |
| Signed out | [Browser](evidence/web-signed-out.png) | [Cold launch](evidence/ios-native-signed-out-cold-launch.jpg) | [Cold launch](evidence/android-release-signout-cold-launch.png) |

Landing: [desktop1440](evidence/landing-1440.png), [mobile390](evidence/landing-390.png), [small320](evidence/landing-320.png). Android recordings: [actual optical scan](evidence/android-release-optical-scan.mp4), [automatic expiry](evidence/android-release-own-expiry.mp4). Historical before-fix evidence remains clearly identified in owner/QA notes.

## Supabase migration and cleanup

Applied and verified on project `zkgvdeluswvmwirhhufi`: [`20261003004032_profile_change_sync.sql`](../../supabase/migrations/20261003004032_profile_change_sync.sql). It adds `profiles` to the existing Realtime publication; it does not change grants or RLS. The filename matches live migration history. Realtime subscriptions use IDs from authorized snapshots, and events trigger authorized refetches. No additional migration was needed for friendship deletion or expiry scheduling.

Cleanup is complete. The original iOS session was restored and verified to match its preserved identity before deleting the private backup; no original-session screenshots were captured. All eight disposable sessions were revoked, the exact eight fixture QR codes and eight tagged test users were deleted through guarded cleanup, and verification found zero fixture users, profiles, memberships, friendships, avatar objects or QR codes. Private test credentials/session files were removed. [Sanitized cleanup evidence](evidence/cleanup.json).

Android's exact imported photo/device copies were removed and virtual camera wall/table images reset to defaults. Only the imported iOS QR photo was moved to Recently Deleted; all17 original Photos assets remain intact. The previous iOS camera permission and host keyboard settings were restored. Dedicated QA/browser/fixture processes were stopped. The production web server and Metro remain available for local review. [Android cleanup](evidence/android-fixture-cleanup.json), [iOS photo verification](evidence/ios-photo-fixture-cleanup.json).

## Explicit limitations

- Actual Google OAuth and physical-device validation remain deferred as requested. iOS Simulator has no optical camera; its Join UI and permission recovery passed, but its initial scan callback setup does not prove optical decoding. Android optical scanning was proven through actual camera pixels. iOS27 Simulator opens Settings root from Open settings; the physical app-specific destination remains part of physical-device validation.
- The installed Android Release runtime is clean. Android Debug has a documented upstream Expo Router pre-mount warning; it was traced to the dependency and was not suppressed. See [native notes](native.md).
- Generated native intermediates and task-generated prebuilt iOS dependency archives were removed to recover disk space after successful builds. Apps, APKs, exports, source and logs are preserved; a future full iOS rebuild needs normal pod installation first.

No in-scope work remains. For a new live test run, create new explicitly disposable fixtures; the completed run's credentials and backend fixtures no longer exist.
