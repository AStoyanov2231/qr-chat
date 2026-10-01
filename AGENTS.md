# Repository Rules

QR Chat is a mobile first app for joining physical venue groups by scanning QR codes, messaging, and taking accepted friendships to DMs. See [PRODUCT.md](PRODUCT.md) for the shared client contract.

## Work

- Keep canonical docs current with behavior, ownership, setup, and verification changes. Route product behavior to [PRODUCT.md](PRODUCT.md), architecture to [ARCHITECTURE.md](ARCHITECTURE.md), design to [DESIGN.md](DESIGN.md), coding to [docs/CODING.md](docs/CODING.md), testing to [docs/TESTING.md](docs/TESTING.md), and agent setup to [docs/WORKFLOW.md](docs/WORKFLOW.md).
- The primary agent scopes and reviews. Prefer the named global `implementer`; when named roles are unavailable, explicitly delegate all code implementation and repairs to `gpt-6-luna` at max reasoning with the same bounded brief. Do not delegate recursively. Report a blocker only if Luna max delegation is unavailable. Discuss broad refactors with the user before implementation.
- While delegated work runs, wait for its completion using Codex's native agent wait/event mechanism. Do not use fixed sleeps or repeated status polling; see [docs/WORKFLOW.md](docs/WORKFLOW.md).
- Supabase schema/data edits may use the installed production MCP directly under this repository rule. Production-backed tests still require explicit approval and disposable credentials.
- Read scoped `AGENTS.md` files and the relevant canonical docs before changing a path.

## Commands

Run from the repository root and use only checks relevant to the task.

| Purpose | Command |
| --- | --- |
| Install | `pnpm install` |
| Aggregate automated checks | `pnpm check` |
| Offline unit tests | `pnpm test` |
| Start all development tasks | `pnpm dev` |
| Start web | `pnpm --filter web dev` |
| Start native Metro | `pnpm --filter mobile start` |
| Check workspace boundaries | `pnpm check:boundaries` |
| Test tooling | `pnpm test:tooling` |
| Check patch whitespace | `git diff --check` |

See [docs/TESTING.md](docs/TESTING.md) for change-specific checks. Production-backed API integration and web E2E commands are documented in [packages/api/README.md](packages/api/README.md) and require explicit approval plus disposable credentials.
