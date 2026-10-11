import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { friendshipState } from '@qr-chat/domain';
import { Button, Copy, ErrorNotice, Skeleton, TextButton, colors, styles, useAction } from '@/components/chat-ui';
import { ConversationHeader } from '@/components/conversation-header';
import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chat = useChat();
  const { api, userId } = useAuth();
  const action = useAction();
  const member = chat.group?.members.find((member) => member.id === id);
  const friend = chat.friends.find((friend) => friend.user_a_id === id || friend.user_b_id === id);
  const peer = friend?.user_a_id === userId ? friend?.user_b : friend?.user_a;
  const person = member ?? (peer ? { id: peer.id, name: peer.display_name ?? 'Participant', avatarUrl: peer.avatar_url } : null);
  const relationship = friendshipState(friend, userId!);
  const disabled = action.busy || !chat.ready;
  const change = (mutation: () => Promise<unknown>) => { void action.run(async () => { await mutation(); await chat.refresh(); }); };

  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>
    <ConversationHeader title={person?.name ?? 'Profile'} subtitle={person ? relationship === 'accepted' ? 'Friend' : 'QR Chat member' : undefined} imageUrl={person?.avatarUrl} onBack={() => router.back()} />
    <View style={styles.profileSurface}>
    <ErrorNotice message={action.error || chat.error} retry={() => { void action.run(chat.refresh); }} />
    {!chat.ready && !chat.error ? <Skeleton profile /> : !person ? <Copy>This profile is no longer available.</Copy> : <>
      {id === userId ? <Button label="Edit profile" onPress={() => router.push('/edit-profile')} />
        : relationship === 'accepted' && friend ? <Button label="Message" disabled={disabled} onPress={() => router.dismissTo({ pathname: '/direct/[id]', params: { id: friend.id } })} />
          : relationship === 'incoming' && friend ? <>
            <Copy style={styles.muted}>{person.name} wants to be friends. Accept to start a private conversation.</Copy>
            <Button label={action.busy ? 'Updating…' : 'Accept'} disabled={disabled} onPress={() => change(() => api!.acceptFriend(friend.id))} />
            <TextButton label="Decline" disabled={disabled} onPress={() => change(() => api!.removeFriend(friend.id))} />
          </> : relationship === 'outgoing' && friend ? <>
            <Copy accessibilityLiveRegion="polite" style={styles.muted}>Request sent. You can message after they accept.</Copy>
            <TextButton label="Cancel request" disabled={disabled} onPress={() => change(() => api!.removeFriend(friend.id))} />
          </> : member ? <>
            <Button label={action.busy ? 'Sending…' : 'Add friend'} disabled={disabled} onPress={() => change(() => api!.requestFriend(id))} />
            <Copy style={styles.muted}>You can message privately after they accept.</Copy>
          </> : <Copy style={styles.muted}>Scan the same venue QR code to connect.</Copy>}
    </>}
    </View>
  </View>;
}
