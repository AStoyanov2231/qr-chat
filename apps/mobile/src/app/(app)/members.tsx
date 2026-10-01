import { useLocalSearchParams } from 'expo-router';
import { Copy, ErrorNotice, Screen } from '@/components/chat-ui';
import { GroupDetails } from '@/components/group-details';
import { useChat } from '@/providers/chat-provider';

export default function MembersScreen() {
  const chat = useChat();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const group = chat.group?.id === groupId ? chat.group : null;
  return <Screen>{group ? <GroupDetails group={group} /> : <><ErrorNotice message={chat.error} /><Copy>Your membership has ended.</Copy></>}</Screen>;
}
