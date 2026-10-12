import { Linking } from 'react-native';
import { Button, Copy, ErrorNotice, Screen, styles, useAction } from '@/components/chat-ui';
import { useAuth } from '@/providers/auth-provider';

export default function SettingsScreen() {
  const { api } = useAuth();
  const action = useAction();
  return <Screen><ErrorNotice message={action.error} />
    <Button label="Sign out" danger subtle disabled={action.busy} onPress={() => { void action.run(async () => { await api!.signOut(); }); }} />
    <Copy accessibilityRole="link" style={styles.muted} onPress={() => { void Linking.openURL('https://openfoodfacts.org').catch(() => {}); }}>Product data and photos © Open Food Facts contributors (ODbL / CC-BY-SA).</Copy>
  </Screen>;
}
