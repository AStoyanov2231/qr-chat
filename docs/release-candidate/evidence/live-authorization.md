# Live server authorization

Executed 2026-10-03 against Supabase project `zkgvdeluswvmwirhhufi` using the exact [`packages/api/tests/sql/authorization.sql`](../../../packages/api/tests/sql/authorization.sql) script through Supabase `execute_sql`.

Result: **PASS** — “All authorization, hostile-input, expiration, and cascade assertions passed; fixtures rolled back”.

The suite uses temporary generated actors inside a transaction, switches to anonymous/authenticated roles, checks server-side authorization and hostile writes, and rolls back all fixtures. It covers anonymous access, outsiders, sender spoofing, invalid input, expiry, friend-gated DMs, and cascade cleanup. No existing user data was changed.
