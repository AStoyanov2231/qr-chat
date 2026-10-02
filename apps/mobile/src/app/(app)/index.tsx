import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';
import type { ChatSnapshot } from '@qr-chat/api';
import { directConversationTime, directMessagePreview, groupAccessIndicator, groupInitials, messageAge } from '@qr-chat/domain';
import { Avatar } from '@/components/avatar';
import { Copy, Icon, Skeleton, colors, styles, useAction } from '@/components/chat-ui';
import { NativeAction } from '@/components/native-action';
import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';
import { roomRoute } from '@/lib/room-route';

function useGroupAccessCountdown(expiresAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  const countdown = groupAccessIndicator(expiresAt, now);

  useEffect(() => {
    let current = true;
    const update = () => { if (current) setNow(Date.now()); };
    const immediateUpdate = setTimeout(update, 0);
    if (groupAccessIndicator(expiresAt).state !== 'remaining') return () => { current = false; clearTimeout(immediateUpdate); };
    const interval = setInterval(update, 60_000);
    return () => { current = false; clearTimeout(immediateUpdate); clearInterval(interval); };
  }, [expiresAt, countdown.state]);

  return countdown;
}

function GroupAccessRing({ name, indicator }: { name: string; indicator: ReturnType<typeof groupAccessIndicator> }) {
  const segmentCount = 120;
  const center = 26;
  const radius = 33 * 52 / 72;
  const segmentSize = 3 * 52 / 72;
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={homeStyles.groupIdentity}>
    <View pointerEvents="none" style={{ position: 'absolute', width: 52, height: 52 }}>
      <View style={{ position: 'absolute', left: 1.1, top: 1.1, width: 49.8, height: 49.8, borderRadius: 25, borderWidth: segmentSize, borderColor: '#dfe2e8' }} />
      {Array.from({ length: segmentCount }, (_, index) => {
        const angle = index / segmentCount * Math.PI * 2 - Math.PI / 2;
        const active = indicator.progress !== null && index / segmentCount < indicator.progress;
        return <View key={index} style={{ position: 'absolute', left: center + radius * Math.cos(angle) - segmentSize / 2, top: center + radius * Math.sin(angle) - segmentSize / 2, width: segmentSize, height: segmentSize, borderRadius: segmentSize / 2, backgroundColor: active ? colors.green : '#dfe2e8' }} />;
      })}
    </View>
    <View style={homeStyles.groupInitials}><Copy style={homeStyles.name}>{groupInitials(name)}</Copy></View>
  </View>;
}

type Friend = ChatSnapshot['friends'][number];
function RequestRow({ friend, peer, userId, busy, onProfile, onNotice, refresh }: {
  friend: Friend;
  peer: { id: string; name: string; avatarUrl: string | null };
  userId: string | null;
  busy: boolean;
  onProfile: () => void;
  onNotice: (message: string) => void;
  refresh: () => Promise<void>;
}) {
  const { api } = useAuth();
  const action = useAction();
  const lock = useRef(false);
  const [pending, setPending] = useState<'accept' | 'remove' | null>(null);
  const incoming = friend.requested_by_id !== userId;
  async function respond(kind: 'accept' | 'remove') {
    if (!api || busy || lock.current) return;
    lock.current = true;
    setPending(kind);
    const success = await action.run(async () => {
      await (kind === 'accept' ? api.acceptFriend(friend.id) : api.removeFriend(friend.id));
      await refresh();
    });
    if (success) onNotice(kind === 'accept' ? `You and ${peer.name} are now friends.` : incoming ? `Declined ${peer.name}'s friend request.` : `Cancelled friend request to ${peer.name}.`);
    setPending(null);
    lock.current = false;
  }
  return <View style={homeStyles.requestCard}>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${peer.name}'s profile`} onPress={onProfile} style={({ pressed }) => [homeStyles.requestPerson, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={{ width: 52, height: 52 }}>
        <Avatar name={peer.name} url={peer.avatarUrl} size={52} />
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={homeStyles.requestMarker}><Copy style={{ color: '#fff', fontSize: 14, lineHeight: 16 }}>+</Copy></View>
      </View>
      <View style={homeStyles.copy}>
        <View style={homeStyles.titleRow}><Copy numberOfLines={1} style={[homeStyles.name, { flex: 1 }]}>{peer.name}</Copy><Copy style={homeStyles.meta}>{messageAge(Date.parse(friend.requested_at))}</Copy></View>
        <Copy style={homeStyles.meta}>{incoming ? 'Incoming friend request' : 'Friend request sent'}</Copy>
      </View>
    </Pressable>
    <View style={homeStyles.requestActions}>
      {incoming && <NativeAction label={pending === 'accept' ? 'Accepting…' : 'Accept'} accessibilityLabel={`Accept ${peer.name}'s friend request`} variant="outlined" disabled={busy || action.busy} onPress={() => respond('accept')} />}
      <NativeAction label={pending === 'remove' ? incoming ? 'Declining…' : 'Cancelling…' : incoming ? 'Decline' : 'Cancel'} accessibilityLabel={incoming ? `Decline ${peer.name}'s friend request` : `Cancel friend request to ${peer.name}`} variant="text" disabled={busy || action.busy} onPress={() => respond('remove')} />
    </View>
    {!!action.error && <Copy accessibilityRole="alert" accessibilityLiveRegion="polite" style={homeStyles.requestError}>Couldn’t update this request. Try again.</Copy>}
  </View>;
}

