## Design system

Source of truth: DesignSystem-v2 — https://claude.ai/artifact/L4fXiY3xa6KRj6vPfez5fA

- Read it (Artifact tool, `read`) before any UI work: new pages, components, or restyles.
- Web tokens live in `apps/web/src/app/globals.css` (`:root`). Use those `var(--*)` tokens, never raw hex.
- "Re-sync with the design system" = re-read the artifact and update the tokens and styles to match.

When delegating to subagents, don't inherit my model. Rate each task's difficulty first, then set the Agent tool's `model` and `effort` explicitly:
- Easy/mechanical (lookups, renames, boilerplate, tests for known behavior): sonnet, high
- Hard (design decisions, tricky bugs, cross-file refactors, security/migrations): opus
State the chosen model and one-line reason per agent before spawning.

## Learned rules
- Put only schema changes (tables, columns, policies, functions, grants, cron, reference data) in supabase/migrations; keep one-off data fixes out.
- From now on, every change is a new `supabase migration new <name>` file. Don't edit the baseline.
<!-- end claude-reflect -->