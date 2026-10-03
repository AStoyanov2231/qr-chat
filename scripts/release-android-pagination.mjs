// Use actual Android gestures and Load older UI; inspect rendered props only for exact IDs.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [kind, id] = process.argv.slice(2);
assert.ok(['group', 'direct'].includes(kind), 'Provide group/direct and optional DM id. Open that conversation first.');
const output = '/private/tmp/qr-chat-release-evidence';
const fixture = JSON.parse(readFileSync(`${output}/pagination-fixtures.json`, 'utf8'));
const expected = kind === 'group' ? fixture.group : fixture.directs.find((entry) => entry.id === id);
assert.ok(expected);
const adb = (args) => execFileSync('/Users/andy/Library/Android/sdk/platform-tools/adb', ['-s', 'emulator-5554', ...args]);
const inspect = () => JSON.parse(execFileSync(process.execPath, [new URL('./release-native-inspect.mjs', import.meta.url).pathname, 'android'], { encoding: 'utf8' })).value;
const select = (rows) => rows.find((row) => row.messages.some((message) => expected.all.some((entry) => String(entry.id) === message.id))) || rows.at(-1);
let before;
for (let attempt = 0; attempt < 20; attempt++) {
  before = select(inspect());
  if (before && !before.loading) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.equal(before.loading, false);
assert.equal(before.messages.length, 50, 'Fresh native view must start at one page');
assert.ok(before.nextCursor);
let clicked = false;
for (let attempt = 0; attempt < 22; attempt++) {
  adb(['shell', 'uiautomator', 'dump', '/sdcard/qr-chat-qa-ui.xml']);
  const xml = adb(['shell', 'cat', '/sdcard/qr-chat-qa-ui.xml']).toString();
  const node = [...xml.matchAll(/<node\b[^>]*>/g)].map(([match]) => match).find((node) => /(?:text|content-desc)="Load older messages"/.test(node));
  if (node) {
    const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);
    writeFileSync(`${output}/android-${kind}-load-older.png`, adb(['exec-out', 'screencap', '-p']));
    adb(['shell', 'input', 'tap', String(Math.round((bounds[0] + bounds[2]) / 2)), String(Math.round((bounds[1] + bounds[3]) / 2))]);
    clicked = true;
    break;
  }
  adb(['shell', 'input', 'swipe', '530', '750', '530', '1850', '280']);
}
assert.ok(clicked, 'Actual native Load older control must be reachable');
let after;
for (let attempt = 0; attempt < 20; attempt++) {
  after = select(inspect());
  if (!after.loading && after.nextCursor === null) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.equal(after.nextCursor, null);
assert.equal(new Set(after.messages.map((message) => message.id)).size, after.messages.length, 'No duplicate rendered message IDs');
for (const message of expected.all) assert.ok(after.messages.some((row) => row.id === String(message.id) && row.text === message.body), `Missing or changed message ${message.id}`);
writeFileSync(`${output}/android-${kind}-pagination.png`, adb(['exec-out', 'screencap', '-p']));
writeFileSync(`${output}/android-${kind}-pagination.json`, JSON.stringify({ pass: true, initialCount: before.messages.length, initialCursor: before.nextCursor, finalCount: after.messages.length, finalCursor: after.nextCursor, expectedFixtureCount: expected.all.length, actualUiLoadOlder: clicked, uniqueIds: true, messages: after.messages, timestamp: new Date().toISOString() }, null, 2));
console.log(`PASS actual Android ${kind} Load older: 50→${after.messages.length}, every fixture ID/body present, no duplicate IDs.`);
