import { router } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { Copy, ErrorNotice, Icon, IconButton, Screen, Skeleton, colors, styles } from '@/components/chat-ui';
import { useChat } from '@/providers/chat-provider';

export default function HomeScreen() {
  const chat = useChat();
  const scan = () => router.push('/scan');
  return <Screen contentContainerStyle={{ gap: 12, paddingBottom: 20 }}>
    <View style={{ alignItems: 'flex-end' }}><IconButton name="bell" label="Notifications" onPress={() => Alert.alert('Notifications', 'Group messages appear live while the chat is open. Push notifications are not available yet.')} /></View>
    <ErrorNotice message={chat.error} retry={() => { void chat.refresh().catch(() => {}); }} />
    {!chat.ready && !chat.error ? <Skeleton view="home" /> : <>
      <View style={{ paddingHorizontal: 10, gap: 12 }}><Copy style={{ fontSize: 44, lineHeight: 46, letterSpacing: -1.65, fontWeight: '700' }}>{'Scan.\nJoin.\nChat.'}</Copy><Copy style={{ color: colors.muted, fontSize: 19, lineHeight: 25 }}>{'Turn any QR code into\na group chat.'}</Copy></View>
      <View style={{ alignItems: 'center', gap: 22, paddingVertical: 24 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Scan a QR code" disabled={!chat.ready} accessibilityState={{ disabled: !chat.ready }} onPress={scan} style={({ pressed }) => ({ width: 145, height: 145, borderRadius: 73, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink, opacity: pressed ? 0.8 : 1, boxShadow: '0 18px 42px #a5bde666' })}><Icon name="scan" size={66} color="#fff" /></Pressable>
        <Copy style={styles.muted}>Tap to scan</Copy>
      </View>
      <Pressable accessibilityRole="button" onPress={scan} disabled={!chat.ready} style={[styles.row, { marginTop: 'auto', paddingVertical: 19, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#f2f3f5' }]}>
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#edeef0', justifyContent: 'center', alignItems: 'center' }}><Icon name="light" size={29} /></View><Copy style={{ flex: 1, fontSize: 13, lineHeight: 20 }}>See a QR code at a café, venue or event? Scan it and start chatting with people around you.</Copy><Icon name="chevron" size={18} color="#9298a3" />
      </Pressable>
    </>}
  </Screen>;
}
