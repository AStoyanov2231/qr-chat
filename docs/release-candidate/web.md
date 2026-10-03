# Web release candidate

Owner: web/landing engineer. Updated 2026-10-03.

## Visual contract

- Paper/surface `#fdfdfe`, ink `#0d1114`, secondary text `#626a78`, borders `#eeeff2`, soft fill `#f3f4f6`, group blue `#e9eff8`, access green `#29bc68`, scan/action navy `#142b40`.
- System typography throughout; large clear page titles, readable message text, circular avatars, rounded group cards and controls. Interactive controls are at least 44px. Form inputs use 16px type to avoid unwanted iOS zoom.
- Web profile remains a full page. Member/settings/edit actions use native HTML dialogs with focus management. Native clients intentionally use profile sheets.

## Implemented

- Public responsive `/welcome`; desktop interaction gate renders this same landing on all product routes. Mobile uses `(hover: none) and (pointer: coarse)`, so narrowing a desktop window does not reveal the app and phone landscape is supported. Mobile `/` remains the authenticated chat entry and `/sign-in` links back to the public landing.
- Landing features browser, iOS, and Android. Browser entry links to `/sign-in`; a locally generated QR encodes that same origin's sign-in URL. iOS/Android download slots are empty and explicitly unavailable. The pictured conversation is labeled as an example.
- Product sign-in is Google only. Removed optional Apple button/provider branch. Rejected OAuth startup promises now show a recoverable inline error.
- Removed Saved Places, Notifications, Messages/Places placeholder statistics. Current group is presented truthfully; privacy and help remain.
- Restored browser zoom; refined touch targets, secondary text contrast, system typography, and form size.
- Conversation composer participates in layout, preventing multiline failure notices from hiding messages. The app tracks the visual viewport's unzoomed height and vertical offset for on-screen keyboards. Join/edit dialogs scroll on small screens.
- Explicit offline/reconnection status complements the shared store's private-data clearing policy.
- Group send failures retain the draft and show an inline error. A completion from a previously opened conversation cannot clear the new conversation's draft. Sent-but-refresh-failed feedback distinguishes send completion from refresh failure.
- Join failures are shown inside the dialog, where users can see them. Join fields and close/scan controls are disabled during a pending join.
- Existing QR interpretation, server authorization/expiry, one-group rule, friend-gated messages, and client API architecture remain in use. No authentication bypass introduced.

## Checks

| Check | Status | Evidence |
| --- | --- | --- |
| `pnpm --filter web test` | PASS | 35 tests, including public landing/session boundary and unsupported profile/native-slot output contracts, and public landing exclusion from the development preview frame, and permission-aware camera error mapping and friendly transport-error messaging. |
| `pnpm --filter web typecheck` | PASS | Route generation and `tsc --noEmit`, exit 0. |
| `pnpm --filter web lint` | PASS | Latest run exit 0 with no warnings. |
| Default production build | PASS | Root ran full `pnpm check` and the default production build after the scanner lifecycle and shared deletion fixes; the latest production server was restarted. |
| Live browser journeys | PASS | QA final expanded production suite exited 0 with 17 live behavioral checks, including group draft preservation across offline→online without replaying the QR query. Camera denial/retry, compact header measurements, friendly transport feedback, deletion convergence, and fast scanner reopen pass. Chrome and `tests/backend.e2e.mjs` remain QA-owned. |
| Public desktop/mobile screenshots | PASS | QA captured `/welcome` at 1440, 768, 390, 320px and mobile sign-in. No overflow/runtime errors; all targets >=44px; QR decoded to the correct origin/sign-in URL. Web engineer visually inspected 1440, 390, and sign-in. |
| Authenticated app screenshots and keyboard states | PASS | Authenticated Chromium states inspected. Real iOS simulator Safari keyboard/composer, full-page profile edit, reload persistence and cross-client messages verified; Safari viewport offset defect reproduced and fixed. Native software-keyboard group/profile screenshots also captured. Physical hardware remains separate. |
| Narrow desktop / landscape mobile interaction gate | PASS | QA verified narrow desktop mouse viewport remains on the landing and landscape coarse-pointer phone viewport enters the app. |
| Actual Android Chrome resume after native Leave and expiry | PASS | QA repeated the exact fixed flow without reload/navigation: group cleared, no scanner, zero group cards and two retained friends. Its timed-expiry no-scanner check also passed. `android-chrome-native-leave-fixed.json/png` and Android expiry evidence. |
| Actual iOS Safari expiry and local sign-out isolation | PASS | Warm resume cleared expired group history/composer without scanner replay; two friends remained, post-expiry DM delivered once. Safari UI sign-out left native authenticated, proven by a later native DM received once in web. |
| Google OAuth | DEFERRED | Explicitly excluded from this goal's live acceptance. Product button remains Google only. |
| Physical-device browsers | DEFERRED | Must be distinguished from Chromium mobile emulation and native emulator evidence. |

