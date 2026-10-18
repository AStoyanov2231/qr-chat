import { Alert, Linking } from 'react-native';
import { Button, Copy, ErrorNotice, Screen, styles, useAction } from '@/components/chat-ui';
import { webOrigin } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function SettingsScreen() {
  const { api } = useAuth();
  const action = useAction();
  return <Screen><ErrorNotice message={action.error} />
    <Button label="Sign out" danger subtle disabled={action.busy} onPress={() => { void action.run(async () => { await api!.signOut(); }); }} />
    <Button label="Delete account" danger subtle disabled={action.busy} onPress={() => {
      Alert.alert('Delete account?', 'This permanently erases your profile, photo, friendships and the messages you sent.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void action.run(async () => { await api!.deleteAccount(); }); } },
      ]);
    }} />
    {webOrigin ? <Copy accessibilityRole="link" style={styles.muted} onPress={() => { void Linking.openURL(`${webOrigin.replace(/\/+$/u, '')}/privacy`).catch(() => {}); }}>Privacy Policy</Copy> : null}
    <Copy accessibilityRole="link" style={styles.muted} onPress={() => { void Linking.openURL('https://openfoodfacts.org').catch(() => {}); }}>Product data and photos © Open Food Facts contributors, under the ODbL and CC BY-SA licenses.</Copy>
  </Screen>;
}
