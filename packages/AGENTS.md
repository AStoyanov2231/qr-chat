# Shared Package Rules

Packages own reusable contracts and behavior. They never import either app. Imports between packages use a declared workspace dependency and its public `package.json` export; apps do not import each other's source.

| Package | Owns | Inspect |
| --- | --- | --- |
| `domain` | Pure product decisions and display transformations | `domain/src/`, `domain/tests/` |
| `api` | Typed Supabase operations and realtime | [API contract](api/README.md), [avatar storage](api/AVATARS.md), `api/src/`, `api/tests/` |
| `validation` | Shared runtime input schemas | `validation/src/` |
| `types` | Shared contracts and generated database types | `types/src/`; regenerate database types through the approved Supabase workflow |

Follow [architecture](../ARCHITECTURE.md), [coding](../docs/CODING.md), and [testing](../docs/TESTING.md). Run `pnpm check:boundaries` after package import or manifest changes. Shared package behavior may affect both apps; select consumer checks using the testing guide.