## Changed paths

- `apps/web/src/components/landing-page.tsx` (new)
- `apps/web/src/app/welcome/page.tsx` (new)
- `apps/web/src/components/mobile-only.tsx`
- `apps/web/src/components/mobile-chat.tsx`
- `apps/web/src/components/group-sidebar.tsx`
- `apps/web/src/components/profile-view.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/sign-in/{page,oauth-button}.tsx`
- `apps/web/src/proxy.ts`
- `apps/web/tests/{proxy,chats-overview,mobile-only}.test.mjs`
- `apps/web/src/lib/camera-error.ts` (new), `apps/web/tests/camera-error.test.mjs` (new)
- `apps/web/src/hooks/use-chat-backend.tsx`, `apps/web/tests/networking.test.mjs`
- `scripts/release-mobile-browser.mjs` (disposable session installer; no production bypass)

## Pending review and exact next actions

1. Root restores the preserved original iOS session and completes disposable backend fixture cleanup; simulator UI testing is finished and no more screenshots will be taken after handoff.
2. Root integrates final evidence and signs off cross-client acceptance. Web checks and all assigned browser/native runtime checks have passed. Unit/build results remain distinct from live runtime acceptance.

The pre-existing deletions of `SupabaseTrafic.png` and `design_assets/Design1.png` were preserved.


## Rendered evidence and resolved findings

The sections below preserve the verification sequence; the current checks and handoff above supersede historical pending steps.

- `/private/tmp/qr-chat-release-evidence/landing-1440.png`
- `/private/tmp/qr-chat-release-evidence/landing-768.png`
- `/private/tmp/qr-chat-release-evidence/landing-390.png`
- `/private/tmp/qr-chat-release-evidence/landing-320.png`
- `/private/tmp/qr-chat-release-evidence/web-sign-in-mobile.png`

QA initially reproduced `/welcome` being constrained inside the local 430px development preview frame. Fixed by exempting the public route before the preview branch; added a behavior test. Refreshed screenshots show the correctly responsive page. These public screenshots are real browser renders, not evidence of authenticated live-backend acceptance.


## Live QA fixes — scanner

QA reproduced two P2 defects using a real full Chromium browser camera flow (a padded QR frame successfully decoded when granted):

1. With camera permission `denied`, qr-scanner 1.4.2 replaced the original `NotAllowedError` with `Camera not found.`. The UI incorrectly reported a missing camera. `src/lib/camera-error.ts` now checks the real browser Permissions API. Denied permission takes priority; unsupported permission queries return safe camera/retry guidance without making an unsupported missing-device claim. Known missing-device errors retain their specific message. The scanner ignores asynchronous permission results after disposal.
2. The later `.camera-panel .modal-close` rule overrode white with dark ink, making the close X invisible against the camera background. Removed that color override; the existing white declaration now applies.

Before-fix rendered evidence inspected: `/private/tmp/qr-chat-release-evidence/failure-0.png`. Focused regressions cover denied/granted/prompt/unsupported permission states, explicit missing-device errors, and device-busy errors. `pnpm --filter web test` 34/34, typecheck, lint, and `git diff --check` all pass. Root rebuild/restart and QA runtime retest are the next required actions. New files: `apps/web/src/lib/camera-error.ts`, `apps/web/tests/camera-error.test.mjs`.


## Live QA fixes — short viewport and network feedback

- Camera denial, permission-grant retry, and visible white Close X now pass live QA. Inspected `/private/tmp/qr-chat-release-evidence/web-camera-denied.png`.
- QA reported all 13 main live-browser assertions passing, including group-message pagination through 57 messages. Final screenshot regressions still require their rerun after the latest production build.
- Inspected `/private/tmp/qr-chat-release-evidence/web-group-short-viewport.png` at 390x430: compact header allocated only 31px for the 45px title/subtitle, clipping title glyphs. Changed the compact title top inset from 67px to 52px, preserving the 124px header while allocating 46px; prevented title flex shrink. Both lines now have space above the conversation surface. Await fresh rendered evidence.
- Failed sends already retained the draft and showed inline retry guidance, but the supplementary toast displayed the raw Supabase transport error. Web `errorMessage()` now normalizes Chromium `Failed to fetch`, Safari `Load failed`, and Firefox `NetworkError` variants to connection/retry guidance, while preserving actionable API and validation messages. Added a regression in `tests/networking.test.mjs`.
- After these changes: `pnpm --filter web test` 35/35; typecheck, lint, and `git diff --check` pass. Root rebuild/restart, then QA verifies full title height, subtitle above the chat surface, and no raw `TypeError` in the failed-send toast.

