import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Alert, Linking, Pressable, View } from 'react-native';
import { Copy, ErrorNotice, Icon, Skeleton, colors, styles, type IconName } from '@/components/chat-ui';
import { ConversationHeader } from '@/components/conversation-header';
import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';
import { webOrigin } from '@/lib/supabase';

const info = (title: string, detail: string, policy = false) => () => Alert.alert(title, detail, [
  ...(policy && webOrigin ? [{ text: 'Read the full Privacy Policy', onPress: () => { void Linking.openURL(`${webOrigin.replace(/\/+$/u, '')}/privacy`).catch(() => {}); } }] : []),
  { text: 'OK' },
]);
type Action = { label: string; accessibilityLabel: string; icon: IconName; onPress: () => void };
const businessAction: Action = { label: 'Business', accessibilityLabel: 'Business', icon: 'business', onPress: () => router.push('/business') };
const actions: Action[] = [
  { label: 'Edit', accessibilityLabel: 'Edit profile', icon: 'edit', onPress: () => router.push('/edit-profile') },
  { label: 'Settings', accessibilityLabel: 'Settings', icon: 'settings', onPress: () => router.push('/settings') },
  { label: 'Privacy', accessibilityLabel: 'Privacy', icon: 'lock', onPress: info('Privacy', 'Group messages are available to members with active access. Your name and photo are visible to people in your group and your friends. Direct messages are shared with accepted friends. Each group’s access ends 24 hours after you join it; leaving a group also ends that access.', true) },
  { label: 'Help', accessibilityLabel: 'Help & Feedback', icon: 'help', onPress: info('Help & Feedback', 'Tap the scan button at the bottom of Chats to scan a QR code or a product barcode, then join the group. You can be in as many groups as you scan; each one lasts 24 hours. To keep talking after group access ends, open a member’s profile and send a friend request. If the camera is blocked, allow camera access in your device settings and try again.') },
];
export default function ProfileScreen() {
  const chat = useChat();
  const { api } = useAuth();
  const [business, setBusiness] = useState(false);
  // Lapsed owners keep their places, so owning one also opens the Business screen (same rule as web).
  useEffect(() => {
    void api?.isBusiness().then((plan) => plan && setBusiness(true), () => {});
    void api?.places().then((places) => places.length && setBusiness(true), () => {});
  }, [api]);
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>
    <ConversationHeader title={chat.session?.name || 'Your profile'} imageUrl={chat.session?.avatarUrl} belowSafeArea onBack={() => router.back()} />
    <View style={styles.profileSurface}>
      <ErrorNotice message={chat.error} retry={() => { void chat.refresh().catch(() => {}); }} />
      {!chat.ready && !chat.error ? <Skeleton profile /> : <View>
        {(business ? [...actions, businessAction] : actions).map((action) => <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.accessibilityLabel} onPress={action.onPress}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: pressed ? colors.fill : 'transparent' })}>
          <Icon name={action.icon} size={28} />
          <Copy selectable={false} style={{ fontWeight: '600' }}>{action.label}</Copy>
        </Pressable>)}
      </View>}
    </View>
  </View>;
}
