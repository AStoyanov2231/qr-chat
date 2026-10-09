import { Image } from 'expo-image';
import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy } from './chat-ui';
import { NativeAction } from './native-action';
import { useChatKeyboard } from '@/hooks/use-chat-keyboard';

export function ConversationHeader({ title, subtitle, imageUrl, settings, settingsLabel, disabled, browse, onBack, belowSafeArea }: { title: string; subtitle?: string; imageUrl?: string | null; settings?: () => void; browse?: () => void; onBack?: () => void; settingsLabel?: string; disabled?: boolean; belowSafeArea?: boolean }) {
  const insets = useSafeAreaInsets();
  const { expanded } = useChatKeyboard();
  // belowSafeArea: the screen pads itself by the inset, so the photo starts under the status bar and fills 30% of the screen.
  const screenHeight = useWindowDimensions().height;
  const hero = belowSafeArea ? Math.round(screenHeight * 0.3) : 170 + insets.top;
  const height = useSharedValue(hero);
  // Slides out of flow so the conversation below expands to the top.
  const collapse = useAnimatedStyle(() => ({ marginTop: -height.value * expanded.value }));
  // Light status text sits on the photo; once the surface covers it, switch to dark.
  const [covered, setCovered] = useState(false);
  useAnimatedReaction(() => expanded.value > 0.5, (next, previous) => { if (next !== previous) scheduleOnRN(setCovered, next); });
  return <>
  <Stack.Screen options={{ statusBarStyle: covered || belowSafeArea ? 'dark' : 'light' }} />
  <Animated.View onLayout={(event) => { height.value = event.nativeEvent.layout.height; }} style={[{ minHeight: hero, backgroundColor: '#64717b' }, collapse]}>
    {imageUrl && <Image source={{ uri: imageUrl }} contentFit="cover" style={{ position: 'absolute', inset: 0 }} accessibilityElementsHidden />}
    <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10,20,30,0.24)' }} />
    {imageUrl && !belowSafeArea && insets.top > 0 && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, overflow: 'hidden' }}>
      <Image source={{ uri: imageUrl }} contentFit="cover" blurRadius={16} style={{ width: '100%', height: 170 + insets.top }} accessibilityElementsHidden />
      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10,20,30,0.24)' }} />
    </View>}
    <View style={{ height: (belowSafeArea ? 0 : insets.top) + 56 }} />
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 34, gap: 6 }}>
      <Copy selectable={false} accessibilityRole="header" numberOfLines={2} ellipsizeMode="tail" style={{ color: '#fff', fontSize: 30, lineHeight: 36, fontWeight: '600', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 8 }}>{title}</Copy>
      {subtitle && <Copy style={{ color: '#fff', fontSize: 14 }}>{subtitle}</Copy>}
    </View>
  </Animated.View>
  {/* Controls stay put above the conversation, like the web overlay. */}
  <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: insets.top + 12 }}>
    <NativeAction icon="back" accessibilityLabel={onBack ? 'Back' : 'Back to chats'} onPress={onBack ?? (() => router.dismissTo('/'))} />
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {browse && <NativeAction icon="browser" accessibilityLabel="Open venue page" onPress={browse} />}
      {settings && <NativeAction icon="settings" accessibilityLabel={settingsLabel ?? 'Settings'} disabled={disabled} onPress={settings} />}
    </View>
  </View>
  </>;
}
