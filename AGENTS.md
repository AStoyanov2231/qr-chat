# QR Chat Repository Instructions

## Product

QR Chat is a mobile-first authenticated social app for joining temporary venue-based group conversations through physical QR codes.
Users can exchange group messages, become friends, and continue conversations through direct messages.
The interactive clients are mobile web, native iOS, and native Android.
Desktop web is a marketing homepage and QR handoff surface, not a chat client.

`Design1.png` is the only visual source of truth.
Treat it as visual direction, not permission to invent unsupported data or features.

## Stack

- pnpm and Turborepo monorepo
- Next.js, React, and TypeScript for `apps/web`
- Expo, React Native, and TypeScript for `apps/mobile`
- Supabase Auth, PostgreSQL, RLS, Realtime, and RPCs
- Zod validation in `packages/validation`
- Node's built-in test runner for unit tests
- Vercel for the hosted web client

Use the versions pinned in repository manifests and lockfiles.
Do not substitute package managers.

## Repository Responsibilities

- `apps/web`: mobile web client, protected Next.js routes, OAuth callback handling, and the desktop marketing surface
- `apps/mobile`: native iOS and Android client using platform-native components
- `packages/domain`: pure platform-independent product rules, transformations, and state decisions
- `packages/api`: framework-independent typed Supabase operations and Realtime transport
- `packages/validation`: shared Zod schemas for untrusted input
- `packages/types`: shared contracts and generated Supabase database types
- `supabase/migrations`: historical, read-only migration artifacts
- `Design1.png`: canonical visual reference
- `design-qa.md`: dated historical visual-verification evidence

Shared packages must not import from applications.
Keep React, Next.js, React Native, browser APIs, secure-storage implementations, and navigation out of `packages/domain`.
Keep React, Next.js, DOM APIs, local storage, and platform authentication storage out of `packages/api`.

## Client Parity

Mobile web, iOS, and Android must maintain behavioral parity for authentication, profiles, QR joining, group chat, friendships, direct messages, authorization, validation, pagination, and Realtime recovery.
Share product logic, API operations, validation, and types.
Do not share UI merely to make the clients look technically identical.
Use platform-native components when they improve platform fidelity, such as native tab navigation on iOS and Android.

The current product supports QR scanning, one active temporary group, group messages, profiles, friendships, and direct messages.
Nearby discovery, multiple or historical groups, saved places, notifications, usernames, venue media, and lifetime statistics are future concepts visible in the design reference.
Do not fabricate those capabilities, data, or schemas without an approved product and database proposal.

## Commands

Run commands from the repository root unless a command says otherwise.

- Install dependencies: `pnpm install`
- Start all development tasks: `pnpm dev`
- Start web only: `pnpm --filter web dev`
- Start Expo: `pnpm --filter mobile start`
- Start iOS locally: `pnpm --filter mobile ios`
- Start Android locally: `pnpm --filter mobile android`
- Run the complete unit-test suite: `pnpm test`
- Run workspace lint: `pnpm lint`
- Run workspace type checking: `pnpm typecheck`
- Build production targets that currently define a build: `pnpm build`
- If Turbopack cannot bind its internal worker port in the agent sandbox, verify web with `pnpm --filter web exec next build --webpack` and report the environment limitation.
- Run API integration tests: `pnpm --filter @qr-chat/api test:integration`
- Run browser E2E: `pnpm --filter web test:e2e`
- Check patch whitespace: `git diff --check`

Integration and E2E tests write disposable data to the production Supabase project during development.
Do not run them without explicit approval and the required disposable credentials.

## Architecture and Data Rules

Supabase PostgreSQL is authoritative.
Client state, hidden controls, cached data, and browser or native storage are never authorization boundaries.
Use `packages/api` before adding direct Supabase calls to clients.
Use `packages/domain` for reusable pure logic rather than duplicating decisions between web and native.
Validate untrusted input at boundaries with the shared schemas.
Use existing transactional RPCs for membership and friendship state changes.
Use filtered Realtime subscriptions and reconciliation rather than trusting payloads as final state.

Preserve these lifecycle invariants:

- A user has at most one active QR-group membership.
- Membership expires 24 hours after joining.
- Joining another QR group leaves the previous group.
- Removing the final membership deletes the room and its group messages.
- Friendships and direct messages persist beyond venue membership.
- Removing a friendship deletes its direct-message history.
- Account deletion removes the profile, memberships, and friendships through database relationships.

QR keys are opaque and case-sensitive.
Do not change schema, lifecycle, authorization, retention, or RPC behavior as incidental work.

## Authentication and Security

Require authentication for profiles, rooms, messages, friendships, and direct messages.
Only the desktop marketing page, sign-in flow, OAuth callback, and explicitly public legal or support pages may be unauthenticated.
Support Google and Apple sign-in across web, iOS, and Android when each provider is fully configured and tested on that platform.
Hide unconfigured providers.
Do not add guest or anonymous chat accounts.

Perform authorization on the server and in RLS.
On web, use server-side claims for protected routing and allow only validated same-origin return destinations.
On native, store sessions in platform-secure storage and implement the foreground and background refresh lifecycle.
Never expose service-role or secret keys in clients, public environment variables, logs, fixtures, or documentation.
Never use editable user metadata for authorization.
Do not weaken validation, grants, RLS, or authorization to make a test pass.

