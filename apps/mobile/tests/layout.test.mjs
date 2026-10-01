import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, render, state } from './support/native-harness.mjs';

const { default: Chats } = await import('../src/app/(app)/index.tsx');
const { default: Profile } = await import('../src/app/(app)/profile.tsx');
const { default: Layout } = await import('../src/app/(app)/_layout.tsx');
const { default: ChatsRoute } = await import('../src/app/(app)/chats.tsx');

for (const platform of ['ios', 'android']) {
  test(`${platform}: chats and profile keep scrollable content inside native safe areas`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    for (const Page of [Chats, Profile]) {
      const screen = await render(t, Page);
      const bounds = screen.root.findByType('NativeSafeAreaView');
      assert.deepEqual(bounds.props.edges, { top: true, bottom: true, left: true, right: true });
      const scroll = bounds.findByType('ScrollView');
      assert.equal(scroll.props.contentInsetAdjustmentBehavior, 'never');
      assert.equal(scroll.props.automaticallyAdjustContentInsets, false);
      assert.equal(scroll.props.alwaysBounceVertical, false);
      assert.equal(scroll.props.overScrollMode, 'auto');
      assert.notEqual(scroll.props.scrollEnabled, false);
      if (Page === Chats) {
        const scan = screen.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === 'Scan a QR code');
        assert.ok(scan);
        assert.equal(scroll.findAllByType('Pressable').includes(scan), false, 'The scan control overlays the viewport outside the scrolling list');
        assert.ok(scroll.props.contentContainerStyle.some(style => style.paddingBottom >= 160), 'The last row can scroll above the scan control');
        await screen.press('Scan a QR code');
        assert.deepEqual(state.navigation.at(-1), ['push', '/scan']);
        state.chat.ready = false;
        await screen.update();
        assert.equal(scan.props.disabled, true);
        state.chat.ready = true;
      }
    }
  });

  test(`${platform}: the profile uses the system bottom sheet and old chats links return home`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    const layout = await render(t, Layout);
    const screens = layout.root.findAllByType('NativeStackScreen');
    assert.ok(screens.some(screen => screen.props.name === 'index' && screen.props.options.headerShown === false));
    assert.equal(screens.some(screen => screen.props.name === '(tabs)'), false);
    const profile = screens.find(screen => screen.props.name === 'profile');
    assert.equal(profile.props.options.presentation, 'formSheet');
    assert.deepEqual(profile.props.options.sheetAllowedDetents, [0.75, 1]);
    assert.equal(profile.props.options.sheetGrabberVisible, true);
    await render(t, ChatsRoute);
    assert.deepEqual(state.navigation.at(-1), ['replace', '/']);
  });
}
