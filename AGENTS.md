# Rules

## Product Oveview
"QR Chat" is a mobile first app with web and native ios/android clients. The desktop view is just for marketing. Users are scaning physical venue QR codes that let them join groups where they message with each other. Users that are friends could take the chats to the DM's. The idea is to build an organic network that people could enter a venue scan QR code and connect with real people around them easily.

## Behaviour
- Keep documentation files inside the repo up to date after making changes so the next session knows the state in which the repo is.
- For work on the Supabase DB use the installed MCP/plugin that is connected to the production. Currently we are treating prod like development (there are no real users inside that are important). You can make edits directly through the connector.
- Treat the following files as source of truth for:
    - `ARCHITECTURE.md` - Product architecture guidelines
    - `DESIGN.md` - Product design guidelines

## Commands

Run from the repository root. Use only commands needed for the task.

| Purpose | Command |
| --- | --- |
| Install | `pnpm install` |
| Start all development tasks | `pnpm dev` |
| Start/debug web | `pnpm --filter web dev` |
| Start native Metro | `pnpm --filter mobile start` |
| Build/run iOS | `pnpm --filter mobile ios` |
| Build/run Android | `pnpm --filter mobile android` |
| Build production web | `pnpm --filter web build` |
| Run production web locally | `pnpm --filter web start` |
| Unit tests | `pnpm test` |
| Lint | `pnpm lint` |
| Type checking | `pnpm typecheck` |
| Check patch whitespace | `git diff --check` |

Production-backed tests require explicit approval and disposable credentials:

```sh
pnpm --filter @qr-chat/api test:integration
pnpm --filter web test:e2e
```