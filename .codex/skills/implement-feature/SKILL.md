---
name: implement-feature
description: Implement a new user-visible feature or substantial behavior change.
---

1. Inspect the relevant existing architecture and analogous features.
2. Identify the smallest appropriate implementation boundary.
3. Determine what behavior must be tested.
4. Implement the feature using existing conventions.
5. Add or update tests for important behavior.
6. Run targeted tests.
7. Run typecheck and lint for affected packages.
8. Run E2E tests when the change crosses UI/API/database boundaries.
9. Inspect the final diff and fix regressions before stopping.