import { Alert } from 'react-native';
import { router } from 'expo-router';
import { Button, ErrorNotice, Screen, useAction } from '@/components/chat-ui';
import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';

export default function SettingsScreen() {
  const { api } = useAuth();
  const chat = useChat();
  const action = useAction();
  return <Screen><ErrorNotice message={action.error} />
    {chat.group && <Button label="Leave current chat" danger subtle disabled={action.busy} onPress={() => Alert.alert('Leave this group?', 'You can join again by scanning its QR code.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: () => { void action.run(async () => { await api!.leaveGroup(); await chat.refresh(); router.dismissTo('/'); }); } }])} />}
    <Button label="Sign out" danger subtle disabled={action.busy} onPress={() => { void action.run(async () => { await api!.signOut(); }); }} />
  </Screen>;
}
