import test from "node:test";
import assert from "node:assert/strict";
import { safeAuthDestination } from "../src/lib/auth/redirect.ts";

test("auth return destinations stay on the app origin", () => {
  assert.equal(safeAuthDestination("/chats?code=CORNER-01"), "/chats?code=CORNER-01");
  assert.equal(safeAuthDestination("https://evil.example"), "/");
  assert.equal(safeAuthDestination("//evil.example"), "/");
  assert.equal(safeAuthDestination("/\\evil.example"), "/");
});

test("auth routes cannot become recursive return destinations", () => {
  assert.equal(safeAuthDestination("/auth/callback"), "/");
  assert.equal(safeAuthDestination("/sign-in?next=/profile"), "/");
  assert.equal(safeAuthDestination(null), "/");
});
