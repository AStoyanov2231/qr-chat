import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, TextInput, View } from 'react-native';
import { directConversationTime, directMessagePreview, groupAccessIndicator, groupInitials, messageAge } from '@qr-chat/domain';
import { Avatar } from '@/components/avatar';
import { Copy, Icon, Screen, Skeleton, colors, styles, useAction } from '@/components/chat-ui';
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
  const segmentCount = 180;
  const center = 36;
  const radius = 33;
  const segmentSize = 3;
  return <View style={{ width: 76, alignItems: 'center' }}>
    <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
      <View pointerEvents="none" style={{ position: 'absolute', width: 72, height: 72 }}>
        <View style={{ position: 'absolute', left: 1.5, top: 1.5, width: 69, height: 69, borderRadius: 34.5, borderWidth: 3, borderColor: '#dfe2e8' }} />
        {Array.from({ length: segmentCount }, (_, index) => {
          const angle = index / segmentCount * Math.PI * 2 - Math.PI / 2;
          const left = center + radius * Math.cos(angle) - segmentSize / 2;
          const top = center + radius * Math.sin(angle) - segmentSize / 2;
          const active = indicator.progress !== null && index / segmentCount < indicator.progress;
          return <View key={index} style={{ position: 'absolute', left, top, width: segmentSize, height: segmentSize, borderRadius: segmentSize / 2, backgroundColor: active ? '#168a49' : '#dfe2e8' }} />;
        })}
      </View>
      <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }}>
        <Copy style={{ color: '#334c72', fontSize: 21, fontWeight: '600' }}>{groupInitials(name)}</Copy>
      </View>
    </View>
    <Copy style={{ width: 76, marginTop: -6, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 10, borderWidth: 2, borderColor: colors.soft, backgroundColor: colors.paper, color: indicator.state === 'ended' ? '#7b4a4a' : colors.muted, fontSize: 10, lineHeight: 13, fontWeight: '600', textAlign: 'center' }}>{indicator.label}</Copy>
  </View>;
}

