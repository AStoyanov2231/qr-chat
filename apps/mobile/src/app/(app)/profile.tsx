import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { Copy, ErrorNotice, Icon, Skeleton, colors, styles, type IconName } from '@/components/chat-ui';
import { ConversationHeader } from '@/components/conversation-header';
import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';

const info = (title: string, detail: string) => () => Alert.alert(title, detail);
type Action = { label: string; accessibilityLabel: string; icon: IconName; onPress: () => void };
const businessAction: Action = { label: 'Business', accessibilityLabel: 'Business', icon: 'business', onPress: () => router.push('/business') };
const actions: Action[] = [
  { label: 'Edit', accessibilityLabel: 'Edit profile', icon: 'edit', onPress: () => router.push('/edit-profile') },
  { label: 'Settings', accessibilityLabel: 'Settings', icon: 'settings', onPress: () => router.push('/settings') },
  { label: 'Privacy', accessibilityLabel: 'Privacy', icon: 'lock', onPress: info('Privacy', 'Only current members of a group can read its messages. Direct messages are shared with your accepted friends.') },
  { label: 'Help', accessibilityLabel: 'Help & Feedback', icon: 'help', onPress: info('Help & Feedback', 'Tap the scan button at the bottom of Chats to scan a QR code or a product barcode, then join the group. Camera access can be enabled in your device settings.') },
];
export default function ProfileScreen() {
  const chat = useChat();
  const { api } = useAuth();
  const [business, setBusiness] = useState(false);
  useEffect(() => { void api?.isBusiness().then(setBusiness, () => {}); }, [api]);
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>
    <ConversationHeader title={chat.session?.name || 'Your profile'} imageUrl={chat.session?.avatarUrl} belowSafeArea onBack={() => router.back()} />
    <View style={styles.profileSurface}>
      <ErrorNotice message={chat.error} retry={() => { void chat.refresh().catch(() => {}); }} />
      {!chat.ready && !chat.error ? <Skeleton profile /> : <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
        {(business ? [...actions, businessAction] : actions).map((action) => <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.accessibilityLabel} onPress={action.onPress}
          style={({ pressed }) => ({ alignItems: 'center', gap: 6, minWidth: 64, paddingVertical: 8, transform: [{ scale: pressed ? 1.08 : 1 }] })}>
          <Icon name={action.icon} size={28} />
          <Copy selectable={false} style={{ fontSize: 12, lineHeight: 16, fontWeight: '700' }}>{action.label}</Copy>
        </Pressable>)}
      </View>}
    </View>
  </View>;
}
