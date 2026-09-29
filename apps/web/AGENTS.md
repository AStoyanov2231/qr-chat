<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Web Rules

## Overview

Next.js mobile web client at widths ≤767px. Desktop is marketing and QR handoff. Follow [root rules](../../AGENTS.md).

## Behaviour

- Architecture/code: follow [ARCHITECTURE.md](../../ARCHITECTURE.md); keep routes and UI thin, reuse shared packages.
- Design: follow [DESIGN.md](../../DESIGN.md) and its skill routing.
- Auth: server claims protect routes; validate same-origin OAuth return paths. Viewport checks never authorize access.
- Preserve keyboard/focus, labels, safe areas, and responsive layout.
- Update affected docs with each change; run only required checks.

## Navigation

Paths below are relative to `apps/web`.

| Change | Inspect |
| --- | --- |
| Routes/auth | `src/proxy.ts`, `src/app/(protected)/layout.tsx`, `src/lib/supabase/` |
| OAuth/redirects | `src/app/auth/callback/route.ts`, `src/lib/auth/redirect.ts` |
| Chat state | `src/hooks/use-chat-backend.ts` |
| UI/styles | `src/components/mobile-chat.tsx`, `src/app/globals.css` |
| Setup/tests | `README.md`, `package.json`, `tests/` |

## Commands

Run from the repository root using root commands. Scope web scripts with `pnpm --filter web <script>`; available scripts are in `package.json`. Setup/build details: [README.md](README.md).