export default function ChatsScreen() {
  const chat = useChat();
  const { userId } = useAuth();
  const action = useAction();
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const groupId = chat.group?.id;
  const [expiryNotice, setExpiryNotice] = useState({ groupId, dismissed: false });
  if (expiryNotice.groupId !== groupId) setExpiryNotice({ groupId, dismissed: false });
  const expiryDismissed = expiryNotice.groupId === groupId && expiryNotice.dismissed;
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const query = search.trim().toLocaleLowerCase();
  const group = chat.group;
  const latestGroupMessage = group?.messages.at(-1);
  const acceptedFriends = useMemo(() => chat.friends.filter((friend) => friend.accepted_at !== null), [chat.friends]);
  const pendingRequests = useMemo(() => chat.friends.filter((friend) => friend.accepted_at === null), [chat.friends]);
  const peerFor = (friend: Friend) => {
    const profile = friend.user_a_id === userId ? friend.user_b : friend.user_a;
    return { id: profile?.id ?? (friend.user_a_id === userId ? friend.user_b_id : friend.user_a_id), name: profile?.display_name?.trim() || 'Participant', avatarUrl: profile?.avatar_url ?? null };
  };
  const nameFor = (friend: Friend) => peerFor(friend).name;
  const groupMatches = !!group && (!query || group.venue.name.toLocaleLowerCase().includes(query));
  const accessIndicator = useGroupAccessCountdown(chat.ready && !chat.error && groupMatches ? chat.expiresAt : null);
  const visibleFriends = acceptedFriends
    .filter((friend) => nameFor(friend).toLocaleLowerCase().includes(query))
    .sort((first, second) => {
      const firstPreview = chat.directPreviews[first.id];
      const secondPreview = chat.directPreviews[second.id];
      const firstMessage = firstPreview?.status === 'ready' ? firstPreview.message : null;
      const secondMessage = secondPreview?.status === 'ready' ? secondPreview.message : null;
      return directConversationTime(secondMessage, second.accepted_at, second.requested_at) - directConversationTime(firstMessage, first.accepted_at, first.requested_at);
    });
  const visibleRequests = pendingRequests.filter((friend) => nameFor(friend).toLocaleLowerCase().includes(query))
    .sort((left, right) => Date.parse(right.requested_at) - Date.parse(left.requested_at));
  const hasMatches = groupMatches || visibleRequests.length > 0 || visibleFriends.length > 0;

  function openProfile(friend: typeof chat.friends[number]) {
    const peerId = friend.user_a_id === userId ? friend.user_b_id : friend.user_a_id;
    router.push({ pathname: '/person/[id]', params: { id: peerId } });
  }

  function openDirectMessage(friend: typeof chat.friends[number]) {
    router.push({ pathname: '/direct/[id]', params: { id: friend.id } });
  }

  return <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} collapsable={false} style={styles.screen}>
    <View style={homeStyles.header}>
      <View style={[styles.row, { justifyContent: 'space-between', paddingTop: 28, paddingBottom: 20 }]}>
        <Copy accessibilityRole="header" style={homeStyles.title}>Chats</Copy>
        <Pressable accessibilityRole="button" accessibilityLabel="Open your profile" onPress={() => router.push('/profile')} style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
          <Avatar name={chat.session?.name ?? 'You'} url={chat.session?.avatarUrl} size={44} />
          <View style={[homeStyles.connectionDot, { backgroundColor: chat.connection === 'connected' ? colors.green : '#919aac' }]} />
        </Pressable>
      </View>
      <View style={homeStyles.search}>
        <Icon name="search" size={20} color={colors.muted} />
        <TextInput accessibilityLabel="Search chats and people by name" placeholder="Search chats and people..." placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} editable={chat.ready && !chat.error} returnKeyType="search" style={homeStyles.searchInput} />
        {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} style={homeStyles.clearSearch}><Icon name="close" size={18} color={colors.muted} /></Pressable>}
      </View>
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={homeStyles.list} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} alwaysBounceVertical={false} keyboardShouldPersistTaps="handled">
      {!!action.error && <View accessibilityRole="alert" style={styles.notice}><Copy style={homeStyles.requestError}>Couldn’t refresh your chats. Try again.</Copy><NativeAction label="Retry" variant="outlined" onPress={() => action.run(chat.refresh)} /></View>}
      {chat.error ? <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={homeStyles.loadError}>
        <Copy style={homeStyles.emptyTitle}>Couldn’t load your chats.</Copy>
        <Copy style={homeStyles.meta}>Try again to see your group, requests, and messages.</Copy>
        <NativeAction label={action.busy ? 'Trying again…' : 'Retry'} variant="outlined" disabled={action.busy} onPress={() => action.run(chat.refresh)} />
      </View> : !chat.ready ? <Skeleton view="chats" /> : <>
        {!query && !group && chat.groupAccessEnded && !expiryDismissed && <View style={homeStyles.accessNotice}>
          <Copy accessibilityLiveRegion="polite" style={{ flex: 1, color: colors.muted, fontSize: 14, lineHeight: 20 }}>Your group access ended. Your friends and DMs stay.</Copy>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss group access notice" onPress={() => setExpiryNotice({ groupId, dismissed: true })} style={homeStyles.clearSearch}><Icon name="close" size={18} color={colors.muted} /></Pressable>
        </View>}
        {group && groupMatches && <Pressable accessibilityRole="button" accessibilityLabel={`Open ${group.venue.name}, ${group.members.length} ${group.members.length === 1 ? 'member' : 'members'}. ${accessIndicator.accessibilityLabel}`} onPress={() => router.push(roomRoute(group))} style={({ pressed }) => [homeStyles.groupCard, { opacity: pressed ? 0.7 : 1 }]}>
          <GroupAccessRing name={group.venue.name} indicator={accessIndicator} />
          <View style={homeStyles.copy}>
            <View style={homeStyles.titleRow}>
              <Copy numberOfLines={1} style={[homeStyles.name, { flex: 1 }]}>{group.venue.name}</Copy>
              {latestGroupMessage && <Copy style={homeStyles.meta}>{messageAge(latestGroupMessage.time)}</Copy>}
            </View>
            <Copy style={homeStyles.meta}>Group · {group.members.length} {group.members.length === 1 ? 'member' : 'members'}</Copy>
            <Copy style={[homeStyles.meta, { fontWeight: '600' }]}>{accessIndicator.state === 'remaining' ? `Access ends in ${accessIndicator.label.replace(' left', '')}` : accessIndicator.label}</Copy>
            <Copy numberOfLines={1} style={homeStyles.preview}>{latestGroupMessage ? `${latestGroupMessage.user === userId ? 'You' : latestGroupMessage.name}: ${latestGroupMessage.text}` : 'You’re in. Say hello.'}</Copy>
          </View>
        </Pressable>}
        {visibleRequests.map((friend) => <RequestRow key={friend.id} friend={friend} peer={peerFor(friend)} userId={userId} busy={action.busy} onProfile={() => openProfile(friend)} onNotice={setNotice} refresh={chat.refresh} />)}
        {visibleFriends.map((friend) => {
          const peer = peerFor(friend);
          const preview = chat.directPreviews[friend.id];
          const failed = !preview || preview.status === 'error';
          const message = preview?.status === 'ready' ? preview.message : null;
          return <View key={friend.id}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open direct message with ${peer.name}`} onPress={() => openDirectMessage(friend)} style={({ pressed }) => [homeStyles.dmRow, { opacity: pressed ? 0.7 : 1 }]}>
              <Avatar name={peer.name} url={peer.avatarUrl} size={52} />
              <View style={homeStyles.copy}><Copy numberOfLines={1} style={homeStyles.name}>{peer.name}</Copy><Copy numberOfLines={1} style={homeStyles.preview}>{failed ? 'Preview unavailable' : directMessagePreview(message, userId)}</Copy></View>
              {message && <Copy style={[homeStyles.meta, { alignSelf: 'flex-start', paddingTop: 2 }]}>{messageAge(Date.parse(message.created_at))}</Copy>}
            </Pressable>
            {failed && <View style={{ marginLeft: 80 }}><NativeAction label="Retry" accessibilityLabel={`Retry loading message preview for ${peer.name}`} variant="text" disabled={action.busy} onPress={() => action.run(chat.refresh)} align="flex-start" /></View>}
          </View>;
        })}
        {!hasMatches && (query ? <View style={homeStyles.empty}>
          <Copy style={homeStyles.emptyCopy}>{`No chats or requests match “${search.trim()}”.`}</Copy>
          <NativeAction label="Clear search" variant="text" onPress={() => setSearch('')} />
        </View> : <View style={homeStyles.empty}>
          <Copy style={homeStyles.emptyTitle}>Your chats start with a scan.</Copy>
          <Copy style={homeStyles.emptyCopy}>Scan a QR code at a venue to join a group and meet people.</Copy>
          <NativeAction label="Scan a QR code" onPress={() => router.push('/scan')} />
        </View>)}
      </>}
    </ScrollView>
    {!!notice && <View pointerEvents="none" style={homeStyles.notice}><Copy accessibilityLiveRegion="polite" style={{ color: '#fff', textAlign: 'center', fontSize: 14 }}>{notice}</Copy></View>}
    <View pointerEvents="box-none" style={homeStyles.scanOverlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Scan a QR code" disabled={!chat.ready || !!chat.error} accessibilityState={{ disabled: !chat.ready || !!chat.error }} onPress={() => router.push('/scan')} style={({ pressed }) => [homeStyles.scanButton, { opacity: !chat.ready || chat.error ? 0.45 : pressed ? 0.7 : 1 }]}><Icon name="scan" size={30} color="#fff" /></Pressable>
    </View>
  </SafeAreaView>;
}

const homeStyles = StyleSheet.create({
  header: { paddingHorizontal: 22 },
  title: { fontSize: 38, lineHeight: 46, fontWeight: '700', letterSpacing: -1.2 },
  connectionDot: { position: 'absolute', right: 2, bottom: 1, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: colors.paper },
  search: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44, paddingLeft: 16, paddingRight: 6, borderRadius: 17, backgroundColor: colors.soft, marginBottom: 16 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 0, color: colors.ink, fontSize: 14 },
  clearSearch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 22, paddingBottom: 100, gap: 8 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  name: { minWidth: 0, fontSize: 18, lineHeight: 24, fontWeight: '600' },
  meta: { fontSize: 13, lineHeight: 20, color: colors.muted },
  preview: { fontSize: 15, lineHeight: 21, color: colors.muted },
  groupCard: { flexDirection: 'row', alignItems: 'center', minHeight: 104, padding: 12, gap: 16, borderRadius: 14, backgroundColor: colors.blue },
  groupIdentity: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  groupInitials: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  requestCard: { padding: 12, gap: 8, borderRadius: 14, backgroundColor: colors.soft },
  requestPerson: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 16 },
  requestMarker: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.soft, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  requestActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  requestError: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  dmRow: { flexDirection: 'row', alignItems: 'center', minHeight: 72, paddingVertical: 10, paddingHorizontal: 12, gap: 16, borderRadius: 14 },
  accessNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12 },
  empty: { paddingVertical: 24, paddingHorizontal: 12, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 20, lineHeight: 26, fontWeight: '600', textAlign: 'center' },
  emptyCopy: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center' },
  loadError: { paddingVertical: 22, paddingHorizontal: 18, gap: 8, borderRadius: 14, backgroundColor: colors.soft },
  notice: { position: 'absolute', bottom: 100, alignSelf: 'center', maxWidth: '90%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.ink },
  scanOverlay: { position: 'absolute', right: 22, bottom: 20 },
  scanButton: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: '#142b40', boxShadow: '0 12px 24px #18334e33' },
});
