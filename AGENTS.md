# Repository Rules

QR Chat is a mobile first app for joining physical venue groups by scanning QR codes, messaging, and taking accepted friendships to DMs. See [PRODUCT.md](PRODUCT.md) for the shared client contract.

## Work

- Keep canonical docs current with behavior, ownership, setup, and verification changes. Route product behavior to [PRODUCT.md](PRODUCT.md), architecture to [ARCHITECTURE.md](ARCHITECTURE.md), design to [DESIGN.md](DESIGN.md), coding to [docs/CODING.md](docs/CODING.md), testing to [docs/TESTING.md](docs/TESTING.md), and agent setup to [docs/WORKFLOW.md](docs/WORKFLOW.md).
- The primary agent owns scoping, implementation, review, integration, and final verification. Implement small or tightly coupled changes directly. Use subagents for independent exploration, implementation, or review when parallel work would materially improve speed or quality; delegation is optional and does not require a particular model or reasoning effort. Give delegated work clear file ownership and acceptance checks, and review the combined result. Discuss broad refactors with the user before implementation.
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
