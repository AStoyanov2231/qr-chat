# Web transitions — 2026-10-04

Implementation complete in `apps/web`. The user requested no further testing after implementation; remaining live cases are unverified and waived for this task. No dependencies added, no deployment, no changes to native code, shared packages, database, backend commands, or OAuth destinations.

## Acceptance checklist

| Status | Case | Evidence / next action |
| --- | --- | --- |
| PASS | Group, DM and own profile: 240 ms forward/back slides, both screens moving | Preview browser test; intermediate frames and keyframes in `preview-motion.json` |
| PASS | Browser Back/Forward restores group/DM/profile views and direction | Preview history regression; local DM identity stored in existing browser history |
| PASS | Message updates, draft edits, profile saves and same-conversation queries do not replay slides | Rendered preview assertions |
| PASS | Scanner expands/collapses at measured trigger; dismissal after resize; focus restored only once | Preview geometry/intermediate-frame assertions, including focus after later viewport changes |
| PASS | Rapid navigation, repeated close/reopen, reduced motion, unavailable animation API | Rendered preview checks; no stuck snapshots/modal, current screen interactive |
| PASS | Camera denial/retry/cancellation | Actual Chromium permission denied; preview app; no physical camera |
| PASS | Immediate camera stop, successful decoding, late permission cancellation, scanner exit before chat entry | Real getUserMedia and qr-scanner with synthetic video; membership is an in-memory preview fixture |
| PASS | Triggerless fade, required join fields and successful join | Synthetic QR + in-memory preview; no database writes |
| PASS | Group settings retains 240 ms right slide and dismissal | Existing sidebar unchanged; rendered animation-name/timing checks |
| PASS | Welcome/sign-in continuous 160 ms fades, document destination fade, reduced motion | Local production app with anonymous auth; intermediate frames and recording |
| PASS | Protected-route redirect and usable callback error | Actual anonymous production `/profile` and `/auth/callback`; original `next` destination preserved |
| PASS | Sign-out revokes protected rendering before redirect | Session-provider regression with auth event fixture and synchronous revocation; live sign-out still blocked |
| PASS | Keyboard opening/closing, anchored controls, draft/history scroll retention | Existing browser keyboard suite with an emulated VisualViewport; actual rendered animation frames |
| PASS | No horizontal overflow, runtime/hydration errors or new console errors in exercised paths | Browser assertions. Existing local analytics/favicon resource failures excluded from console-error comparison |
| PASS | `pnpm check`; `pnpm --filter web build`; `git diff --check` | Logs linked below; 45 web unit/regression tests |
| UNVERIFIED | Live Google OAuth, authenticated arrival/sign-out, live membership rejoin | No authenticated test browser or disposable confirmed account credentials supplied. Next action: supply a credential-file path or perform interactive Google sign-in, then exercise the production app |
| UNVERIFIED | Physical camera/OS permission UI and physical mobile keyboard/rotation | Browser uses synthetic capture and emulated viewport. Next action: exercise the web app on a camera-enabled phone/browser |

Floating, empty-state, membership-ended rejoin, and triggerless scanner entries were rendered using isolated preview states. Each visible trigger used its actual measured circle and restored focus; expiry updates did not replay navigation. These are fixture checks, not live membership acceptance. Other people's profile overlays remain unchanged. Group settings have no page-motion identity change.

## Recordings and intermediate frames

