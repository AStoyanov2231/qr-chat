import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useCallback, useEffect, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConversationHeader } from '@/components/conversation-header';
import { GroupDetails } from '@/components/group-details';
import { router, Stack, useFocusEffect } from 'expo-router';
import { Conversation } from '@/components/conversation';
import { Button, Icon } from '@/components/chat-ui';
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
  const [sidebarProgress] = useState(() => new Animated.Value(1));
  const { width } = useWindowDimensions();
  const sidebarWidth = Math.min(width * 0.72, 350);
  const reduceMotion = useReducedMotion();
  function openSidebar() {
    sidebarProgress.setValue(1);
    setSidebar(true);
  }
  function closeSidebar() {
    Animated.timing(sidebarProgress, { toValue: 1, duration: reduceMotion ? 0 : 240, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setSidebar(false);
    });
  }
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
    <ConversationHeader title={title} subtitle={`${group?.members.length ?? 0} ${group?.members.length === 1 ? 'member' : 'members'}`} imageUrl={group && photo?.code === code ? photo?.url : null} settingsLabel="Group settings" disabled={!group} settings={openSidebar} />
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
    <Modal transparent visible={sidebar && !!group} animationType="none" onShow={() => Animated.timing(sidebarProgress, { toValue: 0, duration: reduceMotion ? 0 : 240, useNativeDriver: true }).start()} onRequestClose={closeSidebar}>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: 'rgba(15,25,35,0.08)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close group settings" onPress={closeSidebar} style={{ flex: 1 }} />
        <Animated.View style={{ width: sidebarWidth, transform: [{ translateX: sidebarProgress.interpolate({ inputRange: [0, 1], outputRange: [0, sidebarWidth] }) }], overflow: 'hidden', backgroundColor: isGlassEffectAPIAvailable() ? 'rgba(250,251,253,0.55)' : 'rgba(250,251,253,0.94)', paddingTop: insets.top + 8, paddingBottom: insets.bottom, borderTopLeftRadius: 28, borderBottomLeftRadius: 28 }}>
          {isGlassEffectAPIAvailable() && <GlassView glassEffectStyle="regular" colorScheme="light" style={{ position: 'absolute', inset: 0 }} />}
          <Pressable accessibilityRole="button" accessibilityLabel="Close group settings" onPress={closeSidebar} style={{ width: 44, height: 44, alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}><Icon name="close" size={20} /></Pressable>
          <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 20 }}>
            {group && <GroupDetails group={group} onNavigate={closeSidebar} />}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  </View>;
}
