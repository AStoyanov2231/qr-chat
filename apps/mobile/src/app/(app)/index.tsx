import { useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Animated, Easing, Keyboard, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-screens/experimental';
import type { ChatSnapshot } from '@qr-chat/api';
import { chatRows, directMessagePreview, groupAccessIndicator, groupInitials, messageAge, type Group } from '@qr-chat/domain';
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

function GroupAccessRing({ name, imageUrl, indicator }: { name: string; imageUrl?: string | null; indicator: ReturnType<typeof groupAccessIndicator> }) {
  const segmentCount = 120;
  const size = 52;
  const center = size / 2;
  const radius = 33 * size / 72;
  const segmentSize = 3 * size / 72;
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={homeStyles.groupIdentity}>
    <View pointerEvents="none" style={{ position: 'absolute', width: size, height: size }}>
      <View style={{ position: 'absolute', left: center - radius - segmentSize / 2, top: center - radius - segmentSize / 2, width: 2 * radius + segmentSize, height: 2 * radius + segmentSize, borderRadius: center, borderWidth: segmentSize, borderColor: colors.line }} />
      {Array.from({ length: segmentCount }, (_, index) => {
        const angle = index / segmentCount * Math.PI * 2 - Math.PI / 2;
        const active = indicator.progress !== null && index / segmentCount < indicator.progress;
        return <View key={index} style={{ position: 'absolute', left: center + radius * Math.cos(angle) - segmentSize / 2, top: center + radius * Math.sin(angle) - segmentSize / 2, width: segmentSize, height: segmentSize, borderRadius: segmentSize / 2, backgroundColor: active ? colors.online : colors.line }} />;
      })}
    </View>
    {imageUrl
      ? <Image source={{ uri: imageUrl }} contentFit="cover" style={homeStyles.groupInitials} />
      : <View style={homeStyles.groupInitials}><Copy style={[homeStyles.name, { fontSize: 17 }]}>{groupInitials(name)}</Copy></View>}
  </View>;
}

type Friend = ChatSnapshot['friends'][number];
type Peer = { id: string; name: string; avatarUrl: string | null };
const unreadLabel = (count: number) => `${count > 99 ? '99+' : count} unread ${count === 1 ? 'message' : 'messages'}`;
function UnreadBadge({ count }: { count: number }) {
  return count ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={homeStyles.unreadBadge}><Copy style={homeStyles.memberNumber}>{count > 99 ? '99+' : String(count)}</Copy></View> : null;
}
function GroupCard({ group, unread, userId, profileName, open, onReveal, onNotice, refresh }: {
  group: Group; unread: number; userId: string | null; profileName?: string; open: boolean; onReveal: (open: boolean) => void; onNotice: (message: string) => void; refresh: () => Promise<void>;
}) {
  const { api } = useAuth();
  const accessIndicator = useGroupAccessCountdown(group.expiresAt);
  const latestGroupMessage = group.messages.at(-1);
  const groupMessageAge = latestGroupMessage ? messageAge(latestGroupMessage.time) : null;
  return <SwipeRow label={`Open ${group.venue.name}, ${group.members.length} ${group.members.length === 1 ? 'member' : 'members'}. ${accessIndicator.accessibilityLabel}${unread ? ` ${unreadLabel(unread)}.` : ''}`} actionsLabel={group.venue.name}
    open={open} onReveal={onReveal} onOpen={() => router.push(roomRoute(group))} refresh={refresh} onNotice={onNotice} errorText="Couldn’t leave this group. Try again."
    actions={[{ kind: 'leave', label: 'Leave', icon: 'exit', danger: true, title: 'Leave this group?', message: 'You can join again by scanning its QR code.', run: () => api!.leaveGroup(group.id), notice: `You left ${group.venue.name}.` }]}>
    <View style={homeStyles.groupAvatar}>
      <GroupAccessRing name={group.venue.name} imageUrl={group.venue.imageUrl} indicator={accessIndicator} />
      <Copy style={homeStyles.expiry}>{accessIndicator.label}</Copy>
    </View>
    <View style={[homeStyles.copy, { alignSelf: 'flex-start' }]}>
      <View style={[homeStyles.titleRow, { alignItems: 'center' }]}>
        <Copy selectable={false} numberOfLines={1} ellipsizeMode="tail" style={[homeStyles.name, { flex: 1 }]}>{group.venue.name}</Copy>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={homeStyles.memberCount}><Copy style={homeStyles.memberNumber}>{group.members.length}</Copy><Icon name="group" size={14} color={colors.onSecondary} /></View>
      </View>
      <View style={homeStyles.groupMeta}>
        <Copy numberOfLines={1} style={[homeStyles.meta, { flexShrink: 1 }]}>{latestGroupMessage ? latestGroupMessage.user === userId ? 'You' : latestGroupMessage.name : profileName || 'You'}</Copy>
        {latestGroupMessage && <><Copy style={homeStyles.meta}>·</Copy><Copy style={homeStyles.meta}>{groupMessageAge === 'Now' ? 'Now' : `${groupMessageAge} ago`}</Copy></>}
      </View>
      <View style={homeStyles.previewRow}>
        <Copy selectable={false} numberOfLines={1} ellipsizeMode="tail" style={[homeStyles.preview, { flex: 1 }, !!unread && homeStyles.unreadPreview]}>{latestGroupMessage ? latestGroupMessage.text : 'You’re in. Say hello.'}</Copy>
        <UnreadBadge count={unread} />
      </View>
    </View>
  </SwipeRow>;
}

function IncomingRequestRow({ friend, peer }: { friend: Friend; peer: Peer }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open friend request from ${peer.name}`} onPress={() => router.push({ pathname: '/direct/[id]', params: { id: friend.id } })} style={({ pressed }) => [homeStyles.dmRow, pressed && { backgroundColor: colors.primaryTint }]}>
    <View style={homeStyles.requestIdentity}>
      <Avatar name={peer.name} url={peer.avatarUrl} size={52} />
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={homeStyles.requestMarker}><Icon name="userPlus" size={13} color={colors.onSecondary} /></View>
    </View>
    <View style={homeStyles.copy}><Copy selectable={false} numberOfLines={1} ellipsizeMode="tail" style={homeStyles.name}>{peer.name}</Copy><Copy selectable={false} numberOfLines={1} style={[homeStyles.preview, { color: colors.text, fontWeight: '700' }]}>Wants to be friends</Copy></View>
    <Copy style={[homeStyles.meta, { alignSelf: 'flex-start', paddingTop: 2 }]}>{messageAge(Date.parse(friend.requested_at))}</Copy>
  </Pressable>;
}

function RequestRow({ friend, peer, busy, onNotice, refresh }: {
  friend: Friend;
  peer: Peer;
  busy: boolean;
  onNotice: (message: string) => void;
  refresh: () => Promise<void>;
}) {
  const { api } = useAuth();
  const action = useAction();
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const { width } = useWindowDimensions();
  async function cancel() {
    if (!api || busy || lock.current) return;
    lock.current = true;
    setPending(true);
    const success = await action.run(async () => {
      await api.removeFriend(friend.id);
      await refresh();
    });
    if (success) onNotice(`Cancelled friend request to ${peer.name}.`);
    setPending(false);
    lock.current = false;
  }
  return <View style={homeStyles.requestCard}>
    <View style={homeStyles.requestMain}>
      <View style={homeStyles.requestPerson}>
        <View style={homeStyles.requestIdentity}>
          <Avatar name={peer.name} url={peer.avatarUrl} size={52} />
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={homeStyles.requestMarker}><Icon name="userPlus" size={13} color={colors.onSecondary} /></View>
        </View>
        <View style={homeStyles.copy}>
          <Copy selectable={false} numberOfLines={1} ellipsizeMode="tail" style={homeStyles.name}>{peer.name}</Copy>
          <Copy style={homeStyles.preview}>Friend request sent</Copy>
        </View>
      </View>
      <View style={homeStyles.requestActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Cancel friend request to ${peer.name}`} accessibilityState={{ disabled: busy || action.busy, busy: pending }} disabled={busy || action.busy} onPress={() => { void cancel(); }} style={({ pressed }) => [homeStyles.requestAction, { backgroundColor: colors.fill, opacity: busy || action.busy ? 0.4 : 1, transform: [{ scale: pressed ? 1.08 : 1 }] }]}>
          {pending ? <ActivityIndicator size="small" color={colors.text} accessibilityLabel="Cancelling…" /> : <Icon name="close" size={20} color={colors.text} />}
          {width >= 600 && <Copy style={homeStyles.requestActionText}>{pending ? 'Cancelling…' : 'Cancel'}</Copy>}
        </Pressable>
      </View>
    </View>
    {!!action.error && <Copy accessibilityRole="alert" accessibilityLiveRegion="polite" style={homeStyles.requestError}>Couldn’t update this request. Try again.</Copy>}
  </View>;

}

