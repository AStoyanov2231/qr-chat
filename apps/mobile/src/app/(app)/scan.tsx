import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Linking, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INVALID_CODE_MESSAGE, groupFallbackName, scannedCode, unwrapQrCode } from '@qr-chat/domain';
import { codeKeySchema } from '@qr-chat/validation';
import { Button, Copy, ErrorNotice, useAction } from '@/components/chat-ui';
import { NativeAction } from '@/components/native-action';
import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';
import { webOrigin } from '@/lib/supabase';
import { roomRoute } from '@/lib/room-route';

export default function ScanScreen() {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const join = useAction();
  const locked = useRef(false);
  const { code: linked } = useLocalSearchParams<{ code?: string }>();
  const { active, api } = useAuth();
  const chat = useChat();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  useFocusEffect(useCallback(() => { locked.current = false; setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    if (!active || !focused) return;
    let stopped = false;
    void getPermission().catch(() => { if (!stopped) setError('Could not check camera access. Try your device settings.'); });
    return () => { stopped = true; };
  }, [active, focused, getPermission]);

  // The first code in view wins, QR or retail barcode alike; there is no scan mode.
  async function accept(type: string, value: string) {
    if (locked.current || !chat.ready || !focused || !active) return;
    // Like the web, a rejected code locks the camera for a moment instead of retrying on every frame.
    locked.current = true;
    const unlock = () => setTimeout(() => { locked.current = false; }, 1200);
    let code: string | undefined;
    try { const parsed = codeKeySchema.safeParse(unwrapQrCode(scannedCode(type, value), webOrigin)); if (parsed.success) code = parsed.data; } catch { /* malformed URL */ }
    if (!code) { setError(INVALID_CODE_MESSAGE); unlock(); return; }
    setError('');
    const current = chat.groups.find((group) => group.venue.codes[0] === code) ?? null;
    if (current && !current.venue.nameMissing) { router.replace(roomRoute(current)); return; }
    // Join first, then let the server fill the name and photo; the room opens either way.
    const joined = await join.run(async () => {
      if (!api) throw new Error('Please sign in again.');
      const joined = current ? null : await api.joinGroup(code);
      const groupId = current?.id ?? joined!.group_id;
      const name = await api.resolveGroup(code, joined?.name);
      await chat.refresh();
      router.replace(roomRoute({ id: groupId, venue: { id: groupId, name: name ?? groupFallbackName(code), codes: [code], kind: 'place', label: '' } }));
    });
    if (!joined) unlock();
  }
  // A venue link (/v/<code>) arrives with its code and joins as soon as the chat is ready.
  useEffect(() => { if (linked) queueMicrotask(() => { void accept('qr', linked); }); }, [linked, chat.ready, focused, active]); // eslint-disable-line react-hooks/exhaustive-deps
  function permit() {
    void (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission())
      .catch(() => setError('Could not open camera permissions. Try your device settings.'));
  }
  const cameraVisible = permission?.granted && focused && active && !cameraError;
  const targetSize = Math.min(width * 0.7, 340);
  const closeButton = <NativeAction icon="close" accessibilityLabel="Close scanner" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />;
  return <View style={{ flex: 1, backgroundColor: '#07090b' }}>
    <Stack.Screen options={{ statusBarStyle: 'light', headerTransparent: true, headerTintColor: '#fff', title: '', headerRight: () => closeButton,
      unstable_headerRightItems: process.env.EXPO_OS === 'ios' ? () => [{ type: 'custom', element: closeButton, hidesSharedBackground: true }] : undefined }} />
    {cameraVisible && <CameraView key={attempt} accessibilityLabel="Camera preview" style={{ position: 'absolute', inset: 0 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e'] }} onBarcodeScanned={({ type, data }) => { void accept(type, data); }} onMountError={() => setCameraError('The camera could not start. Check camera access and try again.')} />}
    <View pointerEvents="none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top + 48 }}>
      {cameraVisible && <View style={{ width: targetSize, height: targetSize, borderWidth: 2, borderColor: '#ffffffeb', borderRadius: 28, boxShadow: '0 0 0 2000px #03050770' }} />}
    </View>
    <View style={{ gap: 16, paddingHorizontal: 24, paddingTop: 26, paddingBottom: Math.max(insets.bottom, 20), backgroundColor: '#07090be6' }}>
      <Copy accessibilityRole="header" style={{ color: '#fff', fontSize: 32, lineHeight: 38, fontWeight: '800' }}>Find the code.</Copy>
      <Copy style={{ color: '#d5d8df', fontSize: 14, lineHeight: 20 }}>{cameraError || (join.busy ? 'Joining…' : !chat.ready ? 'Getting your chats ready…' : permission?.granted ? 'Hold a QR code or barcode inside the frame.' : 'Allow camera access to scan a code.')}</Copy>
      {cameraError ? <Button label="Try camera again" subtle onPress={() => { setCameraError(''); setAttempt(attempt + 1); }} /> : !permission?.granted && <Button label={permission?.canAskAgain === false ? 'Open settings' : 'Allow camera'} onPress={permit} />}
      <ErrorNotice message={error || join.error || chat.error} retry={chat.error ? () => { void chat.refresh().catch(() => {}); } : undefined} />
    </View>
  </View>;
}
