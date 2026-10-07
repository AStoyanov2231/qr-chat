import { Image } from 'expo-image';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy } from './chat-ui';
import { NativeAction } from './native-action';

export function ConversationHeader({ title, subtitle, imageUrl, settings, settingsLabel, disabled }: { title: string; subtitle?: string; imageUrl?: string | null; settings?: () => void; settingsLabel?: string; disabled?: boolean }) {
  const insets = useSafeAreaInsets();
  return <View style={{ minHeight: 170 + insets.top, backgroundColor: '#64717b' }}>
    {imageUrl && <Image source={{ uri: imageUrl }} contentFit="cover" style={{ position: 'absolute', inset: 0 }} accessibilityElementsHidden />}
    <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10,20,30,0.24)' }} />
    {imageUrl && insets.top > 0 && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, overflow: 'hidden' }}>
      <Image source={{ uri: imageUrl }} contentFit="cover" blurRadius={16} style={{ width: '100%', height: 170 + insets.top }} accessibilityElementsHidden />
      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10,20,30,0.24)' }} />
    </View>}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: insets.top + 12 }}>
      <NativeAction icon="back" accessibilityLabel="Back to chats" onPress={() => router.dismissTo('/')} />
      {settings && <NativeAction icon="settings" accessibilityLabel={settingsLabel ?? 'Settings'} disabled={disabled} onPress={settings} />}
    </View>
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 34, gap: 6 }}>
      <Copy selectable={false} accessibilityRole="header" numberOfLines={2} ellipsizeMode="tail" style={{ color: '#fff', fontSize: 30, lineHeight: 36, fontWeight: '600', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 8 }}>{title}</Copy>
      {subtitle && <Copy style={{ color: '#fff', fontSize: 14 }}>{subtitle}</Copy>}
    </View>
  </View>;
}