- [Preview motion recording](/private/tmp/qr-chat-transition-evidence/preview-motion.webm)
- [Scanner lifecycle recording — synthetic input](/private/tmp/qr-chat-transition-evidence/scanner-motion.webm)
- [Production public auth recording — anonymous](/private/tmp/qr-chat-transition-evidence/auth-motion.webm)
- [Group entry at an intermediate frame](/private/tmp/qr-chat-transition-evidence/group-forward-intermediate.png)
- [Profile entry at an intermediate frame](/private/tmp/qr-chat-transition-evidence/profile-forward-intermediate.png)
- [Empty-state scanner origin](/private/tmp/qr-chat-transition-evidence/scanner-empty-state-intermediate.png)
- [Rejoin scanner origin](/private/tmp/qr-chat-transition-evidence/scanner-rejoin-intermediate.png)
- [Scanner expansion at an intermediate frame](/private/tmp/qr-chat-transition-evidence/scanner-open-intermediate.png)
- [Scanner collapse after resize at an intermediate frame](/private/tmp/qr-chat-transition-evidence/scanner-close-resized-intermediate.png)
- [Welcome/sign-in intermediate fade](/private/tmp/qr-chat-transition-evidence/welcome-sign-in-intermediate.png)
- [Preview keyframes and timing](/private/tmp/qr-chat-transition-evidence/preview-motion.json)
- [Scanner lifecycle timeline](/private/tmp/qr-chat-transition-evidence/scanner-lifecycle.json)
- [Join/fallback results](/private/tmp/qr-chat-transition-evidence/scanner-joining.json)
- [Anonymous production auth results](/private/tmp/qr-chat-transition-evidence/anonymous-auth-motion.json)
- [`pnpm check` log](/private/tmp/qr-chat-transition-check.log)
- [Web build log](/private/tmp/qr-chat-transition-build.log)

Recordings capture actual rendered movement. Intermediate screenshots pause native animations at 40% of their duration; JSON captures their keyframes, timing and computed transforms. Final screenshots alone were not used as motion proof.

## Changed files

- `src/app/layout.tsx`, `src/components/app-arrival.tsx`, `src/app/globals.css`: public/auth arrival fades and clipped visual snapshots.
- `src/app/(protected)/layout.tsx`, `src/app/(protected)/page.tsx`, `src/app/(protected)/profile/page.tsx`: one persistent web chat instance, retaining the session provider and subscriptions across routes.
- `src/components/design-preview.tsx`: isolated local fixture controls for empty/expired scanner entry tests; production preview remains unavailable.
- `src/components/mobile-chat.tsx`: screen identities, history restore, scanner origin/exit sequencing and prompt camera shutdown.
- `src/components/profile-view.tsx`, `src/components/chats-overview.tsx`: preserve link semantics; forward actual scanner trigger events.
- `src/hooks/use-screen-transition.ts`, `src/hooks/use-scanner-dialog.ts`, `src/lib/motion.ts`: inert outgoing screens, measured circular clipping, cancellation/completion and reduced-motion/API fallbacks.
- `src/hooks/use-chat-backend.tsx`: synchronously remove protected rendering when the existing SIGNED_OUT event fires, then perform the existing redirect.
- `tests/motion.test.mjs`, `tests/networking.test.mjs`, `tests/chats-overview.test.mjs`: geometry, completion/cancellation, reduced motion, route ownership and immediate auth revocation.
- `tests/transitions.e2e.mjs`, `tests/scanner-transitions.e2e.mjs`, `tests/auth-transitions.e2e.mjs`: rendered regressions and recordings.
- `tests/chat-layout.e2e.mjs`: wait for animation completion before final geometry assertions instead of assuming 24 frames equal 260 ms.
- `docs/transitions-verification.md`: this checklist and handoff.

## Reproduce

Run the development preview on port 3010 and the production app on 3011. Development on loopback intentionally rewrites sign-in/profile to the existing design preview; auth tests must use `next start`.

```sh
pnpm check
pnpm --filter web build
pnpm --filter web dev --hostname 127.0.0.1 --port 3010
# In another terminal, after build:
pnpm --filter web start --hostname 127.0.0.1 --port 3011
```

Use installed Playwright through `QR_CHAT_PLAYWRIGHT_MODULE`; no package installation is required. The preview/auth/keyboard scripts attach to a Chromium CDP browser on port 9226 (`QR_CHAT_BROWSER_URL` override). The scanner script launches disposable Chromium with its generated video, and requires installed ffmpeg.

```sh
export QR_CHAT_PLAYWRIGHT_MODULE=/Users/andy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs
node apps/web/tests/transitions.e2e.mjs
node apps/web/tests/scanner-transitions.e2e.mjs
node apps/web/tests/auth-transitions.e2e.mjs
node apps/web/tests/chat-layout.e2e.mjs
```

The production build required worker-port permission outside the filesystem sandbox. A cached initial sandbox error was cleared and the exact requested build then passed. Temporary disk exhaustion was recovered by removing this task's discarded build cache. Neither changed application configuration.
