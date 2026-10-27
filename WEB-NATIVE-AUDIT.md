# Web ↔ Native audit (2026-10-26)

Bugs and web/native mismatches to fix later. `W` = `apps/web/src`, `N` = `apps/mobile/src`, `API` = `packages/api/src`, `MIG` = `supabase/migrations`.
Tags: **bug** = broken, **mismatch** = platforms differ, **ux**/**token** = UI. ✔ = spot-checked by orchestrator.

## High

- [x] **bug ✔ — Account deletion leaves `venue-photos` behind.** `W/app/api/account/route.ts:19-22` cleans only `avatars` and `venue-menus`, and the public bucket keeps the photos. Also: `list()` stops at 100 files and the error is ignored; the delete isn't atomic.
- [x] **bug ✔ — Blocking a pending friend request always fails on web.** `W/components/mobile-chat.tsx:502-512` calls `blockFriend`, and the RPC needs `accepted_at is not null` (`MIG/…baseline.sql:92`). Native has no Block there (`N/app/(app)/direct/[id].tsx:45-55`). Decline deletes the row, so the sender can re-request.
- [x] **bug ✔ — Native scanner retries a failed join on every frame.** `N/app/(app)/scan.tsx:53` unlocks immediately. Web locks for 1200ms and shows "Try camera again" (`mobile-chat.tsx:263-267`).
- [x] **mismatch — No report, no unblock, no block from a member profile or group (both).** Block exists only on the DM-list swipe. App Store 1.2 expects report plus block.

## Medium — bugs

- [x] **Open redirect ✔.** `W/lib/auth/redirect.ts:5-22` turns `/sign-in?next=/.//evil.com` into `//evil.com`, and `oauth-button.tsx:30` sends signed-in users there. Fix: reject a pathname starting with `//`, and add a test.
- [x] **Native scanner throws on malformed URL QRs.** `scan.tsx:38` runs `unwrapQrCode` with no try/catch, so `new URL` throws (`packages/domain/src/index.ts:46`). That is an unhandled rejection on every frame. Web catches it.
- [x] **Business SQL test is broken ✔.** `packages/api/tests/sql/business.sql:29-53` calls the 4-arg `update_place`, which was dropped in `MIG/20261020192724_place_photo.sql:6-7`.
- [x] **A new place is created before its menu/photo is validated** (`business-view.tsx:152-156`, `business.tsx:136-140`). If step 2 fails, Back plus "Create place" makes a duplicate place and QR.
- [x] **Save sends stale `menu_path`/`photo_path` from the client snapshot** (`API/index.ts:256-273`). Editing on two devices can wipe a new PDF or point to a deleted file.
- [x] **Storage orphans.** A failed RPC after upload leaves files behind (`API/index.ts:257-267`). `deletePlace` is a soft delete and never removes the menu/photo.
- [x] **Web delete-account and sign-out errors are invisible.** The toast (`globals.css:690`) renders under the `showModal()` dialog (`profile-view.tsx:47`). Native shows `ErrorNotice` inline.
- [x] **Web Edit Profile can open with an empty name** if opened before the session loads (`profile-view.tsx:46,63`).
- [x] **Native delete-account fails with "Please sign in again." when `EXPO_PUBLIC_WEB_ORIGIN` is empty** (`N/lib/supabase.ts:44`, `API/index.ts:282`). An unset origin also prints raw `v:xxxx` QRs and leaves group names unresolved. Nothing checks for it at startup.
- [x] **Native scan Close does nothing after a deep-link cold start** (`scan.tsx:61` uses `router.back()` with no `canGoBack()` guard).
- [x] **Zod messages are swallowed on both.** Every ZodError becomes "Check your input…" (`W/hooks/use-chat-backend.tsx:12`, `N/providers/chat-provider.tsx:7`), so the PDF/photo size limits and control-character messages never show.

## Medium — mismatches

- [x] **Native can't name an unknown product (GTIN) group.** Only web has the `nameProductGroup` form (`mobile-chat.tsx:583-591`).
- [x] **Venue link `/v/:code`:** web joins directly (`next.config.ts:30`). Native drops the code and opens `/scan` (`N/app/(app)/v/[id].tsx:4`, `N/lib/qr-link.ts:9`), and a signed-out user loses the destination. Web also opens an existing group directly; native always goes to scan.
- [ ] **QR origin is computed differently.** Web prints with `appOrigin()` but parses scans with `window.location.origin` (`mobile-chat.tsx:176`). Native uses the raw env value, so a trailing slash gives `//v/`. Confirm the env host matches the universal-link host (`.env.example` has `natterium.com`, `.env.local` has `www.`). _Code fixed; still open: make `EXPO_PUBLIC_WEB_ORIGIN` and `UNIVERSAL_LINKS_HOST` the same host in `.env.local`._
- [x] **Desktop web: the `/privacy` link shows the landing page.** It is missing from the allowlist in `W/components/mobile-only.tsx:24`.
- [x] **Desktop web business owners can't sign out or delete their account** (nothing in `business-view.tsx`, and `/profile` is gated).
- [x] **Lapsed business owners can't reach the inactive-plan screen.** The entry is gated by `isBusiness()` on both (`profile-view.tsx:64`, `N/app/(app)/profile.tsx:22`).
- [x] **Delete place lives in different spots.** Web has row swipe only (`business-view.tsx:78-81`); native has an editor button only (`business.tsx:185-188`).
- [x] **Business Save placement.** Web scrolls it with the form (bd24bac). Native pins it in a footer (`business.tsx:145-148`) that can sit under the keyboard.
- [x] **Friend-request screen.** Web shows age, "Let {name} message you?", side-by-side buttons and Block. Native stacks Accept/Decline with no age and no Block.
- [x] **Privacy/Help copy has drifted.** Native (`profile.tsx:15-16`) omits the 24h expiry, name/photo visibility and the policy link. The policy page (`W/app/privacy/page.tsx`) never mentions business data (place names, menus, photos).
- [x] **No success feedback on native** for profile save or accept/decline. Web shows toasts.
- [x] **Offline/reconnect.** Web has an app-wide offline + reconnect banner. Native has no offline state, and its reconnect text exists only on the chats list and the conversation.
- [x] **Native profile-save errors are specific; web shows a generic one** (`profile-view.tsx:75,94`).

## Low — bugs

- [x] Native scan error never clears (`scan.tsx:39`), so it hides later join errors.
- [x] Native scan before `chat.ready` is ignored silently (`scan.tsx:37`).
- [x] Native `link` validation is weaker than the DB: `https:foo.com` passes zod but fails the DB check (`validation/index.ts:51-54` vs DB `^https://\S+$`).
- [x] Switching to PDF and saving with no file silently clears the link (both).
- [x] A save succeeds but the reload fails → an error shows and the editor stays on the stale snapshot (both).
- [x] Web photo preview leaks object URLs (`business-view.tsx:129`).
- [x] Website QR image cached for a year at the same path, so an `og:image` change goes stale (`W/lib/group-metadata.ts:95-96`).
- [ ] "Add friend" is shown for blocked users, then fails on the trigger (`member-profile.tsx:45`, `person/[id].tsx:36`). _Hidden for people you blocked; kept for people who blocked you, since hiding it would reveal the block._
- [x] Initials `slice(0,2)` splits emoji (both `avatar.tsx`).
- [x] Web flashes the landing page on phones before hydration (`mobile-only.tsx:22`).
- [x] Web sign-in button can stay stuck on "Opening sign in…" after Back (bfcache).
- [x] Web sign-out sets a stale `?next=` (e.g. `/profile`) for the next account.
- [x] Web business page doesn't react to sign-out in another tab.
- [x] Web member-count pill is a 36px tap target (`globals.css:802`); native expands it to 44.
- [x] Native `/members` route is unreachable, and it shows "membership ended" while loading.

## Low — mismatches / UX

- [ ] Photo input: web checks type and ≤20MB and flattens alpha onto white. Native does no checks, so transparent PNGs may turn black. _Native now checks type and size; alpha flattening still open._
- [ ] The 400px square place photo is reused as a 4:3 group cover (cropped, low-res).
- [x] QR export: web is 1024px, "Download QR", and names the file from the unsaved name. Native is ~600-850px, "Share QR", and uses the saved name. On web a QR generation failure is swallowed.
- [x] Copy drift:
  - Back: "Back to chats" vs "Back".
  - Busy: "Please wait…" vs "Saving…".
  - Retry: "Try again" vs "Retry".
  - Composer placeholder: `Message {title}…` vs "Message…".
  - Leave confirm: names the venue vs doesn't.
  - Delete account: "cannot be undone" vs not.
  - Business empty state: different text.
  - Invalid code: web's message is misleading.
  - OAuth cancel: different text.
- [x] Tapping your own row: web opens the profile hub, native opens Edit profile.
- [x] Message avatar: 44 on web vs 32 on native. Profile avatar: 100 vs 130.
- [x] Native sign-in has no Google icon, no pending label and no privacy link.
- [x] Open Food Facts attribution: web links ODbL + CC BY-SA, native only links the site.
- [x] Native skeletons are static (web shimmers), and native text is selectable (web `user-select:none`).
- [ ] Web uses unstyled `window.confirm`; native uses `Alert`.
- [ ] Only Google sign-in on iOS: App Store 4.8 likely requires Sign in with Apple.

## Tokens

- [x] All 20 colors match, but native duplicates them by hand (`N/components/chat-ui.tsx:14-19`) and nothing keeps them in sync.
- [x] Raw hex/rgba in web CSS outside `:root` (`globals.css` ~27 spots: camera `#07090b`, `#fff`, scrims). Add `--camera`, `--scrim`, `--on-photo`/`--on-danger`.
- [x] Raw colors in web TSX: `profile-view.tsx:58`, `member-profile.tsx:32`, `landing-page.tsx:15`, `lib/avatar.ts:16`, `use-scanner-dialog.ts:22`.
- [x] Native bypasses `colors`: `scan.tsx:62-71`, `conversation.tsx:93`, `conversation-header.tsx:18-22`, `group-details.tsx:21`, `settings-sidebar.tsx:24-26`.
- [x] Photo header scrim: web uses a .2→.38 gradient, native a flat .24.

## Dead code (mention only)

- Web CSS: `.conversation-header`, `.room-welcome`, `.message-avatar`, `.participants`, `.presence`. Classes with no CSS: `dm-preview-error`, `auth-provider-*`.
- Native: `members.tsx` route, the `Empty` component, and the `home`/`groups` skeleton variants.

## Chat / realtime

Both apps share `@qr-chat/api` (store, realtime, pagination). Only the outbox and `errorMessage` are copied per app, and they have already drifted. Messages are plain text only: no images or links.

- [x] **high bug ✔ — One failed chat fetch wipes the whole app.** Every `refreshConversation` error calls `fail()` (`API/store.ts:124-133,299`), which clears all caches, sets `ready:false` and an empty snapshot. A blip on "Load older", a realtime id fetch or an access check drops the user to "Couldn't load this chat" everywhere.
- [x] **med bug — Retry can duplicate a message.** There is no idempotency/client id (`MIG/…baseline.sql:811-818`, `API/index.ts:189-195`), so a lost response plus retry inserts it twice.
- [x] **med mismatch — Outbox lifetime.** Web's outbox lives in the persistent layout (`mobile-chat.tsx:104`). Native's is per `Conversation` (`conversation.tsx:37`), so leaving a chat silently drops failed messages.
- [x] **med bug — Web ghost bubbles.** Outbox items are only hidden while their `sentId` is loaded (`W/hooks/use-outbox.ts:30-33`). After `fail()`, old sent messages reappear at the bottom.
- [x] **med mismatch — Multi-line messages.** The native composer is multiline. Web uses `<input>` and its message `<p>` lacks `white-space: pre-wrap` (`globals.css:318,731,817`), so line breaks collapse on web.
- [x] **med bug — Web jumps to the bottom on every new message** even while the user is reading history (`mobile-chat.tsx:353-361`). Native only does it within 100px of the bottom (`conversation.tsx:75`).
- [x] **med bug — `pause()` tears down the open chat** (`API/store.ts:336-342` publishes `ready:false`). A tab switch or offline on web, or background/resume on native, flashes a skeleton and loses the scroll position.
- [x] **low-med bug ✔ — Chat list order is NaN for owner groups.** `chatRows` runs `Date.parse("infinity")` (`packages/domain/src/index.ts:191`), which breaks the sort, so new venue groups jump around.
- [x] **low mismatch — Composer disabled states.** The web group composer stays enabled while loading, but the web DM composer doesn't. Web disables the input on any `busy` state, which closes the mobile keyboard. Native disables both while loading and never on busy.
- [x] **low bug — Per-DM error is never set** (`store.ts:82` always writes `''`). The web "Couldn't load messages…" banner and native `direct.error` are dead.
- [x] **low bug — A DM opened after a realtime event is half-loaded**: one row, no skeleton, no "Load older" (`store.ts:79-82,291-294`).
- [x] **low mismatch — "Reconnecting…" rules differ.** Web groups show the global banner only. The web DM and native show it for any non-`connected` state, including `polling` and `connecting`. Native DM shows it twice (header + list).
- [x] **low bug — Own sent row can drop from the cache.** `pendingWrites` is cleared before the early returns (`store.ts:271-272,288,297`).
- [x] **low bug — Coordinator drops queued re-runs when a run throws** (`API/coordinator.ts:10-16`).
- [ ] **low bug — Realtime stops past 99 groups.** The topic cap is 100 (`API/realtime.ts:35`), so the rest fall back to the 120s poll.
- [x] **low perf — Request volume.**
  - Every incoming message runs `get_chat_access` + `getSession` (`store.ts:166-175,296`).
  - Every re-SUBSCRIBE re-checks the full cached range of all open chats.
  - One channel error closes all channels (`realtime.ts:90-96`).
- [x] **low bug — Extra web refetch.** The `openGroup` effect depends on the `active` object identity (`mobile-chat.tsx:150`).
- [x] **low mismatch — Web profile banner shows raw `backend.error`** (`mobile-chat.tsx:519`). Native maps it through `errorMessage`.
- [x] **low — `session.hidden` is always `[]`** (`API/snapshot.ts:19`), so the web hidden-user filter is dead code.
