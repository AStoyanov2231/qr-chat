# Web app: files with logic

All paths are under `apps/web/`.

## Pages and routes (`src/app`)
- `src/app/layout.tsx`
- `src/app/(protected)/layout.tsx`
- `src/app/(protected)/page.tsx`
- `src/app/(protected)/profile/page.tsx`
- `src/app/business/page.tsx`
- `src/app/privacy/page.tsx`
- `src/app/welcome/page.tsx`
- `src/app/sign-in/page.tsx`
- `src/app/sign-in/oauth-button.tsx`
- `src/app/auth/callback/route.ts`
- `src/app/api/account/route.ts`
- `src/app/api/qr-name/route.ts`
- `src/app/.well-known/apple-app-site-association/route.ts`
- `src/app/.well-known/assetlinks.json/route.ts`

## Components (`src/components`)
- `app-arrival.tsx`
- `avatar.tsx`
- `business-view.tsx`
- `chats-overview.tsx`
- `conversation-header.tsx`
- `direct-message-parts.tsx`
- `group-sidebar.tsx`
- `icon.tsx`
- `landing-page.tsx`
- `member-profile.tsx`
- `mobile-chat.tsx`
- `mobile-only.tsx`
- `profile-view.tsx`
- `settings-sidebar.tsx`

## Hooks (`src/hooks`)
- `use-chat-backend.tsx`
- `use-outbox.ts`
- `use-scanner-dialog.ts`
- `use-screen-transition.ts`

## Lib (`src/lib`)
- `app-origin.ts`
- `auth/redirect.ts`
- `avatar.ts`
- `camera-error.ts`
- `chat-view.ts`
- `chat-viewport.ts`
- `group-metadata.ts`
- `motion.ts`
- `qr-name-route.ts`
- `supabase/client.ts`
- `supabase/server.ts`

## Not listed
- Config: `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs`
- Styles: `src/app/globals.css`
- Dev-only design preview: `src/app/design-preview/page.dev.tsx`, `src/components/design-preview.tsx`, `src/lib/local-design-preview.ts`
- E2E tests: `tests/*.e2e.mjs`
