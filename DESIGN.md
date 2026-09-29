# Design

Visual authority: [Design1.png](design_assets/Design1.png). Apply its hierarchy to the supported [product](apps/web/PRODUCT.md); use real data. Desktop remains marketing/handoff.

## Direction

- Compact sans serif; bold headings, quiet supporting copy.
- Near-white surfaces, dark primary actions, cool secondary surfaces, fine separators.
- Space around scanning/identity; tighter chat/settings rows. Rounded controls, limited scan elevation.
- Home prioritizes scanning; Groups the active conversation; Profile identity/editing; conversations reading/sending.

## Existing styles

Sources: [web CSS](apps/web/src/app/globals.css), [native chat UI](apps/mobile/src/components/chat-ui.tsx). Reuse these before adding tokens.

| Role | Web / native value |
| --- | --- |
| Paper, ink | `#fdfdfe`, `#0d1114` |
| Muted text | `#797e8b` / `#626a78` |
| Separator, soft surface | `#eeeff2`, `#f3f4f6` |
| Blue surface, membership | `#e9eff8`, `#29bc68` |
| Danger | Web auth/native `#b62929`; web `.danger` `#c23b3b` |
| Type | Web Arial/Helvetica; native system. Home 44, heading 35, group title/detail 18/14 |
| Layout | Horizontal inset 22; common gaps 8/12/16, sections 24/32 |
| Shape | Button radius 15/min height 50; panel 18; filter 24; scan/avatar diameter 145/130 |

Values are extracted, not verified contrast results. Web uses CSS pixels; native uses layout units. Preserve responsive layout and font scaling. Tokens are not fully consolidated; native starter `constants/theme.ts` differs from chat styles. Dark chat design is undefined.

## Interaction

- Reuse Home/Groups/Profile navigation, native tabs, actual profile images, and icon fallbacks.
- Label inputs; preserve drafts/values on failure; show pending/error/retry states and prevent duplicate submits.
- Skeletons match real readiness and layout. Empty, offline, reconnect, and revoked-access states stay explicit.
- Identify the conversation before sending. Confirm destructive consequences, including friendship/DM deletion.
- WCAG 2.2 AA: contrast, focus, keyboard, labels, screen readers, safe areas, scalable text, reduced motion; native targets ≥44 points. Status never relies only on color.

## Skills

New surface: `ux-intent-discovery`, then `ux-designer` for substantial flows. Existing improvement: `ux-auditor`. Explicit restyle: `restyle`/`visual-character`. After UI changes: `ux-reviewer`.

Use only relevant specialists: `information-hierarchy`, `state-completeness`, `form-ux`, `feedback-and-affordance`. Shared tokens: `design-system`. Small edits inherit existing intent; avoid repeated interviews. Repository rules override skill defaults. Update this doc with approved design/token changes.