type SwipeAction = { kind: string; label: string; icon: React.ComponentProps<typeof Icon>['name']; danger?: boolean; title: string; message: string; run: () => Promise<unknown>; notice: string };

function SwipeRow({ label, actionsLabel, open, onReveal, onOpen, children, actions, errorText, onNotice, refresh }: {
  label: string; actionsLabel: string; open: boolean; onReveal: (open: boolean) => void; onOpen: () => void;
  children: React.ReactNode; actions: SwipeAction[]; errorText: string; onNotice: (message: string) => void; refresh: () => Promise<void>;
}) {
  const action = useAction();
  const reducedMotion = useReducedMotion();
  const width = actions.length * 72;
  const [offset] = useState(() => new Animated.Value(0));
  const currentOffset = useRef(0);
  const dragged = useRef(false);
  function settle(reveal: boolean) {
    currentOffset.current = reveal ? width : 0;
    Animated.timing(offset, { toValue: currentOffset.current, duration: reducedMotion ? 0 : 240, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  }
  useEffect(() => {
    currentOffset.current = open ? width : 0;
    Animated.timing(offset, { toValue: currentOffset.current, duration: reducedMotion ? 0 : 240, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }).start();
  }, [open, offset, reducedMotion, width]);
  // PanResponder registers callbacks; it does not read their refs during render.
  // eslint-disable-next-line react-hooks/refs
  const responder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => !action.busy && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3 && (open || gesture.dx < 0),
    onPanResponderGrant: () => { dragged.current = true; offset.stopAnimation(); },
    onPanResponderMove: (_, gesture) => {
      currentOffset.current = Math.max(0, Math.min(width, (open ? width : 0) - gesture.dx));
      offset.setValue(currentOffset.current);
    },
    onPanResponderRelease: () => { const reveal = currentOffset.current >= width / 2; settle(reveal); onReveal(reveal); },
    onPanResponderTerminate: () => settle(open),
  });
  function confirm(item: SwipeAction) {
    if (action.busy) return;
    Alert.alert(item.title, item.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: item.label, style: 'destructive', onPress: () => { void action.run(async () => {
        await item.run();
        await refresh();
        onNotice(item.notice);
        onReveal(false);
      }); } },
    ]);
  }
  return <>
    <View style={{ overflow: 'hidden', borderRadius: 24 }} {...responder.panHandlers}>
      <Animated.View style={{ backgroundColor: colors.canvas, transform: [{ translateX: Animated.multiply(offset, -1) }] }}>
        <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityActions={[{ name: 'showActions', label: `Show ${actions.map(item => item.label).join(' and ')} actions` }, { name: 'dismiss', label: 'Close actions' }]}
          onAccessibilityAction={({ nativeEvent }) => onReveal(nativeEvent.actionName === 'showActions')}
          onPressIn={() => { dragged.current = false; }} onPress={() => {
            if (dragged.current) return;
            if (open) onReveal(false); else onOpen();
          }} style={({ pressed }) => [homeStyles.dmRow, pressed && { backgroundColor: colors.primaryTint }]}>{children}</Pressable>
      </Animated.View>
      <View accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} pointerEvents={open ? 'auto' : 'none'} style={homeStyles.dmActions}>
        {actions.map((item, index) => <Animated.View key={item.kind} style={{ transform: [{ scale: offset.interpolate({ inputRange: [(actions.length - 1 - index) * 48, (actions.length - 1 - index) * 48 + Math.min(96, width)], outputRange: [0, 1], extrapolate: 'clamp' }) }] }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.label} ${actionsLabel}`} accessibilityState={{ disabled: action.busy, busy: action.busy }} disabled={action.busy} onPress={() => confirm(item)} style={({ pressed }) => [homeStyles.dmAction, { opacity: action.busy ? 0.4 : 1, transform: [{ scale: pressed ? 1.08 : 1 }] }]}>
            <View style={[homeStyles.dmActionCircle, { backgroundColor: item.danger ? colors.dangerTint : colors.fill }]}>{action.busy ? <ActivityIndicator size="small" color={item.danger ? colors.danger : colors.text} /> : <Icon name={item.icon} size={20} color={item.danger ? colors.danger : colors.text} />}</View>
            <Copy selectable={false} style={homeStyles.dmActionLabel}>{item.label}</Copy>
          </Pressable>
        </Animated.View>)}
      </View>
    </View>
    {!!action.error && <Copy accessibilityRole="alert" accessibilityLiveRegion="polite" style={homeStyles.requestError}>{errorText}</Copy>}
  </>;
}

export default function ChatsScreen() {
  const chat = useChat();
  const { api, userId } = useAuth();
  const action = useAction();
  const [search, setSearch] = useState('');
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [notice, setNotice] = useState('');
  const hasGroups = chat.groups.length > 0;
  const [expiryNotice, setExpiryNotice] = useState({ hasGroups, dismissed: false });
  if (expiryNotice.hasGroups !== hasGroups) setExpiryNotice({ hasGroups, dismissed: false });
  const expiryDismissed = expiryNotice.hasGroups === hasGroups && expiryNotice.dismissed;
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const query = search.trim().toLocaleLowerCase();
  const peerFor = (friend: Friend): Peer => {
    const profile = friend.user_a_id === userId ? friend.user_b : friend.user_a;
    return { id: profile?.id ?? (friend.user_a_id === userId ? friend.user_b_id : friend.user_a_id), name: profile?.display_name?.trim() || 'Participant', avatarUrl: profile?.avatar_url ?? null };
  };
  const rows = useMemo(() => chatRows(chat.groups, chat.friends, chat.directPreviews), [chat.groups, chat.friends, chat.directPreviews])
    .filter((row) => (row.kind === 'group' ? row.group.venue.name : peerFor(row.friend).name).toLocaleLowerCase().includes(query));

  function openDirectMessage(friend: Friend) {
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
        <Copy style={homeStyles.meta}>Try again to see your groups, requests, and messages.</Copy>
        <NativeAction label={action.busy ? 'Trying again…' : 'Retry'} variant="outlined" disabled={action.busy} onPress={() => action.run(chat.refresh)} />
      </View> : !chat.ready ? <Skeleton view="chats" /> : <>
        {!query && chat.groupAccessEnded && !expiryDismissed && <View style={homeStyles.accessNotice}>
          <Copy accessibilityLiveRegion="polite" style={{ flex: 1, color: colors.muted, fontSize: 14, lineHeight: 20 }}>Your group access ended. Your friends and DMs stay.</Copy>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss group access notice" onPress={() => setExpiryNotice({ hasGroups, dismissed: true })} style={homeStyles.clearSearch}><Icon name="close" size={18} color={colors.muted} /></Pressable>
        </View>}
        {rows.map((row) => {
          if (row.kind === 'group') return <GroupCard key={row.id} group={row.group} unread={chat.unread[row.id] ?? 0} userId={userId} profileName={chat.session?.name} open={revealedId === row.id} onReveal={(open) => setRevealedId(open ? row.id : null)} refresh={chat.refresh} onNotice={setNotice} />;
          const { friend } = row;
          const peer = peerFor(friend);
          if (row.kind === 'request') return friend.requested_by_id !== userId
            ? <IncomingRequestRow key={row.id} friend={friend} peer={peer} />
            : <RequestRow key={row.id} friend={friend} peer={peer} busy={action.busy} onNotice={setNotice} refresh={chat.refresh} />;
          const preview = chat.directPreviews[friend.id];
          const failed = !preview || preview.status === 'error';
          const message = preview?.status === 'ready' ? preview.message : null;
          const unread = failed ? 0 : chat.unread[friend.id] ?? 0;
          return <View key={row.id}>
            <SwipeRow label={`Open direct message with ${peer.name}${unread ? `, ${unreadLabel(unread)}` : ''}`} actionsLabel={peer.name} open={revealedId === friend.id} onReveal={(open) => setRevealedId(open ? friend.id : null)} onOpen={() => openDirectMessage(friend)} refresh={chat.refresh} onNotice={setNotice} errorText="Couldn’t update this friendship. Try again."
              actions={[
                { kind: 'unfriend', label: 'Unfriend', icon: 'userMinus', title: `Unfriend ${peer.name}?`, message: 'This ends your friendship and removes this conversation.', run: () => api!.removeFriend(friend.id), notice: `You and ${peer.name} are no longer friends.` },
                { kind: 'block', label: 'Block', icon: 'block', danger: true, title: `Block ${peer.name}?`, message: 'This ends your friendship and prevents new friend requests between you.', run: () => api!.blockFriend(friend.id), notice: `Blocked ${peer.name}.` },
              ]}>
              <Avatar name={peer.name} url={peer.avatarUrl} size={52} />
              <View style={homeStyles.copy}><Copy selectable={false} numberOfLines={1} ellipsizeMode="tail" style={homeStyles.name}>{peer.name}</Copy><View style={homeStyles.previewRow}><Copy selectable={false} numberOfLines={1} ellipsizeMode="tail" style={[homeStyles.preview, { flex: 1 }, !!unread && homeStyles.unreadPreview]}>{failed ? 'Preview unavailable' : directMessagePreview(message, userId)}</Copy><UnreadBadge count={unread} /></View></View>
              {message && <Copy style={[homeStyles.meta, { alignSelf: 'flex-start', paddingTop: 2 }]}>{messageAge(Date.parse(message.created_at))}</Copy>}
            </SwipeRow>
            {failed && <View style={{ marginLeft: 80 }}><NativeAction label="Retry" accessibilityLabel={`Retry loading message preview for ${peer.name}`} variant="text" disabled={action.busy} onPress={() => action.run(chat.refresh)} align="flex-start" /></View>}
          </View>;
        })}
        {!rows.length && (query ? <View style={homeStyles.empty}>
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
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unreadPreview: { color: colors.text, fontWeight: '700' },
  unreadBadge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary },
  groupAvatar: { minWidth: 52, alignItems: 'center', gap: 2 },
  expiry: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.onPrimaryTint, textAlign: 'center' },
  groupMeta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  memberCount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.secondary },
  memberNumber: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.onSecondary },
  groupIdentity: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  groupInitials: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.avatar, alignItems: 'center', justifyContent: 'center' },
  requestCard: { minHeight: 72, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 8, gap: 12, borderRadius: 24, backgroundColor: colors.canvas },
  requestMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  requestIdentity: { width: 52, height: 52, borderRadius: 26 },
  requestPerson: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 12 },
  requestMarker: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.canvas, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  requestActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  requestAction: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  requestActionText: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.text },
  requestError: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  dmActions: { position: 'absolute', top: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingRight: 6 },
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
