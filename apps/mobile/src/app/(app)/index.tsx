import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Animated, Easing, Keyboard, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-screens/experimental';
import type { ChatSnapshot } from '@qr-chat/api';
import { directConversationTime, directMessagePreview, groupAccessIndicator, groupInitials, messageAge } from '@qr-chat/domain';
import { Avatar } from '@/components/avatar';
import { Copy, Icon, NativeInput, Skeleton, colors, shadowFloat, styles, useAction } from '@/components/chat-ui';
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
  const center = 32;
  const radius = 33 * 64 / 72;
  const segmentSize = 3 * 64 / 72;
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={homeStyles.groupIdentity}>
    <View pointerEvents="none" style={{ position: 'absolute', width: 64, height: 64 }}>
      <View style={{ position: 'absolute', left: 1.3, top: 1.3, width: 61.4, height: 61.4, borderRadius: 32, borderWidth: segmentSize, borderColor: colors.line }} />
      {Array.from({ length: segmentCount }, (_, index) => {
        const angle = index / segmentCount * Math.PI * 2 - Math.PI / 2;
        const active = indicator.progress !== null && index / segmentCount < indicator.progress;
        return <View key={index} style={{ position: 'absolute', left: center + radius * Math.cos(angle) - segmentSize / 2, top: center + radius * Math.sin(angle) - segmentSize / 2, width: segmentSize, height: segmentSize, borderRadius: segmentSize / 2, backgroundColor: active ? colors.online : colors.line }} />;
      })}
    </View>
    <View style={homeStyles.groupInitials}><Copy style={[homeStyles.name, { fontSize: 20, lineHeight: 26, color: colors.onPrimaryTint }]}>{groupInitials(name)}</Copy></View>
  </View>;
}

