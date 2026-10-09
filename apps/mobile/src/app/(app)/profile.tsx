import { router } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Copy, ErrorNotice, Icon, Skeleton, colors, styles, type IconName } from '@/components/chat-ui';
import { ConversationHeader } from '@/components/conversation-header';
import { useChat } from '@/providers/chat-provider';

const info = (title: string, detail: string) => () => Alert.alert(title, detail);
const actions: { label: string; accessibilityLabel: string; icon: IconName; onPress: () => void }[] = [
  { label: 'Edit', accessibilityLabel: 'Edit profile', icon: 'edit', onPress: () => router.push('/edit-profile') },
  { label: 'Settings', accessibilityLabel: 'Settings', icon: 'settings', onPress: () => router.push('/settings') },
  { label: 'Privacy', accessibilityLabel: 'Privacy', icon: 'lock', onPress: info('Privacy', 'Only members of your current group can read its messages. Direct messages are shared with your accepted friends.') },
  { label: 'Help', accessibilityLabel: 'Help & Feedback', icon: 'help', onPress: info('Help & Feedback', 'Tap the scan button at the bottom of Chats to scan a QR code, then join the group. Camera access can be enabled in your device settings.') },
];
export default function ProfileScreen() {
  const chat = useChat();
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.paper }}>
    <ConversationHeader title={chat.session?.name || 'Your profile'} subtitle="QR Chat member" imageUrl={chat.session?.avatarUrl} belowSafeArea onBack={() => router.back()} />
    <View style={styles.profileSurface}>
      <ErrorNotice message={chat.error} retry={() => { void chat.refresh().catch(() => {}); }} />
      {!chat.ready && !chat.error ? <Skeleton profile /> : <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
        {actions.map((action) => <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.accessibilityLabel} onPress={action.onPress}
          style={({ pressed }) => ({ alignItems: 'center', gap: 8, minWidth: 64, opacity: pressed ? 0.7 : 1 })}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}><Icon name={action.icon} size={24} /></View>
          <Copy selectable={false} style={{ fontSize: 13 }}>{action.label}</Copy>
        </Pressable>)}
      </View>}
    </View>
  </View>;
}
