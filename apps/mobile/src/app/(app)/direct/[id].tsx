import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { userIdSchema } from '@qr-chat/validation';
import { Conversation } from '@/components/conversation';
import { Avatar } from '@/components/avatar';
import { Copy, colors, styles } from '@/components/chat-ui';
import { useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';
import { useDirectMessages } from '@/hooks/use-direct-messages';

export default function DirectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chat = useChat();
  const { api, userId } = useAuth();
  const friend = userIdSchema.safeParse(id).success ? chat.friends.find((friend) => friend.id === id && friend.accepted_at) : undefined;
  const peer = friend?.user_a_id === userId ? friend.user_b : friend?.user_a;
  const direct = useDirectMessages(friend?.id ?? null);
  const peerName = peer?.display_name ?? 'Friend';
  const emptyState = direct.loading || (!chat.ready && !chat.error) ? undefined : direct.error || chat.error || !friend ? null : direct.messages.length === 0
    ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 }}>
      <Copy style={{ fontSize: 24, lineHeight: 30, fontWeight: '600', textAlign: 'center' }}>{`Say hello to ${peerName}`}</Copy>
      <Copy style={[styles.muted, { fontSize: 18, textAlign: 'center' }]}>Send your first message.</Copy>
    </View>
    : undefined;
  async function refresh() {
    await chat.refresh();
    await direct.refresh();
  }
  return <><Stack.Screen options={{ title: peerName, headerTitle: peer ? () => <Pressable accessibilityRole="button" accessibilityLabel={`View ${peerName}’s profile`} onPress={() => router.push({ pathname: '/person/[id]', params: { id: peer.id } })} style={[styles.row, { minHeight: 44 }]}><Avatar name={peerName} url={peer.avatar_url} size={34} /><View style={{ minWidth: 0, gap: 0 }}><Copy numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600' }}>{peerName}</Copy><Copy style={{ fontSize: 12, lineHeight: 16, color: colors.muted }}>Friend</Copy></View></Pressable> : undefined }} />
    <Conversation key={id} messages={direct.messages.map((message) => ({ id: String(message.id), user: message.sender_id ?? 'deleted', name: peerName, text: message.body, time: Date.parse(message.created_at) }))} userId={userId!} loading={(!chat.ready && !chat.error) || (!!friend && direct.loading)} error={chat.error || (friend ? direct.error : '')} available={!!friend && chat.ready} connected={direct.connection === 'connected'} nextCursor={direct.nextCursor} loadOlder={direct.loadOlder} refresh={refresh} send={(body) => api!.sendDirectMessage(id, body)} unavailable={chat.error ? 'Reconnect to open this conversation.' : 'This friendship is no longer available.'} emptyState={emptyState} composerLabel={`Message ${peerName}`} />
  </>;
}
