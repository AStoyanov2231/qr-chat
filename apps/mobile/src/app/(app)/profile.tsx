import { useState } from 'react';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Alert, Pressable, View } from 'react-native';
import { Copy, ErrorNotice, Icon, IconButton, Screen, Skeleton, colors, styles, type IconName } from '@/components/chat-ui';
import { useChat } from '@/providers/chat-provider';

const rows: { label: string; icon: IconName; detail: string }[] = [
  { label: 'Privacy', icon: 'lock', detail: 'Only members of your current group can read its messages. Direct messages are shared with your accepted friends.' },
  { label: 'Help & Feedback', icon: 'help', detail: 'Tap the scan button at the bottom of Chats to scan a QR code, then join the group. Camera access can be enabled in your device settings.' },
];
export default function ProfileScreen() {
  const chat = useChat();
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  return <Screen>
    <View style={{ alignItems: 'flex-end' }}><IconButton name="settings" label="Settings" onPress={() => router.push('/settings')} /></View>
    <ErrorNotice message={chat.error} retry={() => { void chat.refresh().catch(() => {}); }} />
    {!chat.ready && !chat.error ? <Skeleton profile /> : <>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <View><View style={{ width: 130, height: 130, borderRadius: 65, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {chat.session?.avatarUrl && chat.session.avatarUrl !== failedAvatar ? <Image source={chat.session.avatarUrl} style={{ width: 130, height: 130 }} onError={() => setFailedAvatar(chat.session?.avatarUrl ?? null)} /> : <Icon name="user" size={65} color="#60718b" />}
        </View><View style={{ position: 'absolute', right: -6, bottom: -2, backgroundColor: colors.paper, borderRadius: 24 }}><IconButton name="edit" label="Edit profile" onPress={() => router.push('/edit-profile')} /></View></View>
        <Copy style={{ fontSize: 27, lineHeight: 35, fontWeight: '600', textAlign: 'center' }}>{chat.session?.name || 'Your profile'}</Copy><Copy style={styles.muted}>QR Chat member</Copy>
      </View>
      <View style={{ paddingVertical: 14, alignItems: 'center', gap: 4 }}><Copy style={styles.muted}>Current group</Copy><Copy style={{ fontWeight: '600', textAlign: 'center' }}>{chat.group?.venue.name || 'No active group'}</Copy></View>
      <Pressable accessibilityRole="button" onPress={() => router.push('/edit-profile')} style={[styles.panel, styles.row, { paddingVertical: 16 }]}><Icon name="user" /><Copy style={{ flex: 1 }}>Edit Profile</Copy><Icon name="chevron" size={18} /></Pressable>
      <View style={styles.panel}>{rows.map((row, index) => <Pressable key={row.label} accessibilityRole="button" onPress={() => Alert.alert(row.label, row.detail)} style={[styles.row, { minHeight: 58, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderColor: colors.line }]}><Icon name={row.icon} /><Copy style={{ flex: 1 }}>{row.label}</Copy><Icon name="chevron" size={18} /></Pressable>)}</View>
    </>}
  </Screen>;
}
