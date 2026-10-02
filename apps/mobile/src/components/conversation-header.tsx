import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, Icon } from './chat-ui';

export function ConversationHeader({ title, subtitle, imageUrl, settings, settingsLabel, disabled }: { title: string; subtitle: string; imageUrl?: string | null; settings: () => void; settingsLabel: string; disabled?: boolean }) {
  const insets = useSafeAreaInsets();
  return <View style={{ height: 170 + insets.top, backgroundColor: '#64717b' }}>
    {imageUrl && <Image source={{ uri: imageUrl }} contentFit="cover" style={{ position: 'absolute', inset: 0 }} accessibilityElementsHidden />}
    <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10,20,30,0.24)' }} />
    {imageUrl && insets.top > 0 && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, overflow: 'hidden' }}>
      <Image source={{ uri: imageUrl }} contentFit="cover" blurRadius={16} style={{ width: '100%', height: 170 + insets.top }} accessibilityElementsHidden />
      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10,20,30,0.24)' }} />
    </View>}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: insets.top + 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to chats" onPress={() => router.dismissTo('/')} style={circle}><Icon name="back" size={22} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={settingsLabel} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={settings} style={[circle, { opacity: disabled ? 0.5 : 1 }]}><Icon name="settings" size={23} /></Pressable>
    </View>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 30, gap: 6 }}>
      <Copy accessibilityRole="header" numberOfLines={2} style={{ color: '#fff', fontSize: 30, lineHeight: 36, fontWeight: '600', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 8 }}>{title}</Copy>
      <Copy style={{ color: '#fff', fontSize: 14 }}>{subtitle}</Copy>
    </View>
  </View>;
}
const circle = { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center' as const, justifyContent: 'center' as const };
