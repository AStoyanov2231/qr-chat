import { Stack, useLocalSearchParams } from 'expo-router';
import { userIdSchema } from '@qr-chat/validation';
import { Conversation } from '@/components/conversation';
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
  async function refresh() {
    await chat.refresh();
    await direct.refresh();
  }
  return <><Stack.Screen options={{ title: peer?.display_name ?? 'Direct message' }} />
    <Conversation key={id} messages={direct.messages.map((message) => ({ id: String(message.id), user: message.sender_id ?? 'deleted', name: peer?.display_name ?? 'Friend', text: message.body, time: Date.parse(message.created_at) }))} userId={userId!} loading={(!chat.ready && !chat.error) || (!!friend && direct.loading)} error={chat.error || (friend ? direct.error : '')} available={!!friend && chat.ready} connected={direct.connection === 'connected'} nextCursor={direct.nextCursor} loadOlder={direct.loadOlder} refresh={refresh} send={(body) => api!.sendDirectMessage(id, body)} unavailable={chat.error ? 'Reconnect to open this conversation.' : 'This friendship is no longer available.'} />
  </>;
}
