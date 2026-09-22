import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Copy, ErrorNotice, Screen, TextButton, colors, styles, useAction } from '@/components/chat-ui';
import { useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';

export default function MembersScreen() {
  const chat = useChat();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const group = chat.group?.id === groupId ? chat.group : null;
  const { api, userId } = useAuth();
  const action = useAction();
  return <Screen><ErrorNotice message={action.error || chat.error} />
    {!group && <Copy>Your membership has ended.</Copy>}
    {group?.members.filter((member) => member.id !== userId).map((member) => {
      const friend = chat.friends.find((friend) => friend.user_a_id === member.id || friend.user_b_id === member.id);
      return <View key={member.id} style={[styles.row, { paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.line }]}><Copy style={{ flex: 1 }}>{member.name}</Copy><TextButton label={friend ? friend.accepted_at ? 'Friend' : 'Requested' : 'Add friend'} disabled={!!friend || action.busy} onPress={() => { void action.run(async () => { await api!.requestFriend(member.id); await chat.refresh(); }); }} /></View>;
    })}
    {group && <Button label="Leave group" danger subtle disabled={action.busy} onPress={() => Alert.alert('Leave this group?', 'You can join again by scanning its QR code.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: () => { void action.run(async () => { await api!.leaveGroup(); await chat.refresh(); router.dismissTo('/chats'); }); } }])} />}
  </Screen>;
}
