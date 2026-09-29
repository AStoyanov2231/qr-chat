import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, Stack, useFocusEffect } from 'expo-router';
import { Linking, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { unwrapQrCode } from '@qr-chat/domain';
import { codeKeySchema } from '@qr-chat/validation';
import { Button, Copy, ErrorNotice, Icon, styles } from '@/components/chat-ui';
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
  const locked = useRef(false);
  const { active } = useAuth();
  const chat = useChat();
  const { clearScan } = chat;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  useFocusEffect(useCallback(() => { locked.current = false; clearScan(); setFocused(true); return () => setFocused(false); }, [clearScan]));
  useEffect(() => {
    if (!active || !focused) return;
    let stopped = false;
    void getPermission().catch(() => { if (!stopped) setError('Could not check camera access. Try your device settings.'); });
    return () => { stopped = true; };
  }, [active, focused, getPermission]);

  function accept(value: string) {
    if (locked.current || !chat.ready || !focused || !active) return;
    try {
      const code = codeKeySchema.parse(unwrapQrCode(value, webOrigin));
      locked.current = true;
      chat.acceptScan(code);
      router.replace(chat.group?.venue.codes[0] === code ? roomRoute(chat.group) : { pathname: '/join', params: { code } });
    } catch { setError('This QR code is invalid. Try scanning another code.'); }
  }
  function permit() {
    void (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission())
      .catch(() => setError('Could not open camera permissions. Try your device settings.'));
  }
  const cameraVisible = permission?.granted && focused && active && !cameraError;
  const targetSize = Math.min(width * 0.7, 340);
  return <View style={{ flex: 1, backgroundColor: '#07090b' }}>
    <Stack.Screen options={{ headerTransparent: true, headerTintColor: '#fff', title: '', headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Close scanner" style={styles.iconButton} onPress={() => router.back()}><Icon name="close" color="#fff" /></Pressable> }} />
    {cameraVisible && <CameraView key={attempt} accessibilityLabel="Camera preview" style={{ position: 'absolute', inset: 0 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => accept(data)} onMountError={() => setCameraError('The camera could not start. Check camera access and try again.')} />}
    <View pointerEvents="none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top + 48 }}>
      {cameraVisible && <View style={{ width: targetSize, height: targetSize, borderWidth: 2, borderColor: '#ffffffeb', borderRadius: 28, boxShadow: '0 0 0 2000px #03050770' }} />}
    </View>
    <View style={{ gap: 14, paddingHorizontal: 30, paddingTop: 26, paddingBottom: Math.max(insets.bottom, 20), backgroundColor: '#07090be6' }}>
      <Copy accessibilityRole="header" style={{ color: '#fff', fontSize: 32, lineHeight: 38, fontWeight: '600', letterSpacing: -1 }}>Find the code.</Copy>
      <Copy style={{ color: '#d5d8df', fontSize: 15 }}>{cameraError || (permission?.granted ? 'Hold the QR inside the frame.' : 'Allow camera access to scan a QR code.')}</Copy>
      {cameraError ? <Button label="Try camera again" subtle onPress={() => { setCameraError(''); setAttempt(attempt + 1); }} /> : !permission?.granted && <Button label={permission?.canAskAgain === false ? 'Open settings' : 'Allow camera'} subtle onPress={permit} />}
      <ErrorNotice message={error || chat.error} retry={chat.error ? () => { void chat.refresh().catch(() => {}); } : undefined} />
    </View>
  </View>;
}
