import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { venueLink } from '@qr-chat/domain';
import { ChatBar } from '@/components/conversation-header';
import { GroupDetails } from '@/components/group-details';
import { SettingsSidebar } from '@/components/settings-sidebar';
import { router, Stack, useFocusEffect } from 'expo-router';
import { Conversation } from '@/components/conversation';
import { Button, ErrorNotice, Field, useAction } from '@/components/chat-ui';
import { errorMessage, useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';
import { useRoomParams } from '@/hooks/use-room-params';
import { webOrigin } from '@/lib/supabase';
import { ChatBrowser } from '../../../modules/chat-browser';

export default function RoomScreen() {
  const { groupId, code: routeCode, name } = useRoomParams();
  const chat = useChat();
  const openGroup = chat.openGroup;
  useFocusEffect(useCallback(() => groupId ? openGroup(groupId) : undefined, [openGroup, groupId]));
  const { api, userId } = useAuth();
  const [sidebar, setSidebar] = useState(false);
  const [productName, setProductName] = useState('');
  const naming = useAction();
  const group = chat.groups.find((item) => item.id === groupId) ?? null;
  const unnamedProduct = !!group?.venue.nameMissing && !!group.venue.codes[0]?.startsWith('gtin:');
  const groupError = group ? chat.groupErrors[group.id] : '';
  const title = group?.venue.name ?? (typeof name === 'string' ? name : 'Group');
  const link = process.env.EXPO_OS !== 'web' && ChatBrowser ? venueLink(group?.venue ?? { id: '', name: title, label: '', kind: 'place', codes: typeof routeCode === 'string' ? [routeCode] : [] }, webOrigin) : null;
  const browse = link ? () => { void ChatBrowser?.open(link, title).catch(() => {}); } : undefined;
  async function sendMessage(body: string, clientId: string) {
    if (!api || !group) throw new Error('Your membership has ended.');
    return api.sendGroupMessage(group.id, body, clientId);
  }

  return <View style={{ flex: 1 }}>
    <Stack.Screen options={{ title, headerShown: false }} />
    <ChatBar title={title} settingsLabel="Group members" members={group?.members.length} disabled={!group} settings={() => setSidebar(true)}
      browse={browse} />
    {unnamedProduct && <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
      <Field label="We couldn’t find this product. Name it for everyone who scans it:" value={productName} onChangeText={setProductName} maxLength={100} editable={!naming.busy} />
      <ErrorNotice message={naming.error} />
      <Button label="Save" disabled={naming.busy || !productName.trim()} onPress={() => { void naming.run(async () => { await api!.nameProductGroup(group!.id, productName); setProductName(''); await chat.refresh(); }); }} />
    </View>}
    <Conversation
      composerLabel={`Message ${title}`}
      avatars key={groupId ?? 'ended'} conversation={`g:${groupId}`} messages={group?.messages ?? []} userId={userId!}
      loading={(!chat.ready || chat.groupLoading) && !chat.error} error={chat.error || (groupError ? errorMessage(new Error(groupError)) : '')} available={!!group && chat.ready}
      nextCursor={group?.nextCursor ?? null}
      loadOlder={() => group ? chat.loadOlder(group.id) : Promise.resolve()} refresh={() => groupId ? chat.refreshGroup(groupId) : chat.refresh()} send={sendMessage}
      unavailable={chat.error ? 'Reconnect to open this conversation.' : 'Your membership has ended.'}
      canOpenProfile={(message) => !!group?.members.some((member) => member.id === message.user) || chat.friends.some((friend) => friend.user_a_id === message.user || friend.user_b_id === message.user)}
      ownerId={group?.venue.place?.ownerId}
      openProfile={(message) => router.push(message.user === userId ? '/profile' : { pathname: '/person/[id]', params: { id: message.user } })}
      endedAction={chat.ready && !group ? <Button label="Scan to rejoin" onPress={() => router.push('/scan')} /> : undefined}
    />
    {sidebar && group && <SettingsSidebar key={group.id} label="Group members" onClose={() => setSidebar(false)}>{(close) => <GroupDetails group={group} onNavigate={close} />}</SettingsSidebar>}
  </View>;
}