type Friend = ChatSnapshot['friends'][number];
function RequestRow({ friend, peer, userId, busy, onNotice, refresh }: {
  friend: Friend;
  peer: { id: string; name: string; avatarUrl: string | null };
  userId: string | null;
  busy: boolean;
  onNotice: (message: string) => void;
  refresh: () => Promise<void>;
}) {
  const { api } = useAuth();
  const action = useAction();
  const lock = useRef(false);
  const [pending, setPending] = useState<'accept' | 'remove' | null>(null);
  const incoming = friend.requested_by_id !== userId;
  const { width } = useWindowDimensions();
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
    <View style={homeStyles.requestMain}>
      <View style={homeStyles.requestPerson}>
        <View style={homeStyles.requestIdentity}>
          <Avatar name={peer.name} url={peer.avatarUrl} size={44} />
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={homeStyles.requestMarker}><Icon name="userPlus" size={13} color={colors.onSecondary} /></View>
        </View>
        <View style={homeStyles.copy}>
          <Copy selectable={false} numberOfLines={1} ellipsizeMode="tail" style={homeStyles.name}>{peer.name}</Copy>
          <Copy style={homeStyles.preview}>{incoming ? 'Sent you a friend request' : 'Friend request sent'}</Copy>
        </View>
      </View>
      <View style={homeStyles.requestActions}>
        {incoming && <Pressable accessibilityRole="button" accessibilityLabel={`Accept ${peer.name}'s friend request`} accessibilityState={{ disabled: busy || action.busy, busy: pending === 'accept' }} disabled={busy || action.busy} onPress={() => { void respond('accept'); }} style={({ pressed }) => [homeStyles.requestAction, { backgroundColor: colors.primary, opacity: busy || action.busy ? 0.4 : 1, transform: [{ scale: pressed ? 1.08 : 1 }] }]}>
          {pending === 'accept' ? <ActivityIndicator size="small" color={colors.onPrimary} accessibilityLabel="Accepting…" /> : <Icon name="check" size={20} color={colors.onPrimary} />}
          {width >= 600 && <Copy style={homeStyles.requestActionText}>{pending === 'accept' ? 'Accepting…' : 'Accept'}</Copy>}
        </Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={incoming ? `Decline ${peer.name}'s friend request` : `Cancel friend request to ${peer.name}`} accessibilityState={{ disabled: busy || action.busy, busy: pending === 'remove' }} disabled={busy || action.busy} onPress={() => { void respond('remove'); }} style={({ pressed }) => [homeStyles.requestAction, { backgroundColor: colors.fill, opacity: busy || action.busy ? 0.4 : 1, transform: [{ scale: pressed ? 1.08 : 1 }] }]}>
          {pending === 'remove' ? <ActivityIndicator size="small" color={colors.text} accessibilityLabel={incoming ? 'Declining…' : 'Cancelling…'} /> : <Icon name="close" size={20} color={colors.text} />}
          {width >= 600 && <Copy style={homeStyles.requestActionText}>{pending === 'remove' ? incoming ? 'Declining…' : 'Cancelling…' : incoming ? 'Decline' : 'Cancel'}</Copy>}
        </Pressable>
      </View>
    </View>
    {!!action.error && <Copy accessibilityRole="alert" accessibilityLiveRegion="polite" style={homeStyles.requestError}>Couldn’t update this request. Try again.</Copy>}
  </View>;

}

function DirectRow({ friend, peer, open, onReveal, onOpen, children, onNotice, refresh }: {
  friend: Friend; peer: { name: string }; open: boolean; onReveal: (open: boolean) => void; onOpen: () => void;
  children: React.ReactNode; onNotice: (message: string) => void; refresh: () => Promise<void>;
}) {
  const { api } = useAuth();
  const action = useAction();
  const reducedMotion = useReducedMotion();
  const [offset] = useState(() => new Animated.Value(0));
  const currentOffset = useRef(0);
  const dragged = useRef(false);
  function settle(reveal: boolean) {
    currentOffset.current = reveal ? 144 : 0;
    Animated.timing(offset, { toValue: currentOffset.current, duration: reducedMotion ? 0 : 240, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  }
  useEffect(() => {
    currentOffset.current = open ? 144 : 0;
    Animated.timing(offset, { toValue: currentOffset.current, duration: reducedMotion ? 0 : 240, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  }, [open, offset, reducedMotion]);
  // PanResponder registers callbacks; it does not read their refs during render.
  // eslint-disable-next-line react-hooks/refs
  const responder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => !action.busy && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3 && (open || gesture.dx < 0),
    onPanResponderGrant: () => { dragged.current = true; offset.stopAnimation(); },
    onPanResponderMove: (_, gesture) => {
      currentOffset.current = Math.max(0, Math.min(144, (open ? 144 : 0) - gesture.dx));
      offset.setValue(currentOffset.current);
    },
    onPanResponderRelease: () => { const reveal = currentOffset.current >= 72; settle(reveal); onReveal(reveal); },
    onPanResponderTerminate: () => settle(open),
  });
  function confirm(kind: 'unfriend' | 'block') {
    if (action.busy || !api) return;
    Alert.alert(`${kind === 'block' ? 'Block' : 'Unfriend'} ${peer.name}?`, kind === 'block'
      ? 'This ends your friendship and prevents new friend requests between you.'
      : 'This ends your friendship and removes this conversation.', [
      { text: 'Cancel', style: 'cancel' },
      { text: kind === 'block' ? 'Block' : 'Unfriend', style: 'destructive', onPress: () => { void action.run(async () => {
        await (kind === 'block' ? api.blockFriend : api.removeFriend)(friend.id);
        await refresh();
        onNotice(kind === 'block' ? `Blocked ${peer.name}.` : `You and ${peer.name} are no longer friends.`);
        onReveal(false);
      }); } },
    ]);
  }
  return <View style={{ overflow: 'hidden', borderRadius: 24 }} {...responder.panHandlers}>
    <Animated.View style={{ backgroundColor: colors.canvas, transform: [{ translateX: Animated.multiply(offset, -1) }] }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open direct message with ${peer.name}`} accessibilityActions={[{ name: 'showActions', label: 'Show Unfriend and Block actions' }, { name: 'dismiss', label: 'Close actions' }]}
        onAccessibilityAction={({ nativeEvent }) => onReveal(nativeEvent.actionName === 'showActions')}
        onPressIn={() => { dragged.current = false; }} onPress={() => {
          if (dragged.current) return;
          if (open) onReveal(false); else onOpen();
        }} style={({ pressed }) => [homeStyles.dmRow, pressed && { backgroundColor: colors.primaryTint }]}>{children}</Pressable>
    </Animated.View>
    <View accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} pointerEvents={open ? 'auto' : 'none'} style={homeStyles.dmActions}>
      {(['unfriend', 'block'] as const).map((kind, index) => <Animated.View key={kind} style={{ transform: [{ scale: offset.interpolate({ inputRange: [index === 0 ? 48 : 0, index === 0 ? 144 : 96], outputRange: [0, 1], extrapolate: 'clamp' }) }] }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${kind === 'block' ? 'Block' : 'Unfriend'} ${peer.name}`} accessibilityState={{ disabled: action.busy, busy: action.busy }} disabled={action.busy} onPress={() => confirm(kind)} style={({ pressed }) => [homeStyles.dmAction, { opacity: action.busy ? 0.4 : 1, transform: [{ scale: pressed ? 1.08 : 1 }] }]}>
          <View style={[homeStyles.dmActionCircle, { backgroundColor: kind === 'block' ? colors.dangerTint : colors.fill }]}>{action.busy ? <ActivityIndicator size="small" color={kind === 'block' ? colors.danger : colors.text} /> : <Icon name={kind === 'block' ? 'block' : 'userMinus'} size={20} color={kind === 'block' ? colors.danger : colors.text} />}</View>
          <Copy selectable={false} style={homeStyles.dmActionLabel}>{kind === 'block' ? 'Block' : 'Unfriend'}</Copy>
        </Pressable>
      </Animated.View>)}
    </View>
    {!!action.error && <Copy accessibilityRole="alert" accessibilityLiveRegion="polite" style={homeStyles.requestError}>Couldn’t update this friendship. Try again.</Copy>}
  </View>;
}

export default function ChatsScreen() {
  const chat = useChat();
  const { userId } = useAuth();
  const action = useAction();
  const [search, setSearch] = useState('');
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
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
  const groupMessageAge = latestGroupMessage ? messageAge(latestGroupMessage.time) : null;
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

  function openDirectMessage(friend: typeof chat.friends[number]) {
    router.push({ pathname: '/direct/[id]', params: { id: friend.id } });
  }

  return <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} collapsable={false} style={styles.screen}>
    <View style={homeStyles.header}>
      <View style={[styles.row, { justifyContent: 'space-between', paddingTop: 32, paddingBottom: 16 }]}>
        <Copy accessibilityRole="header" style={homeStyles.title}>Chats</Copy>
        <Pressable accessibilityRole="button" accessibilityLabel="Open your profile" onPress={() => { Keyboard.dismiss(); router.push('/profile'); }} style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
          <Avatar name={chat.session?.name ?? 'You'} url={chat.session?.avatarUrl} size={44} />
          <View style={[homeStyles.connectionDot, { backgroundColor: chat.connection === 'connected' ? colors.online : colors.muted }]} />
        </Pressable>
      </View>
      <View style={[homeStyles.search, searchFocused && { borderColor: colors.text, borderWidth: 2 }]}>
        <Icon name="search" size={20} color={colors.muted} />
        <NativeInput accessibilityLabel="Search chats and people by name" placeholder="Search chats and people..." value={search} onChangeText={(value) => { setSearch(value); setRevealedId(null); }} editable={chat.ready && !chat.error} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} autoCapitalize="none" autoCorrect={false} returnKeyType="search" containerStyle={homeStyles.searchInput} />
        <View style={homeStyles.clearSearch}>{!!search && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} style={homeStyles.clearSearch}><Icon name="close" size={18} color={colors.muted} /></Pressable>}</View>
      </View>
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={homeStyles.list} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} alwaysBounceVertical={false} keyboardShouldPersistTaps="handled">
      {chat.connection === 'reconnecting' && !chat.error && <View style={styles.notice}><Copy accessibilityLiveRegion="polite" style={homeStyles.meta}>Reconnecting… Your chats will return when you’re online.</Copy></View>}
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
        {group && groupMatches && <Pressable accessibilityRole="button" accessibilityLabel={`Open ${group.venue.name}, ${group.members.length} ${group.members.length === 1 ? 'member' : 'members'}. ${accessIndicator.accessibilityLabel}`} onPress={() => router.push(roomRoute(group))} style={({ pressed }) => [homeStyles.groupCard, { opacity: pressed ? 0.85 : 1 }]}>
          <View style={homeStyles.groupAvatar}>
            <GroupAccessRing name={group.venue.name} indicator={accessIndicator} />
            <Copy style={homeStyles.expiry}>{accessIndicator.label}</Copy>
          </View>
          <View style={[homeStyles.copy, { alignSelf: 'flex-start' }]}>
            <View style={[homeStyles.titleRow, { alignItems: 'center' }]}>
              <Copy selectable={false} numberOfLines={1} ellipsizeMode="tail" style={[homeStyles.name, { flex: 1 }]}>{group.venue.name}</Copy>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={homeStyles.memberCount}><Copy style={homeStyles.memberNumber}>{group.members.length}</Copy><Icon name="group" size={14} color={colors.onSecondary} /></View>
            </View>
            <View style={homeStyles.groupMeta}>
              <Copy numberOfLines={1} style={[homeStyles.meta, homeStyles.onTint, { flexShrink: 1 }]}>{latestGroupMessage ? latestGroupMessage.user === userId ? 'You' : latestGroupMessage.name : chat.session?.name || 'You'}</Copy>
              {latestGroupMessage && <><Copy style={[homeStyles.meta, homeStyles.onTint]}>·</Copy><Copy style={[homeStyles.meta, homeStyles.onTint]}>{groupMessageAge === 'Now' ? 'Now' : `${groupMessageAge} ago`}</Copy></>}
            </View>
            <Copy selectable={false} numberOfLines={1} ellipsizeMode="tail" style={[homeStyles.preview, homeStyles.onTint]}>{latestGroupMessage ? latestGroupMessage.text : 'You’re in. Say hello.'}</Copy>
          </View>
        </Pressable>}
        {visibleRequests.map((friend) => <RequestRow key={friend.id} friend={friend} peer={peerFor(friend)} userId={userId} busy={action.busy} onNotice={setNotice} refresh={chat.refresh} />)}
        {visibleFriends.map((friend) => {
          const peer = peerFor(friend);
          const preview = chat.directPreviews[friend.id];
          const failed = !preview || preview.status === 'error';
          const message = preview?.status === 'ready' ? preview.message : null;
          return <View key={friend.id}>
            <DirectRow friend={friend} peer={peer} open={revealedId === friend.id} onReveal={(open) => setRevealedId(open ? friend.id : null)} onOpen={() => openDirectMessage(friend)} refresh={chat.refresh} onNotice={setNotice}>
              <Avatar name={peer.name} url={peer.avatarUrl} size={52} />
              <View style={homeStyles.copy}><Copy selectable={false} numberOfLines={1} ellipsizeMode="tail" style={homeStyles.name}>{peer.name}</Copy><Copy selectable={false} numberOfLines={1} ellipsizeMode="tail" style={homeStyles.preview}>{failed ? 'Preview unavailable' : directMessagePreview(message, userId)}</Copy></View>
              {message && <Copy style={[homeStyles.meta, { alignSelf: 'flex-start', paddingTop: 2 }]}>{messageAge(Date.parse(message.created_at))}</Copy>}
            </DirectRow>
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
    {!!notice && <View pointerEvents="none" style={homeStyles.notice}><Copy accessibilityLiveRegion="polite" style={{ color: colors.onSecondary, textAlign: 'center', fontSize: 14, lineHeight: 20 }}>{notice}</Copy></View>}
    <View pointerEvents="box-none" style={homeStyles.scanOverlay}>
      <View style={{ borderRadius: 32, boxShadow: shadowFloat }}><NativeAction icon="scan" prominent accessibilityLabel="Scan a QR code" disabled={!chat.ready || !!chat.error} onPress={() => router.push('/scan')} /></View>
    </View>
  </SafeAreaView>;
}

const homeStyles = StyleSheet.create({
  header: { paddingHorizontal: 16 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800' },
  connectionDot: { position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.canvas },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingLeft: 18, paddingRight: 4, borderWidth: 1, borderColor: colors.line, borderRadius: 26, backgroundColor: colors.fill, marginBottom: 16 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 50, padding: 0, color: colors.text, fontSize: 16 },
  clearSearch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 100, gap: 8 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  name: { minWidth: 0, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.muted },
  preview: { fontSize: 14, lineHeight: 20, color: colors.muted },
  onTint: { color: colors.onPrimaryTint },
  groupCard: { flexDirection: 'row', alignItems: 'center', minHeight: 98, padding: 16, gap: 12, marginBottom: 8, borderRadius: 24, borderCurve: 'continuous', backgroundColor: colors.primaryTint },
  groupAvatar: { position: 'relative', width: 74, height: 72, alignItems: 'center' },
  expiry: { position: 'absolute', bottom: 0, maxWidth: 74, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface, fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.onPrimaryTint, textAlign: 'center' },
  groupMeta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  memberCount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.secondary },
  memberNumber: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.onSecondary },
  groupIdentity: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  groupInitials: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  requestCard: { padding: 16, gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 24, borderCurve: 'continuous', backgroundColor: colors.surface },
  requestMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  requestIdentity: { width: 44, height: 44, borderRadius: 22 },
  requestPerson: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 12 },
  requestMarker: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  requestActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  requestAction: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  requestActionText: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.text },
  requestError: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  dmActions: { position: 'absolute', top: 0, right: 0, width: 144, height: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingRight: 6 },
  dmAction: { width: 60, minHeight: 64, alignItems: 'center', gap: 4 },
  dmActionCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dmActionLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.muted },
  dmRow: { flexDirection: 'row', alignItems: 'center', minHeight: 72, paddingVertical: 10, paddingHorizontal: 8, gap: 12, borderRadius: 24, backgroundColor: colors.canvas },
  accessNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12 },
  empty: { paddingVertical: 32, paddingHorizontal: 16, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700', textAlign: 'center' },
  emptyCopy: { fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center' },
  loadError: { padding: 16, gap: 8, borderRadius: 24, backgroundColor: colors.fill },
  notice: { position: 'absolute', bottom: 100, alignSelf: 'center', maxWidth: '90%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22, backgroundColor: colors.secondary, boxShadow: shadowFloat },
  scanOverlay: { position: 'absolute', right: 16, bottom: 20 },
});
