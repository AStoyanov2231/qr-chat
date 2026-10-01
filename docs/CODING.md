# Coding

Use [ARCHITECTURE.md](../ARCHITECTURE.md) for ownership and [PRODUCT.md](../PRODUCT.md) for behavior. Keep changes in the layer that owns them: web routes and browser sessions in `apps/web`, native navigation and secure storage in `apps/mobile`, pure product decisions in `packages/domain`, authenticated Supabase operations in `packages/api`, schemas in `packages/validation`, and shared/generated contracts in `packages/types`.

## TypeScript and runtime boundaries

- Keep app routes and screens focused on composing UI and state. Put decisions used by multiple clients in a shared package with a public export. Never import app source across clients or reach into another package's source tree.
- Treat external values as `unknown`; narrow them or validate them with a shared Zod schema before use. Avoid `any` and unchecked assertions that hide an invalid contract. Use generated database types and the shared API; `createChatApi` accepts the authenticated client, while session storage stays in the platform app.
- Model mutually exclusive states with a discriminated union when that makes invalid combinations unrepresentable. Derive values from existing state where practical instead of storing duplicate facts.
- Give exported APIs clear inputs and outcomes. Preserve useful nullable results and domain errors rather than hiding failures behind broad catches. Catch at the layer that can show recovery or reset protected state.
- Represent loading, ready, empty, and failed states when they change what a person can do. Keep failed edits recoverable and prevent duplicate mutations where the flow needs it.
- For asynchronous UI work, invalidate or cancel obsolete reads, unsubscribe listeners, and clear timers on cleanup. Follow [useChatBackend](../apps/web/src/hooks/use-chat-backend.ts) for stale-result guards and lifecycle cleanup; follow [chat-provider](../apps/mobile/src/providers/chat-provider.tsx) for foreground-owned native subscriptions.
- Prefer small pure functions for parsing and decisions. See [domain QR handling](../packages/domain/src/index.ts) and [safe auth redirects](../apps/web/src/lib/auth/redirect.ts). Keep persistence in the API/platform layer that owns it.
- Split modules by responsibility, not arbitrary size. Add classes or dependency injection only when the repository's design benefits from them.
- Consult the installed Next.js or Expo guide when a change depends on an API whose version or behavior needs confirmation. Follow any more specific scoped app instructions.

The boundary checker scans source under `apps/*/src` and `packages/*/src`. It parses imports, re-exports, type imports, literal dynamic imports, and literal `require` calls, resolves relative paths and configured TypeScript aliases, and checks package manifests against the dependency DAG in [ARCHITECTURE.md](../ARCHITECTURE.md). It skips generated and build directories. Nonliteral dynamic imports, indirect imports, runtime globals, and side effects inside dependencies are outside its scope.
