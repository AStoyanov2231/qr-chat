import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy } from './chat-ui';
import { NativeAction } from './native-action';
import { useChatKeyboard } from '@/hooks/use-chat-keyboard';

/** Height of the colour fade at the top of the photo. */
export const HERO_FADE = 96;
/** The profile gives the photo more room, like web. */
export const profileHeroHeight = (insetTop: number, windowHeight: number) => Math.max(170 + insetTop, windowHeight * 0.35);

export function ConversationHeader({ title, subtitle, imageUrl, imageColor, settings, settingsLabel, disabled, browse, onBack, tall }: { title: string; subtitle?: string; imageUrl?: string | null; imageColor?: string | null; settings?: () => void; browse?: () => void; onBack?: () => void; settingsLabel?: string; disabled?: boolean; tall?: boolean }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const minHeight = tall ? profileHeroHeight(insets.top, window.height) : 170 + insets.top;
  const { expanded } = useChatKeyboard();
  const height = useSharedValue(170 + insets.top);
  // Slides out of flow so the conversation below expands to the top.
  const collapse = useAnimatedStyle(() => ({ marginTop: -height.value * expanded.value }));
  // Light status text sits on the photo; once the surface covers it, switch to dark.
  const [covered, setCovered] = useState(false);
  useAnimatedReaction(() => expanded.value > 0.5, (next, previous) => { if (next !== previous) scheduleOnRN(setCovered, next); });
  return <>
  <Stack.Screen options={{ statusBarStyle: covered ? 'dark' : 'light' }} />
  <Animated.View onLayout={(event) => { height.value = event.nativeEvent.layout.height; }} style={[{ minHeight, justifyContent: tall ? 'flex-end' : undefined, backgroundColor: imageColor ?? '#64717b' }, collapse]}>
    {/* The photo starts below the status bar zone, like web, where Safari owns that zone. */}
    {imageUrl && <Image source={{ uri: imageUrl }} contentFit="cover" contentPosition="top" style={{ position: 'absolute', top: insets.top, left: 0, right: 0, bottom: 0 }} accessibilityElementsHidden />}
    <View style={{ position: 'absolute', top: insets.top, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,20,30,0.24)' }} />
    <LinearGradient pointerEvents="none" colors={[255, 204, 128, 51, 0].map((alpha) => `${imageColor ?? '#64717b'}${alpha.toString(16).padStart(2, '0')}`) as [string, string, ...string[]]} locations={[0, 0.25, 0.5, 0.75, 1]} style={{ position: 'absolute', top: insets.top, left: 0, right: 0, height: HERO_FADE }} />
    <View style={{ height: insets.top + 56 }} />
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
