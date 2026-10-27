import test from "node:test";
import assert from "node:assert/strict";
import { safeAuthDestination, signInPath } from "../src/lib/auth/redirect.ts";

test("auth return destinations stay on the app origin", () => {
  assert.equal(safeAuthDestination("/chats?code=CORNER-01"), "/chats?code=CORNER-01");
  assert.equal(safeAuthDestination("https://evil.example"), "/");
  assert.equal(safeAuthDestination("//evil.example"), "/");
  assert.equal(safeAuthDestination("/\\evil.example"), "/");
  assert.equal(safeAuthDestination("/.//evil.example"), "/");
  assert.equal(safeAuthDestination("/\\/evil.example"), "/");
});

test("auth routes cannot become recursive return destinations", () => {
  assert.equal(safeAuthDestination("/auth/callback"), "/");
  assert.equal(safeAuthDestination("/sign-in?next=/profile"), "/");
  assert.equal(safeAuthDestination(null), "/");
});

test("the static shell sends signed-out visitors to sign-in and back", () => {
  assert.equal(signInPath("/"), "/sign-in?next=%2F");
  const next = new URL(signInPath("/profile"), "https://qr-chat.example").searchParams.get("next");
  assert.equal(safeAuthDestination(next), "/profile");
  assert.equal(safeAuthDestination(new URL(signInPath("/", "?code=A%2BB"), "https://x.example").searchParams.get("next")), "/?code=A%2BB");
});