## Final review and scanner reopen race

Final read-only review covered mobile viewport/keyboard layout, SSR device/auth routing, profile/avatar preparation and save errors, scanner cancellation, and rendered chat/profile/landing evidence. QA's refreshed 390x430 screenshot now shows the complete header title and subtitle; measured assertions confirm title height is at least one line and subtitle remains above the chat surface. The group failed-send screenshot now shows friendly transport guidance. Requested a fresh group-settings screenshot after its slide animation settles, since the earlier capture only showed the moving panel edge.

One additional concrete cancellation race was reproduced with the actual installed QrScanner lifecycle: `destroy()` defers stopping its video's media stream for 300ms. The closed dialog kept that same video DOM node mounted, so reopening within 300ms let the new scanner reuse the old stream; delayed cleanup then cleared `srcObject` while the new scanner remained active. Reproduction output transitioned from `{active:true, stream:true, track:live}` to `{active:true, stream:false, track:ended}` after 350ms.

Minimal fix: increment the existing camera attempt counter when opening the scanner and key the video by that counter. New opens and permission retries receive a fresh video DOM node; delayed cleanup can only stop the detached old node. Existing camera-to-join transitions already unmount the video. All 35 tests, typecheck, lint, and diff checks pass. QA owns a focused live regression for fast close/reopen, distinct video nodes, live tracks beyond cleanup, and subsequent real QR decoding. Production rebuild/retest is required for this final two-line change.

No additional concrete web defects identified in the requested review. Actual iOS Safari visualViewport/keyboard/toolbar offsets, edit-dialog keyboard visibility, and OS photo-picker resume remain runtime-specific checks; Chromium viewport reduction alone is not evidence for those behaviors.

## Final scanner runtime verification

QA exercised the rebuilt app in full Chromium with an actual camera fixture (blank frames followed by a QR, without a decoder stub). Close to reopen was 7.7ms; the reopened scanner had a distinct video node and live media stream after 650ms, beyond the old scanner cleanup window. The real QR then decoded successfully. Evidence: `/private/tmp/qr-chat-release-evidence/web-camera-reopened.png`, `web-camera-reopened-decoded.png`, and `camera-lifecycle.json`; harness: `scripts/release-camera-lifecycle.mjs` (QA-owned).

## Actual iOS Safari session

The same disposable native test account was authenticated in real simulator Safari via the one-use local installer. The group view loaded with the existing native/web cross-client messages and fit above Safari's toolbar at rest. The Xcode semantic snapshot exposed browser chrome but not actionable web controls; a `type_text` call reported success without visible input or keyboard, so it is not counted as a passed interaction. The native rebuild then auto-launched, and simulator ownership was handed back for native validation. Safari session remains available; no Safari message/profile mutation, sign-out, or group leave occurred. CUA fallback was located in the macOS **Device Hub** app (`com.apple.dt.Devices`), which exposes the simulator screen for screenshot-grounded interactions; the next Safari window can complete keyboard/composer, full-page profile edit, and reload persistence checks.

QA final expanded suite exited 0 with 16 live behavioral checks. Independently inspected the refreshed fully opened group-settings panel (actual QR and members) and failed-DM screenshot (retained draft, inline retry guidance, friendly transport toast). Both replace the earlier incomplete captures in QA evidence. All reported web findings are verified resolved.

QA's long-title/switch coverage also confirmed 100-character group titles ellipsize correctly. Its one-member fixture exposed the minor copy `1 members` in the conversation header/sidebar. Both strings now use the same singular/plural rule as the existing chat list. Typecheck and lint pass after this two-string correction; parent owns the final production rebuild.

## Actual Safari keyboard defect and verified correction

Real iOS 27 simulator Safari exposed a focus-scroll defect that Chromium viewport emulation did not: opening the software keyboard moved the visual viewport vertically, but the fixed app followed only its height. The title and history scrolled above the visible area, leaving the composer at the top and a large blank area. `mobile-chat.tsx` now also tracks `visualViewport.offsetTop` on viewport resize/scroll; `.qr-app` uses that offset. Pinch zoom retains the existing scale guard, and both listeners/properties are removed on cleanup.

Typecheck, lint, and all 35 web tests pass. Root rebuilt/restarted production. Actual Safari direct field tap, typing, send, dismissal, and repeated focus now retain the complete header/history and composer above the real software keyboard. This runtime regression is preserved in `evidence/ios-safari-group-keyboard-before.jpg` and the corrected `evidence/ios-safari-group-keyboard.jpg`.

