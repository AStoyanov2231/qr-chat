# Native Rules

## Overview

Expo iOS/Android client. Share product behavior with web; use native navigation and controls. Follow [root rules](../../AGENTS.md).

## Behaviour

- Architecture/code: follow [ARCHITECTURE.md](../../ARCHITECTURE.md); use shared API directly and keep platform concerns here.
- Design: follow [DESIGN.md](../../DESIGN.md) and its skill routing.
- Auth: secure session storage; reconcile state on foreground/network recovery.
- Camera: mount only while focused/foreground. Preserve keyboard handling, scalable text, screen-reader labels, and ≥44-point targets.
- Safe areas: `Screen` owns bounds; native tab triggers keep `disableAutomaticContentInsets`.
- Use Expo docs matching the installed version. Never hand-edit generated native projects/routes or run `reset-project.js`.
- Update affected docs with each change; distinguish bundle checks from device verification.

## Navigation

Paths below are relative to `apps/mobile`.

| Change | Inspect |
| --- | --- |
| Auth/session | `src/providers/auth-provider.tsx`, `src/lib/supabase.ts`, `src/lib/secure-storage.ts` |
| OAuth/deep links | `src/lib/oauth.ts`, `src/lib/auth-callback.ts`, `src/lib/qr-link.ts` |
| Chat state | `src/providers/chat-provider.tsx` |
| Screens/UI | `src/app/`, `src/components/chat-ui.tsx`, `src/components/app-tabs.tsx` |
| Config/setup/tests | `app.json`, `package.json`, `README.md`, `tests/` |

## Commands

Run from the repository root using root commands. Scope native scripts with `pnpm --filter mobile <script>`; use only required commands from [README.md](README.md).
