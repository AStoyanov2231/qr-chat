import { Linking, Pressable, View } from 'react-native';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Copy, ErrorNotice, Icon, Screen, colors, styles, useAction } from '@/components/chat-ui';
import { useAuth } from '@/providers/auth-provider';
import { authCallback, providers, webOrigin } from '@/lib/supabase';
import { completeSignIn } from '@/lib/oauth';

// Phosphor's Google logo (bold), as on web.
const googleLogo = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="${colors.text}"><path d="M228,128a100,100,0,1,1-22.86-63.64,12,12,0,0,1-18.51,15.28A76,76,0,1,0,203.05,140H128a12,12,0,0,1,0-24h88A12,12,0,0,1,228,128Z"/></svg>`)}`;

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
          {providers.google && <Pressable accessibilityRole="button" disabled={action.busy || !api} onPress={() => { void signIn(); }}
            style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 26, backgroundColor: colors.fill, opacity: action.busy || !api ? 0.4 : pressed ? 0.7 : 1 })}>
            <Image source={googleLogo} style={{ width: 22, height: 22 }} accessibilityElementsHidden />
            <Copy style={{ fontWeight: '700' }}>{action.busy ? 'Opening sign in...' : 'Continue with Google'}</Copy>
          </Pressable>}
          {!providers.google && <Copy style={styles.muted}>Sign-in is not available on this device yet.</Copy>}
        </>}
      </View>
      <ErrorNotice message={action.error || error} />
      <Copy style={[styles.muted, { fontSize: 12, lineHeight: 16 }]}>By continuing, you agree to use QR Chat respectfully.{webOrigin ? <> See our <Copy accessibilityRole="link" style={{ fontSize: 12, lineHeight: 16, textDecorationLine: 'underline' }} onPress={() => { void Linking.openURL(`${webOrigin.replace(/\/+$/u, '')}/privacy`).catch(() => {}); }}>Privacy Policy</Copy>.</> : null}</Copy>
    </View>
  </Screen>;
}
