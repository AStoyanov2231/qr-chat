---
name: debug
description: Diagnose and fix an observed bug.
---

# Debugging

Do not immmediatly modify code based only on the reported symptom.

1. Reproduce the failure when practical.
2. Gather the error, logs, failing test, or incorrect output.
4. Identify the root cause before changing implementation.
5. Make the smallest fix that addresses that cause.
6. Add or update a regression test when practical.
7. Run the failing test again.
8. Run nearby relevant tests.
9. Check that the fix did not introduce a workaround that hides the underlying problem.

Do not repeatedly make unrelated speculative edits.