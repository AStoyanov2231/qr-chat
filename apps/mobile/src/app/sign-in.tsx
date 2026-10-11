import { View } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Button, Copy, ErrorNotice, Icon, Screen, styles, useAction } from '@/components/chat-ui';
import { useAuth } from '@/providers/auth-provider';
import { authCallback, providers } from '@/lib/supabase';
import { completeSignIn } from '@/lib/oauth';

export default function SignInScreen() {
  const { api, error } = useAuth();
  const action = useAction();
  const expoGo = Constants.appOwnership === 'expo';
  async function signIn() {
    await action.run(async () => {
      const { data, error } = await api!.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: authCallback, skipBrowserRedirect: true } });
      if (error || !data.url) throw new Error('Could not start sign-in. Please try again.');
      const result = await WebBrowser.openAuthSessionAsync(data.url, authCallback);
      if (result.type === 'success') await completeSignIn(result.url);
    });
  }
  return <Screen><View style={[styles.row, { paddingTop: 28 }]}><Icon name="qr" size={19} /><Copy style={{ fontSize: 18, fontWeight: '700' }}>QR Chat</Copy></View>
    <View style={{ flex: 1, justifyContent: 'center', gap: 20, paddingVertical: 50 }}>
      <Copy style={{ fontSize: 32, lineHeight: 38, fontWeight: '800' }}>Find your people.</Copy>
      <Copy style={[styles.muted, { fontSize: 16, lineHeight: 22 }]}>Sign in, scan the code, join the room.</Copy>
      <View style={{ gap: 12, marginTop: 24 }}>
        {expoGo ? <Copy style={styles.muted}>Native sign-in requires an app build. Open QR Chat in its iOS or Android development build.</Copy> : <>
          {providers.google && <Button label="Continue with Google" subtle disabled={action.busy || !api} onPress={() => { void signIn(); }} />}
          {!providers.google && <Copy style={styles.muted}>Sign-in is not available on this device yet.</Copy>}
        </>}
      </View>
      <ErrorNotice message={action.error || error} />
      <Copy style={[styles.muted, { fontSize: 12, lineHeight: 16 }]}>By continuing, you agree to use QR Chat respectfully.</Copy>
    </View>
  </Screen>;
}
