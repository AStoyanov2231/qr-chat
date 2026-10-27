import { Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import { Button, Copy, ErrorNotice, Screen, styles, useAction } from '@/components/chat-ui';
import { webOrigin } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

const link = (url: string, label: string) => <Copy accessibilityRole="link" style={{ ...styles.muted, textDecorationLine: 'underline' }} onPress={() => { void Linking.openURL(url).catch(() => {}); }}>{label}</Copy>;
export default function SettingsScreen() {
  const { api } = useAuth();
  const action = useAction();
  return <Screen><ErrorNotice message={action.error} />
    <Button label="Blocked people" subtle onPress={() => router.push('/blocked')} />
    <Button label="Sign out" danger subtle disabled={action.busy} onPress={() => { void action.run(async () => { await api!.signOut(); }); }} />
    <Button label="Delete account" danger subtle disabled={action.busy} onPress={() => {
      Alert.alert('Delete account?', 'This permanently erases your profile, photo, friendships and the messages you sent.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void action.run(async () => { await api!.deleteAccount(); }); } },
      ]);
    }} />
    {webOrigin ? <Copy accessibilityRole="link" style={styles.muted} onPress={() => { void Linking.openURL(`${webOrigin.replace(/\/+$/u, '')}/privacy`).catch(() => {}); }}>Privacy Policy</Copy> : null}
    <Copy style={styles.muted}>Product data and photos © {link('https://openfoodfacts.org', 'Open Food Facts')} contributors, under the {link('https://opendatacommons.org/licenses/odbl/1-0/', 'ODbL')} and {link('https://creativecommons.org/licenses/by-sa/3.0/', 'CC BY-SA')} licenses.</Copy>
  </Screen>;
}
