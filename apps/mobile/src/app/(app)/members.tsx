import { Alert, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Copy, ErrorNotice, Icon, Screen, colors, styles, useAction } from '@/components/chat-ui';
import { Avatar } from '@/components/avatar';
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
    {group?.members.map((member) => <Pressable key={member.id} accessibilityRole="button" accessibilityLabel={`View ${member.name}'s profile`} onPress={() => router.push(member.id === userId ? '/edit-profile' : { pathname: '/person/[id]', params: { id: member.id } })} style={[styles.row, { minHeight: 60, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.line }]}>
      <Avatar name={member.name} url={member.avatarUrl} /><Copy style={{ flex: 1 }}>{member.id === userId ? 'You' : member.name}</Copy><Icon name="chevron" size={18} />
    </Pressable>)}
    {group && <Button label="Leave group" danger subtle disabled={action.busy} onPress={() => Alert.alert('Leave this group?', 'You can join again by scanning its QR code.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: () => { void action.run(async () => { await api!.leaveGroup(); await chat.refresh(); router.dismissTo('/'); }); } }])} />}
  </Screen>;
}