Actual Safari also saved the disposable account display name as `RC IOS Safari`, retained it after browser reload, and sent `iOS-safari-to-group-to-01` (autocorrected marker) and `Safari keyboard verified` to the live test group, clearing each acknowledged draft. The full-page profile and its editable name/Save button remain usable with the software keyboard. Evidence: `ios-safari-profile-edit-keyboard.jpg`, `ios-safari-profile-reloaded.jpg`. Native foreground subsequently displayed the same saved profile name in its profile sheet; native group UI also received both Safari messages. Native images are `ios-profile-safari-synced.jpg`, `ios-native-profile-software-keyboard.jpg`, and `ios-native-group-software-keyboard.jpg`.

Simulator input note: Xcode semantic typing/tapping sometimes returned success without a visible UI effect. Actual touch interaction used CUA's Device Hub app (`com.apple.dt.Devices`), with Capture Keyboard enabled and simulated hardware keyboard disabled to expose the real software keyboard. Those temporary host input settings must be restored at handoff. No authentication bypass or production credential was introduced.

Additional actual iOS native verification while holding the simulator: same-account profile name updated on foreground; 100-character group title fits two lines above subtitle; group pagination loaded 63 unique messages including all55 exact seeded IDs/bodies with null cursor; DM pagination loaded50→57 unique including all55 seeded IDs/bodies with null cursor. Exact rendered snapshots copied to `evidence/ios-group-pagination-rendered.json`, `ios-dm-pagination-before.json`, and `ios-dm-pagination-after.json`. Peer expiry showed2 members by01:22:21 UTC after the01:22:09.731903Z deadline, without app reload, while iOS retained its active group and composer (`ios-native-peer-expiry.jpg`).

Actual iOS native photo flow passed: cancel restored the editable form; reopen selected only the imported QR fixture; native crop and Save uploaded the photo; parent independently verified HTTP200 JPEG512×512 (48,233bytes) in `ios-native-avatar-upload.json`; Remove photo + Save restored default avatars. Only the imported QR photo was moved to Recently Deleted through Photos UI after verifying its original filename. Parent is verifying original17 assets remain intact. The system photo picker took roughly60–90seconds to render on its first launch; subsequent opening was immediate. No private gallery image was preserved in evidence.

Actual denied-camera state was set through simulator TCC, preserving its original grant. Native scanner then displayed permission guidance, Open settings, and Close (`ios-native-camera-denied.jpg`). Open settings launched system Settings root on two attempts on iOS27 simulator; an app-specific destination was not verified. Parent owns permission restoration. Optical scanning on real iOS hardware remains separate from this simulator permission check.

Evidence correction: Xcode `launch_app_sim` starts a new native process/navigation state in this environment. Safari→native profile persistence above is therefore verified after native relaunch, not counted as a warm background-resume test. A separate real Home/app-return test is required for that state.

Parent verified cleanup of only the imported iOS Photos fixture: its UUID is trashed and all17 pre-existing assets remain intact. Parent also restored the prior camera grant. Reopening native Scan returned its normal frame and QR guidance (`ios-native-camera-restored.jpg`), so the actual denied→restored permission cycle passed.

Actual iOS native transport recovery passed using a scoped genuine connection refusal: parent temporarily pointed only this running test client's PostgREST URL at closed loopback port9, preserving the live endpoint. No API success/data was mocked. Actual Send failed; a later refresh cleared private conversation data and displayed friendly reconnect guidance. After parent restored the endpoint, actual Retry reopened the conversation with `IOS transport retry 01` intact. Sending that retained draft acknowledged the bubble and cleared the composer. Parent verified exactly one stored message. Evidence: `ios-native-transport-refusal.jpg`, `ios-native-transport-draft-restored.jpg`, `ios-native-transport-retry-sent.jpg`, and `ios-native-transport-recovery.json`. This is transport-refusal evidence, not an iOS OS-offline claim.

Actual iOS warm background/resume now independently passes: Device Hub Home visibly returned Springboard, QA sent `web-during-ios-background-01` through real Web Pair QA browser UI, and touching the QR Chat Home icon restored the same native DM with the missed bubble once, without launch/reload. Evidence: `ios-native-warm-resume.jpg` and QA's `web-ios-background-send.json`.

