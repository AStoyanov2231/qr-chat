import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const expoCli = join(dirname(require.resolve('expo/package.json')), 'bin/cli');

test('iOS generation declares the scene lifecycle required to launch on iOS 27', () => {
  // A clean fixture prevents a stale generated Info.plist from hiding a regression.
  const fixture = mkdtempSync(join(tmpdir(), 'qr-chat-native-config-'));
  try {
    for (const file of ['app.json', 'package.json']) {
      copyFileSync(join(projectRoot, file), join(fixture, file));
    }
    for (const directory of ['node_modules', 'assets']) {
      symlinkSync(join(projectRoot, directory), join(fixture, directory), 'dir');
    }
    // Introspection runs the real config plugins without writing native projects.
    const config = JSON.parse(execFileSync(process.execPath, [
      expoCli, 'config', '--type', 'introspect', '--json',
    ], {
      cwd: fixture,
      env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_DOTENV: '1' },
      encoding: 'utf8',
      timeout: 30_000,
    }));
    const manifest = config._internal.modResults.ios.infoPlist.UIApplicationSceneManifest;

    assert.ok(manifest, 'Missing scene manifest causes UIKit to terminate the app at launch');
    assert.equal(manifest.UIApplicationSupportsMultipleScenes, false);
    assert.equal(
      manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName,
      'EXExpoAppSceneDelegate',
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
