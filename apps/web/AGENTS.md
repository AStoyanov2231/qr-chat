<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Web Scope

Read the repository root `AGENTS.md` first.
This application provides the interactive mobile-web client at widths up to 767px.
Desktop web is the marketing homepage and QR handoff surface, not a chat client.
Do not expand chat to desktop without explicit product approval.

Use `Design1.png` at the repository root as the only visual source of truth for the mobile experience.
Preserve concise copy, responsive containment, safe areas, keyboard behavior, and accessible states.

## Architecture

Keep route handlers, layouts, and server actions thin.
Use `@qr-chat/api`, `@qr-chat/domain`, `@qr-chat/types`, and `@qr-chat/validation` rather than creating web-only business logic.
Do not query Supabase directly from reusable presentation components.
Use the existing browser Supabase adapter and cookie-based SSR flow.

Canonical references:

- Protected routing: `src/proxy.ts` and `src/app/(protected)/layout.tsx`
- Server and browser clients: `src/lib/supabase/`
- Safe OAuth destinations: `src/lib/auth/redirect.ts`
- PKCE callback exchange: `src/app/auth/callback/route.ts`
- Shared backend orchestration: `src/hooks/use-chat-backend.ts`
- Mobile interface: `src/components/mobile-chat.tsx`
- Authentication regression tests: `tests/auth-redirect.test.mjs`
- Backend browser E2E: `tests/backend.e2e.mjs`

Use `supabase.auth.getClaims()` for server-side route protection.
Validate every post-authentication destination as a safe same-origin application path.
Never treat the viewport gate in `src/components/mobile-only.tsx` as an authorization boundary.

## Web Commands

Run these from the repository root:

- Development: `pnpm --filter web dev`
- Unit tests: `pnpm --filter web test`
- Lint: `pnpm --filter web lint`
- Type check: `pnpm --filter web typecheck`
- Production build: `pnpm --filter web build`
- Approved automated E2E: `pnpm --filter web test:e2e`

Do not use computer-use agents for browser testing.
Leave subjective visual and interaction verification to the user and provide a manual checklist.
