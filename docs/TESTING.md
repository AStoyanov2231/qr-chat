# Testing

Run automated checks by default and choose scope from behavior and risk. Bug fixes require a regression test. For new behavior, add tests where they exercise an observable contract; state the rationale when a test would not add useful coverage.

## Select checks

| Change | Checks |
| --- | --- |
| Documentation or instructions | Check local links/commands and run `git diff --check` |
| Boundary checker or tooling | `pnpm test:tooling`, `pnpm check:boundaries` |
| App behavior | Affected app tests, type checks, and lint; check the other client when shared behavior or packages changed |
| A package's behavior | Its focused test command plus relevant consumer tests; use `pnpm check` for the complete local gate |
| Shared package contracts or behavior | Check web and native consumers with `pnpm check` |
| Framework, workspace, or native dependency/configuration changes | Include the affected build or bundle command when it validates the changed configuration |
| Any change requiring the full offline gate | `pnpm check` |

`pnpm check` runs tooling fixtures, the architecture checker, TypeScript checks, lint, and the existing offline unit suites. `pnpm test` runs the existing package unit suites. Use focused commands when broader consumers are unaffected.

Browser and simulator checks run only when explicitly requested or explicitly required by task acceptance criteria. Bundle compilation checks package integration; it does not establish camera, permission, OAuth provider, accessibility, signing, or physical-device behavior.

Mocked and fixture tests establish only the behavior they model. They do not establish production RLS, live Realtime, provider authentication, or cross-device delivery. Report those limits when they matter to the task.

QR shared names are covered by `pnpm --filter @qr-chat/domain test`, `pnpm --filter @qr-chat/api test`, `pnpm --filter web test`, and `pnpm --filter mobile test`. These include parser, generic/conflicting metadata, URL safety, redirect/DNS pinning, route authentication, stale lookup, failed-form recovery, and canonical navigation. `pnpm --filter @qr-chat/api test:sql` applies the retained SQL to an isolated local PostgreSQL cluster and checks same-QR retry preserves the room, expiry, and messages, first-name persistence, and legacy-room naming; it requires PostgreSQL 17 binaries. No live external QR-page fetch or production naming write is part of these tests, and concurrent live-user behavior remains unverified.

The web Chats overview uses offline React fixtures in `apps/web/tests/chats-overview.test.mjs` to check loading, active/no-group/access-ended states, request actions, group countdown labels, DM ordering and previews, search results, recovery copy, and own/peer sender photos with profile actions. These tests focus on rendered user-visible structure and component callbacks; they do not establish browser layout or live Realtime delivery. Run `pnpm --filter web test`, `pnpm --filter web typecheck`, and `pnpm --filter web lint` for web UI changes.

Native Chats changes use `pnpm --filter mobile test`. Screen fixtures run for iOS and Android and cover the overview, icon search, direct opening of accepted friends with no history, loading and error states, minute countdown refresh and timer cleanup, sender-specific photos/profile actions, and compact composer pending and failure states. Provider fixtures cover successful active-to-none observation and accepted-DM preview watcher cleanup. When using `@expo/ui` controls, keep their native element under the package's `Host`, export the control for both iOS and Android, and test that composition in the platform fixtures. These fixtures verify React structure and callbacks, not native rendering or device behavior.

Production-backed tests require explicit approval and disposable credentials/fixtures. This applies to API integration, web E2E, and authorization SQL checks. Repository rules separately allow direct Supabase MCP schema/data edits against the connected development-as-production project. Keep credentials out of CI; the quality workflow runs only offline checks.
