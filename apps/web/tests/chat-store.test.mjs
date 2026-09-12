import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  getSession,
  saveSession,
  resolveCode,
  getGroup,
  joinGroup,
  leaveGroup,
  sendMessage,
  reportMessage,
  heartbeat,
} from "../src/lib/chat-store.ts";

let storage;
const alex = { id: "alex", name: "Alex", hidden: [] };
const sam = { id: "sam", name: "Sam", hidden: [] };
beforeEach(() => {
  storage = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
      key: (i) => [...storage.keys()][i] ?? null,
      get length() {
        return storage.size;
      },
    },
  });
  globalThis.window = Object.assign(new EventTarget(), {
    location: { origin: "http://localhost:3000" },
  });
});

test("registered aliases and same-origin links resolve to the same venue", () => {
  assert.equal(resolveCode(" corner-01 ").id, resolveCode("CORNER-02").id);
  assert.equal(
    resolveCode("http://localhost:3000/?code=CORNER-02").id,
    "corner",
  );
  assert.equal(resolveCode("garbage"), undefined);
  assert.equal(resolveCode("https://other.example/?code=CORNER-01"), undefined);
  assert.equal(resolveCode("http://["), undefined);
});

test("first visitor creates group; repeats do not duplicate membership", () => {
  assert.equal(getGroup("corner"), null);
  joinGroup("corner", alex);
  const created = getGroup("corner").created;
  joinGroup("corner", alex);
  joinGroup("corner", sam);
  assert.equal(getGroup("corner").created, created);
  assert.equal(getGroup("corner").members.length, 2);
  assert.equal(getGroup("corner").messages.length, 0);
});

test("messages from two users coexist, sort chronologically, and notify subscribers", () => {
  joinGroup("corner", alex);
  joinGroup("corner", sam);
  let events = 0;
  window.addEventListener("qrchat", () => events++);
  sendMessage("corner", alex, "Hello");
  sendMessage("corner", sam, "Hi!");
  const messages = getGroup("corner").messages;
  assert.equal(messages.length, 2);
  assert.deepEqual(
    new Set(messages.map((m) => m.user)),
    new Set(["alex", "sam"]),
  );
  assert.ok(messages[0].time <= messages[1].time);
  assert.equal(events, 2);
});

test("leave preserves messages and name, rejects sends, and permits rejoin", () => {
  saveSession(alex);
  joinGroup("corner", alex);
  sendMessage("corner", alex, "Hello");
  leaveGroup("corner", alex.id);
  heartbeat("corner", alex);
  assert.equal(getGroup("corner").members.length, 0);
  assert.equal(getSession().name, "Alex");
  assert.equal(getGroup("corner").messages.length, 1);
  assert.throws(() => sendMessage("corner", alex, "Not joined"));
  joinGroup("corner", alex);
  assert.equal(getGroup("corner").members.length, 1);
});

test("unavailable groups and invalid content are rejected", () => {
  for (const id of ["closed", "deleted", "unknown"])
    assert.throws(() => joinGroup(id, alex));
  assert.throws(() => joinGroup("corner", { ...alex, name: " " }));
  joinGroup("corner", alex);
  assert.throws(() => sendMessage("corner", alex, " "));
  assert.throws(() => sendMessage("corner", alex, "a".repeat(2001)));
});

test("hiding persists locally without removing messages; reports are idempotent", () => {
  joinGroup("corner", sam);
  sendMessage("corner", sam, "Hello Alex");
  const message = getGroup("corner").messages[0];
  saveSession({ ...alex, hidden: [sam.id] });
  assert.deepEqual(getSession().hidden, ["sam"]);
  assert.equal(
    getGroup("corner").messages.filter(
      (m) => !getSession().hidden.includes(m.user),
    ).length,
    0,
  );
  assert.equal(getGroup("corner").messages.length, 1);
  reportMessage(message, alex.id);
  reportMessage(message, alex.id);
  assert.equal(
    [...storage.keys()].filter((k) => k.includes(":report:")).length,
    1,
  );
  saveSession(alex);
  assert.equal(getSession().hidden.length, 0);
});
