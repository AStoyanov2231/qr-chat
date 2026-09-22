import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, render } from './support/native-harness.mjs';

const { default: Home } = await import('../src/app/(app)/(tabs)/index.tsx');
const { default: Groups } = await import('../src/app/(app)/(tabs)/chats.tsx');
const { default: Profile } = await import('../src/app/(app)/(tabs)/profile.tsx');
const { default: Tabs } = await import('../src/components/app-tabs.tsx');

for (const platform of ['ios', 'android']) {
  test(`${platform}: tab pages keep their scroll viewport inside native navigation bounds`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    for (const Page of [Home, Groups, Profile]) {
      const screen = await render(t, Page);
      const bounds = screen.root.findByType('NativeSafeAreaView');
      assert.deepEqual(bounds.props.edges, { top: true, bottom: true, left: true, right: true });
      const scroll = bounds.findByType('ScrollView');
      assert.equal(scroll.props.contentInsetAdjustmentBehavior, 'never');
      assert.equal(scroll.props.automaticallyAdjustContentInsets, false);
      assert.equal(scroll.props.alwaysBounceVertical, false);
      assert.equal(scroll.props.overScrollMode, 'auto');
      // Long friend lists and accessibility text must remain reachable.
      assert.notEqual(scroll.props.scrollEnabled, false);
    }
    const tabs = await render(t, Tabs);
    for (const tab of tabs.root.findAllByType('NativeTabTrigger')) {
      assert.equal(tab.props.disableAutomaticContentInsets, true);
    }
  });
}
