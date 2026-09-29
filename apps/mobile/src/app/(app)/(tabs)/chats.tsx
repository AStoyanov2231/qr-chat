import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { messageAge } from '@qr-chat/domain';
import { Copy, Empty, ErrorNotice, Icon, IconButton, Screen, Skeleton, TextButton, colors, styles, useAction } from '@/components/chat-ui';
import { useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';
import { roomRoute } from '@/lib/room-route';
import { Avatar } from '@/components/avatar';

export default function GroupsScreen() {
  const chat = useChat();
  const { api, userId } = useAuth();
  const action = useAction();
  const [filter, setFilter] = useState('Recent');
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const group = chat.group;
  const latest = group?.messages.at(-1);

  return <Screen>
    <View style={[styles.row, { justifyContent: 'space-between', paddingTop: 12 }]}>
      <Copy accessibilityRole="header" style={styles.title}>Groups</Copy>
      <IconButton name="search" label="Search groups" onPress={() => { setSearchOpen(!searchOpen); setSearch(''); }} />
    </View>
    <ErrorNotice message={chat.error || action.error} retry={() => { void action.run(chat.refresh); }} />
    {!chat.ready && !chat.error ? <Skeleton /> : <>
      <View style={[styles.row, { gap: 11 }]}>
        {['Recent', 'Nearby', 'My Groups'].map((label) => <Pressable
          key={label} accessibilityRole="button" accessibilityState={{ selected: filter === label }} onPress={() => setFilter(label)}
          style={{ flex: label === 'My Groups' ? 1.2 : 1, minHeight: 44, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: filter === label ? colors.ink : colors.soft }}>
          <Copy style={{ fontSize: 14, color: filter === label ? '#fff' : colors.ink }}>{label}</Copy>
        </Pressable>)}
      </View>
      {searchOpen && <TextInput autoFocus accessibilityLabel="Search groups by name" placeholder="Search groups" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} style={styles.input} />}
      {!!chat.friends.length && <View accessibilityLabel="Friends and requests">
        {chat.friends.map((friend) => {
          const peer = friend.user_a_id === userId ? friend.user_b : friend.user_a;
          const incoming = friend.requested_by_id !== userId;
          const remove = () => { void action.run(async () => { await api!.removeFriend(friend.id); await chat.refresh(); }); };
          return <View key={friend.id} style={[styles.row, { flexWrap: 'wrap', gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`View ${peer?.display_name ?? 'friend'}'s profile`} onPress={() => router.push({ pathname: '/person/[id]', params: { id: friend.user_a_id === userId ? friend.user_b_id : friend.user_a_id } })} style={{ minWidth: 44, minHeight: 44 }}><Avatar name={peer?.display_name ?? 'Friend'} url={peer?.avatar_url} /></Pressable>
            <View style={{ flex: 1, minWidth: 100, gap: 3 }}>
              <Copy style={{ fontSize: 14, fontWeight: '600' }}>{peer?.display_name ?? 'Participant'}</Copy>
              <Copy style={{ color: colors.muted, fontSize: 12 }}>{friend.accepted_at ? 'Friend' : incoming ? 'Wants to be friends' : 'Request sent'}</Copy>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {friend.accepted_at ? <TextButton label="Message" onPress={() => router.push({ pathname: '/direct/[id]', params: { id: friend.id } })} />
                : incoming && <TextButton label="Accept" disabled={action.busy} onPress={() => { void action.run(async () => { await api!.acceptFriend(friend.id); await chat.refresh(); }); }} />}
              <TextButton label={friend.accepted_at ? 'Remove' : incoming ? 'Decline' : 'Cancel'} disabled={action.busy} onPress={() => friend.accepted_at
                ? Alert.alert('Remove friend?', 'This also deletes your direct-message history.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: remove }]) : remove()} />
            </View>
          </View>;
        })}
      </View>}
      {filter === 'Nearby' ? <Empty title="Find a group nearby." description="Scan a QR code at a place around you." action={() => router.push('/scan')} />
        : group ? group.venue.name.toLowerCase().includes(search.toLowerCase()) ? <Pressable accessibilityRole="button" onPress={() => router.push(roomRoute(group))} style={[styles.row, { gap: 15, paddingVertical: 15, borderBottomWidth: 1, borderColor: colors.line }]}>
          <View style={{ width: 77, height: 79, borderRadius: 18, backgroundColor: '#edf0f4', justifyContent: 'center', alignItems: 'center' }}><Icon name="pin" size={23} /></View>
          <View style={{ flex: 1, gap: 5 }}>
            <Copy numberOfLines={1} style={{ fontSize: 18, fontWeight: '600', letterSpacing: -0.4, paddingRight: 36 }}>{group.venue.name}</Copy>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green }} /><Copy style={{ color: colors.muted, fontSize: 14 }}>{group.members.length} members</Copy></View>
            <Copy numberOfLines={1} style={{ color: colors.muted, fontSize: 14 }}>{latest ? `${latest.name}: ${latest.text}` : 'You’re in. Say hello.'}</Copy>
          </View>
          <Copy style={{ position: 'absolute', right: 0, top: 28, color: colors.muted, fontSize: 12 }}>{latest ? messageAge(latest.time) : 'Now'}</Copy>
        </Pressable> : <Copy style={[styles.muted, { textAlign: 'center', padding: 20 }]}>No groups found.</Copy>
          : <Empty title="No groups yet." description="Your first room starts with a scan." action={() => router.push('/scan')} />}
    </>}
  </Screen>;
}
