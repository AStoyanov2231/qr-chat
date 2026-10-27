import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';
import { userIdSchema } from '@qr-chat/validation';
import { messageAge } from '@qr-chat/domain';
import { Conversation } from '@/components/conversation';
import { ChatBar } from '@/components/conversation-header';
import { Avatar } from '@/components/avatar';
import { Button, Copy, ErrorNotice, TextButton, colors, shadowFloat, styles, useAction } from '@/components/chat-ui';
import { useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';
import { useDirectMessages } from '@/hooks/use-direct-messages';
import { notify } from '@/lib/notice';

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
  if (request) {
    const sentAge = messageAge(Date.parse(request.requested_at));
    const respond = (mutation: () => Promise<unknown>, done: string, leave = true) => { void action.run(async () => { await mutation(); await chat.refresh(); notify(done); if (leave) router.back(); }); };
    const disabled = action.busy || !chat.ready;
    return <View style={{ flex: 1 }}><Stack.Screen options={{ title: peerName, headerShown: false }} />
      <ChatBar title={peerName} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 20 }}>
        <Avatar name={peerName} url={peer?.avatar_url} size={88} />
        <Copy style={{ marginTop: 8, fontSize: 20, lineHeight: 26, fontWeight: '700', textAlign: 'center' }}>{peerName}</Copy>
        <Copy style={[styles.muted, { fontSize: 14, lineHeight: 20, textAlign: 'center' }]}>{`Wants to be friends · ${sentAge === 'Now' ? 'just now' : `${sentAge} ago`}`}</Copy>
      </View>
      <View accessibilityLabel="Respond to friend request" style={{ gap: 12, margin: 12, padding: 16, paddingBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 24, backgroundColor: colors.surface, boxShadow: shadowFloat }}>
        <Copy style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', textAlign: 'center' }}>{`Let ${peerName} message you?`}</Copy>
        <Copy style={[styles.muted, { fontSize: 14, lineHeight: 20, textAlign: 'center' }]}>Accept to start chatting. Declining removes the request.</Copy>
        <ErrorNotice message={action.error} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button label="Decline" subtle disabled={disabled} onPress={() => respond(() => api!.removeFriend(request.id), `Declined ${peerName}’s friend request.`)} /></View>
          <View style={{ flex: 1 }}><Button label={action.busy ? 'Updating…' : 'Accept'} disabled={disabled} onPress={() => respond(() => api!.acceptFriend(request.id), `You and ${peerName} are now friends.`, false)} /></View>
        </View>
        <TextButton label={`Block ${peerName}`} danger disabled={disabled} onPress={() => Alert.alert(`Block ${peerName}?`, 'They won’t be able to send you friend requests.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Block', style: 'destructive', onPress: () => respond(() => api!.blockFriend(request.id), `Blocked ${peerName}.`) },
        ])} />
      </View>
    </View>;
  }
  return <View style={{ flex: 1 }}><Stack.Screen options={{ title: peerName, headerShown: false }} />
    <ChatBar title={peerName} />
    <Conversation
      key={id}
      conversation={`d:${id}`}
      avatars
      messages={messages}
      userId={userId!}
      loading={(!chat.ready && !chat.error) || (!!friend && direct.loading)}
      error={chat.error || (friend ? direct.error : '')}
      available={!!friend && chat.ready}
      nextCursor={direct.nextCursor}
      loadOlder={direct.loadOlder}
      refresh={refresh}
      send={(body, clientId) => api!.sendDirectMessage(id, body, clientId)}
      unavailable={chat.error ? 'Reconnect to open this conversation.' : 'This friendship is no longer available.'}
      emptyState={emptyState}
      composerLabel={`Message ${peerName}`}
      canOpenProfile={(message) => message.user === userId || message.user === peer?.id}
      openProfile={(message) => router.push(message.user === userId ? '/profile' : { pathname: '/person/[id]', params: { id: message.user } })}
    />

  </View>;
}
