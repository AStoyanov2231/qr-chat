import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cameraErrorMessage } from '../src/lib/camera-error.ts';

test('denied camera permission takes priority over the scanner missing-camera fallback', async () => {
  const permissions = { async query(descriptor) {
    assert.equal(descriptor.name, 'camera');
    return { state: 'denied' };
  } };
  assert.match(await cameraErrorMessage('Camera not found.', permissions), /Camera access is blocked.*browser settings/);
  assert.match(await cameraErrorMessage(new DOMException('Access blocked', 'NotAllowedError')), /Camera access is blocked/);
});

test('a missing device still gets the device-specific message', async () => {
  assert.equal(await cameraErrorMessage('Camera not found.', { query: async () => ({ state: 'granted' }) }), 'No camera was found on this device.');
  assert.equal(await cameraErrorMessage(new DOMException('Requested device not found', 'NotFoundError')), 'No camera was found on this device.');
});

test('unsupported camera permission queries give recovery guidance without claiming no camera exists', async () => {
  for (const permissions of [undefined, { query: async () => { throw new TypeError('Unsupported permission'); } }, { query: async () => ({ state: 'prompt' }) }]) {
    const message = await cameraErrorMessage('Camera not found.', permissions);
    assert.match(message, /Check your browser permissions and try again/);
    assert.doesNotMatch(message, /No camera was found/);
  }
  assert.match(await cameraErrorMessage(new DOMException('Camera in use', 'NotReadableError'), { query: async () => ({ state: 'granted' }) }), /could not start/);
});
