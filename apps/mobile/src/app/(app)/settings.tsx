import { Button, ErrorNotice, Screen, useAction } from '@/components/chat-ui';
import { useAuth } from '@/providers/auth-provider';

export default function SettingsScreen() {
  const { api } = useAuth();
  const action = useAction();
  return <Screen><ErrorNotice message={action.error} />
    <Button label="Sign out" danger subtle disabled={action.busy} onPress={() => { void action.run(async () => { await api!.signOut(); }); }} />
  </Screen>;
}