export default function ChatsScreen() {
  const chat = useChat();
  const { api, userId } = useAuth();
  const action = useAction();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [requestsExpanded, setRequestsExpanded] = useState(false);
  const query = search.trim().toLocaleLowerCase();
  const group = chat.group;
  const latestGroupMessage = group?.messages.at(-1);
  const acceptedFriends = useMemo(() => chat.friends.filter((friend) => friend.accepted_at !== null), [chat.friends]);
  const pendingRequests = useMemo(() => chat.friends.filter((friend) => friend.accepted_at === null), [chat.friends]);
  const peerFor = (friend: typeof chat.friends[number]) => friend.user_a_id === userId ? friend.user_b : friend.user_a;
  const nameFor = (friend: typeof chat.friends[number]) => peerFor(friend)?.display_name ?? 'Friend';
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
  const noMatches = !!query && !groupMatches && visibleFriends.length === 0;

  function openProfile(friend: typeof chat.friends[number]) {
    const peerId = friend.user_a_id === userId ? friend.user_b_id : friend.user_a_id;
    router.push({ pathname: '/person/[id]', params: { id: peerId } });
  }

  function openDirectMessage(friend: typeof chat.friends[number]) {
    router.push({ pathname: '/direct/[id]', params: { id: friend.id } });
  }

  function acceptRequest(friendId: string) {
    if (!api) return;
    void action.run(async () => { await api.acceptFriend(friendId); await chat.refresh(); });
  }

  function removeRequest(friendId: string) {
    if (!api) return;
    void action.run(async () => { await api.removeFriend(friendId); await chat.refresh(); });
  }

  return <Screen contentContainerStyle={{ gap: 32 }}>
    <View style={[styles.row, { justifyContent: 'space-between', paddingTop: 12 }]}>
      <Copy accessibilityRole="header" style={[styles.title, { flexShrink: 1 }]}>Chats</Copy>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={searchOpen ? 'Close chat search' : 'Search chats'}
        accessibilityState={{ disabled: !chat.ready || !!chat.error, expanded: searchOpen }}
        disabled={!chat.ready || !!chat.error}
        onPress={() => { setSearchOpen((open) => !open); setSearch(''); }}
        style={({ pressed }) => ({ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.soft, opacity: !chat.ready || !!chat.error ? 0.45 : pressed ? 0.72 : 1 })}
      ><Icon name={searchOpen ? 'close' : 'search'} size={23} color={colors.muted} /></Pressable>
    </View>
    {searchOpen && <TextInput
      autoFocus
      accessibilityLabel="Search chats by name"
      placeholder="Search chats"
      placeholderTextColor={colors.muted}
      value={search}
      onChangeText={setSearch}
      editable={!chat.error}
      returnKeyType="search"
      style={styles.input}
    />}
    {!!action.error && <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}><Copy style={{ color: colors.danger }}>{action.error}</Copy></View>}
    {chat.error ? <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>
      <Copy style={{ color: colors.danger }}>{`We couldn’t load your chats. ${chat.error}`}</Copy>
      <NativeAction label="Retry" variant="outlined" onPress={() => { void action.run(chat.refresh); }} align="flex-start" />
    </View> : !chat.ready ? <Skeleton view="chats" /> : <>
      {(!query || groupMatches) && <View style={{ gap: 10 }}>
        {!chat.groupAccessEnded && <Copy style={{ color: colors.muted, fontSize: 20, fontWeight: '600' }}>Your group</Copy>}
        {group ? <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${group.venue.name}, ${group.members.length} ${group.members.length === 1 ? 'member' : 'members'}. ${accessIndicator.accessibilityLabel}`}
          onPress={() => router.push(roomRoute(group))}
          style={{ padding: 16, borderRadius: 18, backgroundColor: colors.soft }}
        >
          <View style={[styles.row, { alignItems: 'center', gap: 12 }]}>
            <GroupAccessRing name={group.venue.name} indicator={accessIndicator} />
            <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <Copy numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 18, lineHeight: 24, fontWeight: '600' }}>{group.venue.name}</Copy>
                <Copy style={{ flexShrink: 1, maxWidth: '50%', color: colors.muted, fontSize: 13, textAlign: 'right' }}>{group.members.length} {group.members.length === 1 ? 'member' : 'members'}</Copy>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <Copy numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.muted, fontSize: 14 }}>
                  {latestGroupMessage ? `${latestGroupMessage.name}: ${latestGroupMessage.text}` : 'You’re in. Say hello.'}
                </Copy>
                {latestGroupMessage && <Copy style={{ flexShrink: 0, color: colors.muted, fontSize: 12 }}>{messageAge(latestGroupMessage.time)}</Copy>}
              </View>
            </View>
          </View>
        </Pressable> : chat.groupAccessEnded ? <View style={[styles.panel, { paddingVertical: 18, backgroundColor: colors.soft, gap: 10 }]}>
          <Copy style={{ fontSize: 20, lineHeight: 26, fontWeight: '600' }}>Your group access ended</Copy>
          <Copy style={styles.muted}>Your friends and DMs stay.</Copy>
          <NativeAction label="Scan a QR code" onPress={() => router.push('/scan')} />
        </View> : <View style={[styles.panel, { paddingVertical: 18, backgroundColor: colors.soft, gap: 10 }]}>
          <Copy style={{ fontSize: 20, lineHeight: 26, fontWeight: '600' }}>No group yet</Copy>
          <Copy style={styles.muted}>Your first room starts with a scan.</Copy>
          <NativeAction label="Scan a QR code" onPress={() => router.push('/scan')} />
        </View>}
      </View>}

      <View style={{ gap: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle friend requests"
          accessibilityState={{ expanded: requestsExpanded }}
          onPress={() => setRequestsExpanded((expanded) => !expanded)}
          style={[styles.row, { justifyContent: 'space-between', minHeight: 48 }]}
        >
          <Copy style={{ fontSize: 18, fontWeight: '600' }}>{`Friend requests (${pendingRequests.length})`}</Copy>
          <Icon name="chevron" size={18} color={colors.muted} />
        </Pressable>
        {requestsExpanded && (pendingRequests.length ? <View style={{ gap: 4 }}>
          {pendingRequests.map((friend) => {
            const peer = peerFor(friend);
            const incoming = friend.requested_by_id !== userId;
            const peerName = peer?.display_name ?? 'Friend';
            return <View key={friend.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line, gap: 8 }}>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View ${peerName}’s profile`}
                  onPress={() => openProfile(friend)}
                  style={{ minWidth: 50, minHeight: 50, alignItems: 'center', justifyContent: 'center' }}
                ><Avatar name={peerName} url={peer?.avatar_url} size={46} /></Pressable>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Copy numberOfLines={1} style={{ fontWeight: '600' }}>{peerName}</Copy>
                  <Copy style={{ color: colors.muted, fontSize: 14 }}>{incoming ? 'Wants to be friends' : 'Request sent'}</Copy>
                </View>
              </View>
              <View style={[styles.row, { justifyContent: 'flex-end', gap: 14 }]}>
                {incoming && <NativeAction label="Accept" disabled={action.busy} onPress={() => acceptRequest(friend.id)} />}
                <NativeAction label={incoming ? 'Decline' : 'Cancel'} variant="text" disabled={action.busy} onPress={() => removeRequest(friend.id)} />
              </View>
            </View>;
          })}
        </View> : <Copy style={[styles.muted, { paddingVertical: 8 }]}>No pending requests.</Copy>)}
      </View>

      <View style={{ gap: 4 }}>
        <View style={[styles.row, { justifyContent: 'space-between', minHeight: 48 }]}>
          <Copy style={{ fontSize: 18, fontWeight: '600', flexShrink: 1 }}>Direct messages</Copy>
        </View>
        {noMatches ? <View style={{ paddingVertical: 12, gap: 8 }}>
          <Copy style={styles.muted}>{`No chats match “${search.trim()}”.`}</Copy>
          <NativeAction label="Clear search" variant="text" align="flex-start" onPress={() => setSearch('')} />
        </View> : visibleFriends.length ? visibleFriends.map((friend, index) => {
          const peer = peerFor(friend);
          const peerName = nameFor(friend);
          const preview = chat.directPreviews[friend.id];
          const previewMessage = preview?.status === 'ready' ? preview.message : null;
          const previewText = preview?.status === 'error' ? 'Preview unavailable. Tap to retry.' : directMessagePreview(previewMessage, userId);
          return <View key={friend.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open chat with ${peerName}`}
              onPress={() => openDirectMessage(friend)}
              style={[styles.row, { minHeight: 76, alignItems: 'center', gap: 12 }]}
            >
              <Avatar name={peerName} url={peer?.avatar_url} size={50} />
              <View style={{ flex: 1, minWidth: 0, gap: 3, paddingVertical: 11 }}>
                <Copy numberOfLines={1} style={{ fontWeight: '600' }}>{peerName}</Copy>
                <Copy numberOfLines={1} style={{ color: preview?.status === 'error' ? colors.muted : '#344154', fontSize: 14 }}>{previewText}</Copy>
                {index < visibleFriends.length - 1 && <View style={{ position: 'absolute', left: 0, right: -12, bottom: 0, height: 1, backgroundColor: colors.line }} />}
              </View>
              <Copy style={{ color: colors.muted, fontSize: 12, alignSelf: 'flex-start', paddingTop: 16 }}>
                {previewMessage ? messageAge(Date.parse(previewMessage.created_at)) : ''}
              </Copy>
            </Pressable>
            {preview?.status === 'error' && <NativeAction label="Retry preview" variant="text" disabled={action.busy} onPress={() => { void action.run(chat.refresh); }} align="flex-end" />}
          </View>;
        }) : query ? null : acceptedFriends.length === 0
          ? <Copy style={[styles.muted, { paddingVertical: 10 }]}>Accepted friends appear here so you can start a private conversation.</Copy>
          : null}
        {!!query && !noMatches && !visibleFriends.length && <Copy style={[styles.muted, { paddingVertical: 8 }]}>No direct messages match “{search.trim()}”.</Copy>}
      </View>
    </>}

  </Screen>;
}
