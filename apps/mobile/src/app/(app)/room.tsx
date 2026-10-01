import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConversationHeader } from '@/components/conversation-header';
import { GroupDetails } from '@/components/group-details';
import { router, Stack } from 'expo-router';
import { Conversation } from '@/components/conversation';
import { Button, Icon } from '@/components/chat-ui';
import { useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';
import { useRoomParams } from '@/hooks/use-room-params';

export default function RoomScreen() {
  const { groupId, name } = useRoomParams();
  const chat = useChat();
  const { api, userId } = useAuth();
  const [sidebar, setSidebar] = useState(false);
  const [photo, setPhoto] = useState<{ code: string; url: string | null } | null>(null);
  const insets = useSafeAreaInsets();
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
    <ConversationHeader title={title} subtitle={`${group?.members.length ?? 0} members`} imageUrl={group && photo?.code === code ? photo?.url : null} settingsLabel="Group settings" disabled={!group} settings={() => setSidebar(true)} />
    <Conversation
      composerLabel={`Message ${title}`}
      avatars key={groupId ?? 'ended'} messages={group?.messages ?? []} userId={userId!}
      loading={!chat.ready && !chat.error} error={chat.error} available={!!group && chat.ready}
      connected={chat.connection === 'connected'} nextCursor={group?.nextCursor ?? null}
      loadOlder={chat.loadOlder} refresh={chat.refresh} send={sendMessage}
      unavailable={chat.error ? 'Reconnect to open this conversation.' : 'Your membership has ended.'}
      canOpenProfile={(message) => !!group?.members.some((member) => member.id === message.user) || chat.friends.some((friend) => friend.user_a_id === message.user || friend.user_b_id === message.user)}
      openProfile={(message) => router.push(message.user === userId ? '/edit-profile' : { pathname: '/person/[id]', params: { id: message.user } })}
      endedAction={chat.ready && !group ? <Button label="Scan to rejoin" onPress={() => router.push('/scan')} /> : undefined}
    />
    <Modal transparent visible={sidebar && !!group} animationType="fade" onRequestClose={() => setSidebar(false)}>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: 'rgba(15,25,35,0.08)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close group settings" onPress={() => setSidebar(false)} style={{ flex: 1 }} />
        <View style={{ width: '72%', maxWidth: 350, overflow: 'hidden', backgroundColor: isGlassEffectAPIAvailable() ? 'rgba(250,251,253,0.55)' : 'rgba(250,251,253,0.94)', paddingTop: insets.top + 8, paddingBottom: insets.bottom, borderTopLeftRadius: 28, borderBottomLeftRadius: 28 }}>
          {isGlassEffectAPIAvailable() && <GlassView glassEffectStyle="regular" colorScheme="light" style={{ position: 'absolute', inset: 0 }} />}
          <Pressable accessibilityRole="button" accessibilityLabel="Close group settings" onPress={() => setSidebar(false)} style={{ width: 44, height: 44, alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}><Icon name="close" size={20} /></Pressable>
          <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 20 }}>
            {group && <GroupDetails group={group} onNavigate={() => setSidebar(false)} />}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