Additional native iOS checks passed with real software keyboard and UI: search `Web Pair` isolates its friend; `zz-no-chat-01` shows empty guidance; Clear search restores chats; Privacy and Help display useful native alerts; Settings displays Leave current chat and Sign out. Evidence: `ios-native-search-match.jpg`, `ios-native-search-empty.jpg`, `ios-native-privacy.jpg`, `ios-native-help.jpg`, `ios-native-settings.jpg`. Opening Profile from focused search exposed an underlying keyboard returning after dismissing Privacy. Native owner added `Keyboard.dismiss()` before profile navigation; repeating Search→Clear→Profile→Privacy→OK passed. Before/fixed evidence: `ios-native-profile-search-keyboard-before.jpg`, `ios-native-profile-search-keyboard-fixed.jpg`.

## Actual Android browser resume defect

QA reproduced a real Android Chrome resume defect after the same account left its group in native: the page's existing `?code` was processed again when the shared store returned to ready, opening the scanner over the ended-membership state. The same replay could reopen a current group and clear its draft. The initial-link effect now consumes its page-entry intent once, after readiness; later visibility/network resumes preserve the current conversation state. Explicit Scan and new page visits remain available. The three-line ref guard is in `mobile-chat.tsx`. Web typecheck, lint, and all35 tests pass; parent rebuilt/restarted production. QA's durable `scripts/release-android-expiry.mjs` verifies expiry without an automatic scanner. Its ancillary Android Home draft probe was removed because Chrome emitted no visibility events; that attempt is not a pass claim. Draft preservation is independently verified by the production suite's actual offline→online pause/resume. The exact native Leave/Chrome resume regression also passed. Before evidence: `android-chrome-native-leave.json` and corresponding screenshot.

QA independently repeated the exact Android Chrome native-Leave/resume regression on the fixed build without reload/navigation: group cleared, scanner stayed closed, zero group cards and two retained friends. Evidence: `android-chrome-native-leave-fixed.json/png`. Final production browser suite now passes17 checks, including group-draft preservation through offline→online without replaying the existing QR query.

Second independent peer-expiry observation: Android's server deadline was2026-10-03T01:44:20.210702Z. The unchanged foreground iOS group showed membership2→1 by01:44:27 UTC, retaining its own group history/composer without reload or navigation. Evidence: `ios-native-android-peer-expiry.jpg`.


Actual iOS own expiry passed at the server deadline2026-10-03T01:45:29.490107Z: unchanged foreground native group cleared private history/composer by01:45:34, disabled group settings, and offered Scan to rejoin (`ios-native-own-expiry.jpg`). Warm-resuming the same-account Safari page on the latest bundle also cleared history/composer and kept its scanner closed (`ios-safari-own-expiry.jpg`). Both clients retained two accepted friends (`ios-native-expired-friends.jpg`, `ios-safari-expired-friends.jpg`). Safari sent `ios-safari-after-expiry-01` through actual UI; recipient QA independently verified one copy (`ios-safari-post-expiry-dm.jpg`, `web-received-ios-safari-expiry.png/json`).

Actual Safari local sign-out returned to the Google-only sign-in page (`ios-safari-signed-out.jpg`). Native resumed still authenticated and sent `ios-native-after-safari-signout-01` through actual UI, acknowledged and draft cleared (`ios-native-after-safari-signout.jpg`). Recipient verification and temporary membership/Leave/native sign-out cleanup are coordinated with root.

Final iOS sequence complete: independent web recipient verified `ios-native-after-safari-signout-01` exactly once (`web-received-ios-signout-isolation.json/png`). Root prepared a temporary new membership using the public API after the prior group fully expired; this is fixture setup, not optical QR acceptance. Actual native Leave confirmation Cancel retained the action, then actual Leave removed the group and retained two friends (`ios-native-leave-confirmation.jpg`, `ios-native-left-group.jpg`). Native Settings→Sign out reached Google-only entry; subsequent cold launch started process76614 at01:50:00 UTC and remained signed out (`ios-native-signed-out.jpg`, `ios-native-signed-out-cold-launch.jpg`).

Simulator handoff: Capture Keyboard restored OFF and verified in accessibility state; Simulate Hardware Keyboard toggled back to its prior mode. Original camera grant and17 prior Photos assets preserved; only imported QR fixture trashed. All UI tests/screenshot capture stopped before root restores original real-user session. Root owns that restoration and backend fixture cleanup. No pending source changes or concrete unresolved web defects remain. Google OAuth, physical-device camera behavior, and iOS app-specific Settings destination remain the documented deferred checks.

Final root cleanup confirmation: original iOS session restored with identity match; all8 disposable users/sessions and exact8 QR fixtures removed; verification found0 fixture users/profiles/memberships/friendships/avatar objects/codes. Private fixture credentials and session backups deleted. See [cleanup evidence](evidence/cleanup.json). No further runtime work remains.
