## Design system

Source of truth: DesignSystem-v2 — https://claude.ai/artifact/L4fXiY3xa6KRj6vPfez5fA

- Read it (Artifact tool, `read`) before any UI work: new pages, components, or restyles.
- Web tokens live in `apps/web/src/app/globals.css` (`:root`). Use those `var(--*)` tokens, never raw hex.
- "Re-sync with the design system" = re-read the artifact and update the tokens and styles to match.