Do not log OAuth credentials, access tokens, message contents, reports, or other private chat data in analytics or ordinary application logs.
Reporting and blocking are required safety capabilities before public launch, but they are not implemented in the current schema.
Any implementation must be server-backed and requires an approved product and database proposal.
Local hiding may improve immediate UX but must never be presented as server enforcement.

## Supabase Production Workflow

The installed Supabase MCP connected to production is the only authorized way for agents to inspect or change Supabase.
Never create or modify local Supabase migration files or directories.
Never use the Supabase CLI, a local Supabase instance, or dashboard automation for project changes.
Treat existing files under `supabase/migrations` as read-only history.

For a proposed Supabase change:

1. Inspect production with read-only MCP calls.
2. Check current Supabase documentation and relevant breaking changes.
3. Present the exact SQL, affected objects, compatibility impact, rollback plan, and verification plan.
4. Wait for explicit approval.
5. Apply finalized schema DDL once through MCP `apply_migration` so production history is recorded.
6. Use MCP `execute_sql` only for read-only verification or separately approved data operations.
7. Run security and performance advisors, authorization tests, and direct verification queries.
8. Regenerate `packages/types/src/database.ts` through MCP after an approved schema change.
9. Report every production operation and its result.

The production project currently has no real users and is also the development test backend.
Write-based integration or E2E runs still require approval, dedicated disposable accounts, unique test prefixes, and verified cleanup.
Keep a separate staging project in mind once real-user conditions change, but do not incur staging costs without approval.

## Design and Accessibility

Use `Design1.png` for mobile visual hierarchy, spacing, restrained color, navigation, and copy density.
Preserve the desktop web surface as marketing-only.
Do not add walls of helper copy or simulate unsupported production data to fill the reference.

Target WCAG 2.2 AA where applicable.
Web work must preserve semantic controls, keyboard navigation, visible focus, screen-reader labels, reduced motion, and sufficient contrast.
Native work must preserve VoiceOver and TalkBack semantics, font scaling, safe areas, reduced motion, and platform-appropriate touch targets of at least 44 points.
Loading, empty, error, disabled, offline, and reconnect states must remain understandable without relying only on color.

## Testing and Verification

Add or update tests for changed public behavior and pure logic.
Include validation and authorization failure cases when relevant.
For a bug fix, reproduce the closest automated end-user flow first, then add a regression test at the authoritative layer.
Run the complete unit suite for every logic change, not only the directly affected test file.
Run established integration and E2E suites when applicable and approved.
Do not weaken assertions or suppress real failures.

Do not spawn computer-use agents or perform subjective browser, simulator, or device testing.
Manual visual and interaction testing belongs to the user.
Provide a concise manual test checklist in the completion report.

## Dependencies and Generated Files

Prefer existing workspace packages, framework APIs, and platform SDKs.
Get explicit approval before adding, removing, or upgrading a production dependency, native module, Expo config plugin, build plugin, or service integration.
Dev-only test and type packages may be added when necessary, but explain why existing tooling is insufficient.
Use pnpm for dependency changes and update `pnpm-lock.yaml` only through pnpm.

Do not edit these generated or managed artifacts manually:

- `packages/types/src/database.ts`
- `next-env.d.ts`
- `.next/`, `.expo/`, `.turbo/`, and build output
- generated `ios/` or `android/` directories
- the framework-generated block at the top of `apps/web/AGENTS.md`

Do not run `apps/mobile/scripts/reset-project.js`.
It is a destructive Expo starter utility and is not part of the QR Chat workflow.

## Git, Cloud, and Deployment Boundaries

Agents may inspect files, edit the working tree, install declared dependencies, and run non-destructive local checks.
Do not commit, push, create or merge a pull request, deploy, submit an app-store build, alter domains, change hosted environment variables, change provider dashboards, or modify production data without explicit approval.
Never force-push or run destructive Git commands without an explicit request naming the target.
Preserve unrelated working-tree changes.

Vercel is the current hosted web target.
Native clients run locally and connect directly to Supabase through `packages/api`.
Expo EAS, TestFlight, and Google Play are future distribution targets, not active deployment workflows.
Do not invent deployment commands before configuration exists.

## Documentation

Keep AGENTS.md focused on stable instructions that change agent behavior.
Keep human setup and product explanations in README and product documents.
Reference canonical files instead of copying large examples.
Update applicable instructions when commands, architecture, security boundaries, or recurring agent mistakes change.
Do not add temporary task requirements, generic advice, or rules already expressed by tooling.

## Completion Report

After completing a task, report:

- User-visible and behavioral changes
- Important architecture or security decisions
- Modified, added, and removed files
- Exact commands run and their results
- Full unit-test results for logic changes
- Integration or E2E results when applicable
- Checks skipped or unavailable, with reasons
- A concise manual test checklist for the user
- Any production Supabase operations performed
- Assumptions, known limitations, and remaining risks
- Confirmation that no unauthorized commit, push, deployment, or production change occurred
