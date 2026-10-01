# Design

Visual authority: [Design1.png](design_assets/Design1.png). Apply its hierarchy to the supported [product](PRODUCT.md); use real data. Desktop remains marketing/handoff.

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
- Group names/avatars and member rows open a profile. The primary action follows friendship state: Add friend, Accept, or Message; outgoing requests show Request sent with Cancel request. Incoming requests also offer Decline.
- Edit Profile previews a chosen photo before Save profile, with Choose photo and Remove photo controls. Failed saves retain the selection; failed image loads use initials. Camera failures offer permission recovery/retry; joining and rejoining use the scanner.
- WCAG 2.2 AA: contrast, focus, keyboard, labels, screen readers, safe areas, scalable text, reduced motion; native targets ≥44 points. Status never relies only on color.

## Skills

| Skill | Use |
| --- | --- |
| `ux-intent-discovery` | New surface or unclear user intent; settle the job and flow before design. Reuse intent answers already settled in this task. |
| `ux-design` → `ux-designer` | Wrapper workflow for substantial interface or flow design; read both files and treat the pair as one workflow. |
| `ux-designer` | Direct focused design work when intent is already settled. |
| `ux-audit` → `ux-auditor` | Wrapper workflow to inspect an existing interface and identify user-facing problems; read both files and treat the pair as one workflow. |
| `ux-auditor` | Direct focused audit of an existing surface. |
| `ux-review` → `ux-reviewer` | Wrapper workflow for review after UI implementation; read both files and treat the pair as one review. |
| `ux-reviewer` | Direct focused post-change UI review. |
| `restyle` → `visual-character` | Wrapper workflow for an explicit restyle; treat the pair as one workflow. |
| `visual-character` | New visible surfaces or polish/restyle work; inherit this document's approved direction. |
| `design-system` | Shared tokens, components, or design-system structure. |
| `information-hierarchy` | Creating or restructuring screens with competing actions, sections, or data. |
| `state-completeness` | Creating or changing data fetch, input, or async UI; cover only applicable states. |
| `form-ux` | Forms, validation, input retention, or submission behavior changes. |
| `feedback-and-affordance` | Adding or changing controls or consequential actions. |

For UI tasks, read and apply each skill whose trigger matches; do not load all skills for every edit. Resolve skill files at `~/.codex/skills/<name>/SKILL.md`. The primary owns intent, design decisions, and review; Luna implements assigned UI and code changes. Reuse settled grill-me and design-intent answers.

### Relevant validation

| Skill | Use |
| --- | --- |
| `validate` | Choose documented, targeted engineering checks for validation, diagnosis, or delivery. Browser and simulator steps follow [TESTING.md](docs/TESTING.md). |
| `react-doctor` | Use changed-scope React diagnostics when required by the task; run a full scan only for an explicit triage or cleanup request. Its browser guidance does not override [TESTING.md](docs/TESTING.md). |

Small edits inherit existing intent. Repository and user rules override skill defaults. Update this doc with approved design/token changes.
