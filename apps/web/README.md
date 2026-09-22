# QR Chat Web

The Next.js application contains the authenticated mobile-web client and the desktop web surface.
Mobile web is an interactive QR Chat client at widths up to 767px.
Desktop web is reserved for the marketing homepage and QR handoff rather than chat.
The current desktop implementation still shows a mobile-only gate while the marketing homepage is completed.

## Run

From the repository root:

```sh
pnpm install
pnpm --filter web dev
```

Open `http://localhost:3000`.
Use a phone or a browser viewport no wider than 767px for the interactive client.
For a real phone on the same network, use the network origin printed by Next.js.

`NEXT_PUBLIC_APP_URL` controls the public web origin used for links and future QR handoff behavior.
The application also requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
`NEXT_PUBLIC_ENABLE_APPLE_AUTH=true` exposes Apple sign-in only after the provider is configured and verified.

## Architecture

Protected routes validate Supabase claims on the server.
The OAuth callback exchanges PKCE codes server-side and validates the requested return path.
The client injects its authenticated Supabase browser adapter into `@qr-chat/api`.
PostgreSQL, RLS, and transactional RPCs remain authoritative.

The web client supports profiles, QR entry and camera scanning, one active room, paginated group messages, Realtime reconciliation, friendships, direct messages, and sign-out.
Membership expires after 24 hours and joining another room replaces the current membership.

`Design1.png` at the repository root is the only visual reference.
Screenshot content unsupported by the database is not an implemented feature.

## Verify

Node.js 22.18 or newer is required for native TypeScript loading in the tests.

```sh
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web build
```

The credentialed automated browser flow is separate because it writes disposable data to production:

```sh
pnpm --filter web test:e2e
```

See `packages/api/README.md` for its required variables and cleanup contract.
Do not use computer-use agents for visual testing.
Manual browser testing belongs to the user.

## Current Limitations

Server-backed reporting and blocking are approved requirements but are not implemented in the current schema.
The desktop marketing homepage and native clients remain active implementation work.
Nearby discovery, group history, saved places, notifications, usernames, venue media, and lifetime statistics are future concepts.
