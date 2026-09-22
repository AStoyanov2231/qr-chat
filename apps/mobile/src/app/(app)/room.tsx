import { Alert, Pressable, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { codeKeySchema } from '@qr-chat/validation';
import { Conversation } from '@/components/conversation';
import { Button, Copy, ErrorNotice, Icon, TextButton, colors, styles, useAction } from '@/components/chat-ui';
import { useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';
import { useRoomParams } from '@/hooks/use-room-params';

export default function RoomScreen() {
  const { groupId, code, name } = useRoomParams();
  const chat = useChat();
  const { api, userId } = useAuth();
  const action = useAction();
  const group = chat.group?.id === groupId ? chat.group : null;
  const title = group?.venue.name ?? (typeof name === 'string' ? name : 'Group');
  const openMembers = () => router.push({ pathname: '/members', params: { groupId } });
  const leave = () => Alert.alert('Leave this group?', 'You can join again by scanning its QR code.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: () => { void action.run(async () => { await api!.leaveGroup(); await chat.refresh(); router.dismissTo('/chats'); }); } },
  ]);
  async function sendMessage(body: string) {
    if (!api || !group) throw new Error('Your membership has ended.');
    return api.sendGroupMessage(group.id, body);
  }

  return <>
    <Stack.Screen options={{
      title,
      headerTitle: () => <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${group?.members.length ?? 0} members`} disabled={!group} onPress={openMembers} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Copy numberOfLines={1} style={{ fontSize: 16, fontWeight: '600' }}>{title}</Copy>
        <Copy style={{ fontSize: 12, color: colors.muted }}>{group?.members.length ?? 0} members</Copy>
      </Pressable>,
      headerRight: () => group ? <TextButton label="Leave" disabled={action.busy} onPress={leave} /> : null,
    }} />
    <Conversation
      avatars key={groupId ?? 'ended'} messages={group?.messages ?? []} userId={userId!}
      loading={!chat.ready && !chat.error} error={chat.error} available={!!group && chat.ready}
      connected={chat.connection === 'connected'} nextCursor={group?.nextCursor ?? null}
      loadOlder={chat.loadOlder} refresh={chat.refresh} send={sendMessage}
      unavailable={chat.error ? 'Reconnect to open this conversation.' : 'Your membership has ended.'}
      intro={<View style={{ gap: 14, paddingTop: 12, paddingBottom: 20 }}>
        <View style={{ alignItems: 'center', gap: 14 }}>
          <View style={{ width: 64, height: 64, borderRadius: 15, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }}><Icon name="pin" size={28} /></View>
          <Copy accessibilityRole="header" style={[styles.subtitle, { textAlign: 'center' }]}>{title}</Copy>
          <Copy style={[styles.muted, { fontSize: 12, textAlign: 'center' }]}>A conversation for this QR code.</Copy>
        </View>
        {group && <TextButton label={`${group.members.length} members`} onPress={openMembers} />}
        <ErrorNotice message={action.error} />
      </View>}
      messageAction={(message) => group?.members.some((member) => member.id === message.user) ? <TextButton label="Add friend" disabled={action.busy || chat.friends.some((friend) => friend.user_a_id === message.user || friend.user_b_id === message.user)} onPress={() => { void action.run(async () => { await api!.requestFriend(message.user); await chat.refresh(); }); }} /> : null}
      endedAction={chat.ready && !group && codeKeySchema.safeParse(code).success ? <Button label="Rejoin conversation" onPress={() => router.push({ pathname: '/join', params: { code: code! } })} /> : undefined}
    />
  </>;
}
