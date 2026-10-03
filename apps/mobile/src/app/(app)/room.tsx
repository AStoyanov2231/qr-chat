import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { ConversationHeader } from '@/components/conversation-header';
import { GroupDetails } from '@/components/group-details';
import { SettingsSidebar } from '@/components/settings-sidebar';
import { router, Stack, useFocusEffect } from 'expo-router';
import { Conversation } from '@/components/conversation';
import { Button } from '@/components/chat-ui';
import { useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';
import { useRoomParams } from '@/hooks/use-room-params';

export default function RoomScreen() {
  const { groupId, name } = useRoomParams();
  const chat = useChat();
  const openGroup = chat.openGroup;
  useFocusEffect(useCallback(() => groupId ? openGroup(groupId) : undefined, [openGroup, groupId]));
  const { api, userId } = useAuth();
  const [sidebar, setSidebar] = useState(false);
  const [photo, setPhoto] = useState<{ code: string; url: string | null } | null>(null);
  const group = chat.group?.id === groupId ? chat.group : null;
  const title = group?.venue.name ?? (typeof name === 'string' ? name : 'Group');
  const code = group?.venue.codes[0];
  useEffect(() => {
    if (!api || !code) return;
    const controller = new AbortController();
    void api.resolveQrChatImage(code, controller.signal).then((url) => {
      if (!controller.signal.aborted) setPhoto({ code, url });
    });
    return () => controller.abort();
  }, [api, code]);
  async function sendMessage(body: string) {
    if (!api || !group) throw new Error('Your membership has ended.');
    return api.sendGroupMessage(group.id, body);
  }

  return <View style={{ flex: 1 }}>
    <Stack.Screen options={{ title, headerShown: false, statusBarStyle: 'light' }} />
    <ConversationHeader title={title} subtitle={`${group?.members.length ?? 0} ${group?.members.length === 1 ? 'member' : 'members'}`} imageUrl={group && photo?.code === code ? photo?.url : null} settingsLabel="Group settings" disabled={!group} settings={() => setSidebar(true)} />
    <Conversation
      composerLabel={`Message ${title}`}
      avatars key={groupId ?? 'ended'} messages={group?.messages ?? []} userId={userId!}
      loading={(!chat.ready || chat.groupLoading) && !chat.error} error={chat.error} available={!!group && chat.ready}
      connected={chat.connection === 'connected'} nextCursor={group?.nextCursor ?? null}
      loadOlder={chat.loadOlder} refresh={chat.refreshGroup} send={sendMessage}
      unavailable={chat.error ? 'Reconnect to open this conversation.' : 'Your membership has ended.'}
      canOpenProfile={(message) => !!group?.members.some((member) => member.id === message.user) || chat.friends.some((friend) => friend.user_a_id === message.user || friend.user_b_id === message.user)}
      openProfile={(message) => router.push(message.user === userId ? '/edit-profile' : { pathname: '/person/[id]', params: { id: message.user } })}
      endedAction={chat.ready && !group ? <Button label="Scan to rejoin" onPress={() => router.push('/scan')} /> : undefined}
    />
    {sidebar && group && <SettingsSidebar key={group.id} label="Group settings" onClose={() => setSidebar(false)}>{(close) => <GroupDetails group={group} onNavigate={close} />}</SettingsSidebar>}
  </View>;
}
