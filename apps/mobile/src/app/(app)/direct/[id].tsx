import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { userIdSchema } from '@qr-chat/validation';
import { Conversation } from '@/components/conversation';
import { ChatBar } from '@/components/conversation-header';
import { Avatar } from '@/components/avatar';
import { Button, Copy, ErrorNotice, TextButton, styles, useAction } from '@/components/chat-ui';
import { useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';
import { useDirectMessages } from '@/hooks/use-direct-messages';

export default function DirectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chat = useChat();
  const { api, userId } = useAuth();
  const action = useAction();
  const link = userIdSchema.safeParse(id).success ? chat.friends.find((friend) => friend.id === id) : undefined;
  const friend = link?.accepted_at ? link : undefined;
  const request = link && !link.accepted_at && link.requested_by_id !== userId ? link : undefined;
  const peer = link?.user_a_id === userId ? link.user_b : link?.user_a;
  const direct = useDirectMessages(friend?.id ?? null);
  const peerName = peer?.display_name ?? 'Friend';
  const messages = direct.messages.map((message) => {
    const own = message.sender_id !== null && message.sender_id === userId;
    const peerSender = message.sender_id !== null && message.sender_id === peer?.id;
    return {
      id: String(message.id),
      user: message.sender_id ?? 'deleted',
      name: own ? chat.session?.name?.trim() || 'You' : peerSender ? peerName : 'Former participant',
      avatarUrl: own ? chat.session?.avatarUrl ?? null : peerSender ? peer?.avatar_url ?? null : null,
      text: message.body,
      time: Date.parse(message.created_at),
    };
  });
  const emptyState = direct.loading || (!chat.ready && !chat.error) ? undefined : direct.error || chat.error || !friend ? null : direct.messages.length === 0
    ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 }}>
      <Copy style={{ fontSize: 20, lineHeight: 26, fontWeight: '700', textAlign: 'center' }}>{`Say hello to ${peerName}`}</Copy>
      <Copy style={[styles.muted, { textAlign: 'center' }]}>Send your first message.</Copy>
    </View>
    : undefined;
  async function refresh() {
    if (chat.error || !chat.ready) await chat.refresh();
    await direct.refresh();
  }
  if (request) return <View style={{ flex: 1 }}><Stack.Screen options={{ title: peerName, headerShown: false }} />
    <ChatBar title={peerName} />
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
      <Avatar name={peerName} url={peer?.avatar_url} size={72} />
      <Copy style={{ fontSize: 20, lineHeight: 26, fontWeight: '700', textAlign: 'center' }}>{`${peerName} wants to be friends`}</Copy>
      <Copy style={[styles.muted, { textAlign: 'center' }]}>Accept to start a private conversation.</Copy>
      <ErrorNotice message={action.error} />
      <Button label={action.busy ? 'Updating…' : 'Accept'} disabled={action.busy || !chat.ready} onPress={() => { void action.run(async () => { await api!.acceptFriend(request.id); await chat.refresh(); }); }} />
      <TextButton label="Decline" disabled={action.busy || !chat.ready} onPress={() => { void action.run(async () => { await api!.removeFriend(request.id); await chat.refresh(); router.back(); }); }} />
    </View>
  </View>;
  return <View style={{ flex: 1 }}><Stack.Screen options={{ title: peerName, headerShown: false }} />
    <ChatBar title={peerName} subtitle={direct.connection === 'connected' ? undefined : 'Reconnecting…'} />
    <Conversation
      key={id}
      conversation={`d:${id}`}
      avatars
      messages={messages}
      userId={userId!}
      loading={(!chat.ready && !chat.error) || (!!friend && direct.loading)}
      error={chat.error || (friend ? direct.error : '')}
      available={!!friend && chat.ready}
      connected={direct.connection === 'connected'}
      nextCursor={direct.nextCursor}
      loadOlder={direct.loadOlder}
      refresh={refresh}
      send={(body, clientId) => api!.sendDirectMessage(id, body, clientId)}
      unavailable={chat.error ? 'Reconnect to open this conversation.' : 'This friendship is no longer available.'}
      emptyState={emptyState}
      composerLabel={`Message ${peerName}`}
      canOpenProfile={(message) => message.user === userId || message.user === peer?.id}
      openProfile={(message) => router.push(message.user === userId ? '/edit-profile' : { pathname: '/person/[id]', params: { id: message.user } })}
    />

  </View>;
}
