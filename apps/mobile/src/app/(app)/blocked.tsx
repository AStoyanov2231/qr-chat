import { View } from 'react-native';
import { Copy, ErrorNotice, Screen, TextButton, styles, useAction } from '@/components/chat-ui';
import { Avatar } from '@/components/avatar';
import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';

export default function BlockedScreen() {
  const chat = useChat();
  const { api } = useAuth();
  const action = useAction();
  return <Screen>
    <ErrorNotice message={action.error || chat.error} />
    {chat.blocked.length ? chat.blocked.map((person) => <View key={person.id} style={[styles.row, { minHeight: 60, paddingVertical: 8 }]}>
      <Avatar name={person.name} url={person.avatarUrl} size={44} /><Copy style={{ flex: 1, fontSize: 16 }}>{person.name}</Copy>
      <TextButton label="Unblock" disabled={action.busy || !chat.ready} onPress={() => { void action.run(async () => { await api!.unblockUser(person.id); await chat.refresh(); }); }} />
    </View>) : <Copy style={styles.muted}>You haven’t blocked anyone.</Copy>}
  </Screen>;
}
