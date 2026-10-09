import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, colors } from './chat-ui';
import { NativeAction } from './native-action';

export function ConversationHeader({ title, subtitle, imageUrl, settings, settingsLabel, disabled, browse, onBack, belowSafeArea }: { title: string; subtitle?: string; imageUrl?: string | null; settings?: () => void; browse?: () => void; onBack?: () => void; settingsLabel?: string; disabled?: boolean; belowSafeArea?: boolean }) {
  const insets = useSafeAreaInsets();
  // The photo starts below the status bar. belowSafeArea: it fills half the screen with the name at the bottom.
  const screenHeight = useWindowDimensions().height;
  const hero = belowSafeArea ? Math.round(screenHeight * 0.5) : 170;
  return <>
  <Stack.Screen options={{ statusBarStyle: 'dark' }} />
  <View style={{ height: insets.top }} />
  <View style={[{ minHeight: hero, backgroundColor: '#64717b' }, belowSafeArea && { height: hero }]}>
    {imageUrl && <Image source={{ uri: imageUrl }} contentFit="cover" contentPosition="top" style={{ position: 'absolute', inset: 0 }} accessibilityElementsHidden />}
    <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10,20,30,0.24)' }} />
    <View style={{ height: 56 }} />
    <View style={[{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 34, gap: 6 }, belowSafeArea && { flex: 1, justifyContent: 'flex-end', paddingBottom: 58 }]}>
      <Copy selectable={false} accessibilityRole="header" numberOfLines={2} ellipsizeMode="tail" style={{ color: '#fff', fontSize: 30, lineHeight: 36, fontWeight: '600', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 8 }}>{title}</Copy>
      {subtitle && <Copy style={{ color: '#fff', fontSize: 14 }}>{subtitle}</Copy>}
    </View>
  </View>
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

/** Plain top bar for chats: back, title, optional actions. */
export function ChatBar({ title, subtitle, settings, settingsLabel, disabled, browse }: { title: string; subtitle?: string; settings?: () => void; browse?: () => void; settingsLabel?: string; disabled?: boolean }) {
  const insets = useSafeAreaInsets();
  return <>
    <Stack.Screen options={{ statusBarStyle: 'dark' }} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: insets.top + 4, paddingBottom: 4, paddingHorizontal: 12, backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <View style={{ minWidth: 96, alignItems: 'flex-start' }}><NativeAction icon="back" accessibilityLabel="Back to chats" onPress={() => router.dismissTo('/')} /></View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Copy selectable={false} accessibilityRole="header" numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 18, lineHeight: 24, fontWeight: '600' }}>{title}</Copy>
        {subtitle && <Copy style={{ fontSize: 12 }}>{subtitle}</Copy>}
      </View>
      <View style={{ minWidth: 96, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        {browse && <NativeAction icon="browser" accessibilityLabel="Open venue page" onPress={browse} />}
        {settings && <NativeAction icon="settings" accessibilityLabel={settingsLabel ?? 'Settings'} disabled={disabled} onPress={settings} />}
      </View>
    </View>
  </>;
}
