import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, useState } from 'react';
import { reset, render, state, act } from './support/native-harness.mjs';

const { default: Chats } = await import('../src/app/(app)/index.tsx');
const { default: Profile } = await import('../src/app/(app)/profile.tsx');
const { default: Layout } = await import('../src/app/(app)/_layout.tsx');
const { default: ChatsRoute } = await import('../src/app/(app)/chats.tsx');
const { ConversationHeader } = await import('../src/components/conversation-header.tsx');
const { default: Scan } = await import('../src/app/(app)/scan.tsx');
const { NativeInput } = await import('../src/components/chat-ui.tsx');

function nativeIconButton(screen, label, platform) {
  const accessible = screen.root.findAllByType('View').find(node => node.props.accessibilityLabel === label);
  assert.ok(accessible);
  const button = accessible.findByType(platform === 'ios' ? 'SwiftUIButton' : 'FilledIconButton');
  assert.ok(accessible.findByType('Host'));
  if (platform === 'ios') {
    assert.ok(button.props.modifiers.some(modifier => modifier.$type === 'buttonBorderShape' && modifier.shape === 'circle'));
    assert.ok(button.props.modifiers.some(modifier => modifier.$type === 'controlSize' && modifier.size === 'large'));
    assert.equal(button.props.modifiers.some(modifier => modifier.$type === 'frame'), false);
    const symbol = button.findByType('SwiftUIImage');
    assert.equal(symbol.props.size, 20);
    assert.ok(symbol.props.modifiers.some(modifier => modifier.$type === 'frame' && modifier.width === 16 && modifier.height === 16));
  } else {
    assert.equal(button.props.modifiers, undefined);
  }
  return { accessible, button, press: () => platform === 'ios' ? button.props.onPress() : button.props.onClick() };
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: native inputs retain edits and accept external resets without writing back typing`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    let setValue;
    function Input() {
      const [value, update] = useState('Initial');
      setValue = update;
      return createElement(NativeInput, { accessibilityLabel: 'Draft', value, onChangeText: update, maxLength: 4000, multiline: true });
    }
    const screen = await render(t, Input);
    const input = screen.root.findByType('NativeTextInput');
    assert.ok(screen.root.findByType('Host'));
    assert.equal(input.props.maxLength, 4000);
    assert.equal(input.props.multiline, true);
    await screen.type('Draft', 'First line\nSecond line');
    assert.equal(input.props.value, 'First line\nSecond line');
    assert.equal(state.nativeInputWrites ?? 0, 0, 'Typing must not reset a newer native value');
    await act(async () => { setValue(''); });
    assert.equal(input.props.value, '');
    assert.equal(state.nativeInputWrites, 1);
    await act(async () => { setValue('Loaded profile'); });
    assert.equal(input.props.value, 'Loaded profile');
    await act(async () => { setValue('First line\nSecond line'); });
    assert.equal(input.props.value, 'First line\nSecond line', 'External resets can restore a previously typed value');
  });

  test(`${platform}: group and chat headers use native controls and preserve their actions`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    let settingsOpened = 0;
    const props = { title: 'Cafe', settingsLabel: 'Group settings', settings: () => settingsOpened++ };
    const screen = await render(t, ConversationHeader, props);
    await act(async () => { nativeIconButton(screen, 'Back to chats', platform).press(); });
    assert.deepEqual(state.navigation.at(-1), ['dismissTo', '/']);
    await act(async () => { nativeIconButton(screen, 'Group settings', platform).press(); });
    assert.equal(settingsOpened, 1);
    await screen.update({ ...props, disabled: true });
    const settings = nativeIconButton(screen, 'Group settings', platform);
    assert.equal(settings.accessible.props.accessibilityState.disabled, true);
    if (platform === 'ios') assert.ok(settings.button.props.modifiers.some(modifier => modifier.$type === 'disabled' && modifier.value));
    else assert.equal(settings.button.props.enabled, false);
    await act(async () => { settings.accessible.props.onAccessibilityTap(); });
    assert.equal(settingsOpened, 1);
    await screen.update({ title: 'Sam' });
    nativeIconButton(screen, 'Back to chats', platform);
    assert.equal(screen.root.findAllByType(platform === 'ios' ? 'SwiftUIButton' : 'FilledIconButton').length, 1);
  });

  test(`${platform}: the scanner close control is a native circle and goes back`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    const scan = await render(t, Scan);
    const options = scan.root.findByType('NativeStackScreen').props.options;
    let Close = options.headerRight;
    if (platform === 'ios') {
      const items = options.unstable_headerRightItems();
      assert.equal(items.length, 1);
      assert.equal(items[0].type, 'custom');
      assert.equal(items[0].hidesSharedBackground, true, 'The system header must not add a second glass background');
      Close = () => items[0].element;
    } else assert.equal(options.unstable_headerRightItems, undefined);
    const header = await render(t, Close);
    await act(async () => { nativeIconButton(header, 'Close scanner', platform).press(); });
    assert.deepEqual(state.navigation.at(-1), ['back']);
  });

  test(`${platform}: the profile shows its photo header with actions underneath and no current group`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    state.chat.session = { id: 'me', name: 'Andy', avatarUrl: 'https://cdn.example/me.jpg' };
    state.chat.group = { id: 'g', venue: { name: 'Cafe Nine', codes: ['cafe'] }, members: [], messages: [] };
    const screen = await render(t, Profile);
    assert.ok(screen.root.findAllByType('Image').some(node => node.props.source?.uri === 'https://cdn.example/me.jpg'), 'avatar fills the header');
    assert.ok(screen.text().includes('Andy'));
    for (const label of ['Edit profile', 'Settings', 'Privacy', 'Help & Feedback']) await screen.press(label).catch(() => { throw new Error(`Missing action: ${label}`); });
    assert.deepEqual(state.navigation.filter(([method]) => method === 'push').map(([, href]) => href), ['/edit-profile', '/settings']);
    assert.doesNotMatch(screen.text(), /Cafe Nine|Current group|No active group/);
  });

  test(`${platform}: chats keep scrollable content inside native safe areas`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    for (const Page of [Chats]) {
      const screen = await render(t, Page);
      const bounds = screen.root.findByType('NativeSafeAreaView');
      assert.deepEqual(bounds.props.edges, { top: true, bottom: true, left: true, right: true });
      const scroll = bounds.findByType('ScrollView');
      assert.equal(scroll.props.contentInsetAdjustmentBehavior, 'never');
      assert.equal(scroll.props.automaticallyAdjustContentInsets, false);
      assert.equal(scroll.props.alwaysBounceVertical, false);
      assert.equal(scroll.props.overScrollMode ?? 'auto', 'auto');
      assert.notEqual(scroll.props.scrollEnabled, false);
      if (Page === Chats) {
        const scan = screen.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Scan a QR code').at(-1);
        assert.ok(scan);
        assert.equal(scroll.findAll(node => node === scan).length, 0, 'The scan control overlays the viewport outside the scrolling list');
        const overlay = screen.root.findAll(node => node.type === 'View' && node.props.pointerEvents === 'box-none' && node.findAll(child => child === scan).length > 0).at(-1);
        assert.ok(scroll.props.contentContainerStyle.paddingBottom >= 64 + overlay.props.style.bottom, 'The last row can scroll above the 64pt scan control');
        await screen.press('Scan a QR code');
        assert.deepEqual(state.navigation.at(-1), ['push', '/scan']);
        state.chat.ready = false;
        await screen.update();
        assert.equal(scan.props.accessibilityState.disabled, true);
        state.chat.ready = true;
      }
    }
  });

  test(`${platform}: the profile opens as a page and old chats links return home`, async (t) => {
    reset(); process.env.EXPO_OS = platform;
    const layout = await render(t, Layout);
    const screens = layout.root.findAllByType('NativeStackScreen');
    assert.ok(screens.some(screen => screen.props.name === 'index' && screen.props.options.headerShown === false));
    assert.equal(screens.some(screen => screen.props.name === '(tabs)'), false);
    const profile = screens.find(screen => screen.props.name === 'profile');
    assert.equal(profile.props.options.presentation, 'card');
    assert.equal(profile.props.options.headerRight, undefined);
    assert.equal(profile.props.options.sheetAllowedDetents, undefined);
    assert.equal(profile.props.options.sheetGrabberVisible, undefined);
    assert.equal(profile.props.options.sheetCornerRadius, undefined);
    await render(t, ChatsRoute);
    assert.deepEqual(state.navigation.at(-1), ['replace', '/']);
  });
}
