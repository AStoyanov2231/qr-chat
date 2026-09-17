# Design1 mobile web QA

## Scope and evidence

Source visual truth: `/Applications/Coding/qr-chat/Design1.png` (1536 x 1024).
The three app-content regions were cropped at x=58, 560, and 1058, y=100, width=420, height=844, then normalized to 390 x 784.
Device bezels, status bars, and home indicators are device-owned and are excluded from the web UI comparison.
Implementation screenshots are 390 x 784 pixels at a 390 x 784 CSS viewport, density 1.
The comparison uses the actual production components and stylesheet in an isolated local Next.js harness with an in-memory backend fixture.
Production authentication was neither bypassed nor modified.

Evidence directory: `/private/tmp/qr-chat-design-evidence/`.

- `home-comparison.png`: normalized source and final Home capture together.
- `groups-comparison.png`: normalized source and final Groups capture together.
- `profile-comparison.png`: normalized source and final Profile capture together.
- `conversation.png`: message composition and submitted fixture message.
- `desktop-real.png`: actual application sign-in route at 1280 x 900.

## Comparison history

1. Initial Home comparison found the scan icon's extra center square and tip text wrapping onto a fourth line.
   Replaced the icon with Phosphor CornersOut and adjusted tip typography and spacing.
2. Initial Groups comparison found the header and list too low.
   Reduced heading top padding and rendered compact relative message times.
3. Initial Profile comparison found statistics and menu rows too low.
   Adjusted avatar, statistics, and menu spacing.
4. Fixture interaction testing found save confirmation hidden behind the modal.
   Successful saves now close the modal, and failed saves keep it open with an inline error.
5. Final normalized comparisons checked all three screens together with their source regions.
   No remaining blocking layout findings were observed within the existing data model.

## Required fidelity surfaces

- Typography: Arial/Helvetica reproduces the reference's compact sans-serif proportions, three-line Home heading, 35px Groups title, and centered profile hierarchy.
- Layout: left-aligned Home copy, 145px scan action inside a 244px halo, bottom tip, edge-to-edge bottom navigation, filter pills, group rows, circular avatar, three-column statistics, and profile menu grouping match the reference composition.
- Colors: near-white Groups/Profile surfaces, lightly blue-tinted Home, dark primary actions, gray secondary text, fine separators, and green membership dots follow the reference.
- Assets: Phosphor icons provide the navigation and controls.
  Real profile avatar URLs are displayed when present, with an explicit fallback when absent or failed.
  The existing QR-code data model has no venue photo field, so live groups use a venue icon rather than unrelated stock photos.
- Copy: Home and navigation copy matches the reference.
  Names, membership, and messages reflect account data rather than copied sample records.

## Expected data differences

The current backend allows one active group, not the reference's five simultaneous groups.
The profile model has no username, lifetime message total, or saved-place total.
The profile therefore shows its real display name, a membership label, active group count, and unavailable totals as dashes.
Nearby and Saved Places explain the current available behavior rather than fabricating locations or saved records.
These constraints mean the populated reference is not reproduced pixel-for-pixel as account data.
No schema changes were made.

## Verification

- Home, Groups, and Profile navigation passed in the browser harness.
- Group search and no-results state passed.
- Nearby filter and scan entry passed.
- Profile editing, confirmation, and modal dismissal passed with fixture persistence.
- Group entry and message composition passed with the fixture backend.
- Camera dialog opened and closed; a physical camera scan was not verified.
- At 320 x 568, there was no horizontal page overflow and the bottom navigation remained at the viewport bottom.
- At 767px, mobile navigation was present.
- At 768px, the app was unmounted and only the mobile-only notice was present.
- The actual sign-in route displayed the desktop notice at 1280 x 900.
- Fixture browser error and warning logs were empty during the tested navigation and message flow.
- Web lint, TypeScript, and all three existing unit tests passed.
- Production webpack build passed.
- React Doctor reported seven state-updater diagnostics on the ordinary async `perform` event wrapper, which is not a React state updater.
  It also reported the existing large-component/control-flow warnings.
  No clean React Doctor score is claimed.

Live OAuth, cross-user realtime delivery, and profile persistence against Supabase were not reverified because an authenticated browser session was unavailable.
The existing backend E2E script was updated for the new desktop gate, Profile dialogs, and Groups copy but was not executed.

## Follow-up polish

Exact venue photography, usernames, saved places, historical memberships, and lifetime statistics require product data support beyond the current schema.
The supplied reference does not define camera, conversation, authentication, or empty-state screens; these retain working product behavior in the matching visual language.

final result: passed

This result applies to the implemented layout and tested fixture interactions, not live backend E2E or a claim of pixel-identical sample account data.
