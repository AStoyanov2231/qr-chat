import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useNetworkState } from 'expo-network';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatProvider, useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';
import { colors, Copy, IconButton, shadowFloat } from '@/components/chat-ui';
import { useNotice } from '@/lib/notice';

/** Offline or reconnecting; `polling` and the first `connecting` are not worth a banner. */
function ConnectionBanner() {
  const { connection } = useChat();
  const network = useNetworkState();
  const insets = useSafeAreaInsets();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  if (!offline && connection !== 'reconnecting') return null;
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ paddingTop: insets.top + 8, paddingBottom: 8, paddingHorizontal: 16, backgroundColor: colors.warning }}>
    <Copy style={{ color: colors.onWarning, fontSize: 14, lineHeight: 20 }}>{offline ? 'You’re offline. Reconnect to load chats and send messages.' : 'Reconnecting… Your chats will refresh when connected.'}</Copy>
  </View>;
}
function Toast() {
  const notice = useNotice();
  if (!notice) return null;
  return <View pointerEvents="none" style={{ position: 'absolute', bottom: 100, alignSelf: 'center', maxWidth: '90%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22, backgroundColor: colors.secondary, boxShadow: shadowFloat }}>
    <Copy accessibilityLiveRegion="polite" style={{ color: colors.onSecondary, textAlign: 'center', fontSize: 14, lineHeight: 20 }}>{notice}</Copy>
  </View>;
}

export default function AppLayout() {
  const { userId, pendingCode, clearPendingCode } = useAuth();
  useEffect(() => {
    if (!pendingCode) return;
    // A handoff opens the camera; only a scan can supply a new join destination.
    router.replace('/scan');
    clearPendingCode();
  }, [pendingCode, clearPendingCode]);
  const modal = { presentation: 'modal' as const, headerRight: () => <IconButton name="close" label="Close" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} /> };
  return <ChatProvider key={userId}><View style={{ flex: 1 }}><ConnectionBanner /><View style={{ flex: 1 }}><Stack screenOptions={{ statusBarStyle: 'dark', headerShadowVisible: false, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.canvas }, headerBackButtonDisplayMode: 'minimal' }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="chats" options={{ headerShown: false }} />
    <Stack.Screen name="profile" options={{ title: 'Your profile', presentation: 'card', headerShown: false }} />
    <Stack.Screen name="scan" options={{ ...modal, title: 'Scan a code' }} />
    <Stack.Screen name="join" options={{ ...modal, title: 'Join the room' }} />
    <Stack.Screen name="room" options={{ title: 'Group', headerShown: false, statusBarStyle: 'light' }} />
    <Stack.Screen name="members" options={{ ...modal, title: 'Members' }} />
    <Stack.Screen name="person/[id]" options={{ title: 'Profile', headerShown: false }} />
    <Stack.Screen name="direct/[id]" options={{ title: 'Direct message', headerShown: false, statusBarStyle: 'light' }} />
    <Stack.Screen name="edit-profile" options={{ ...modal, title: 'Edit Profile' }} />
    <Stack.Screen name="settings" options={{ ...modal, title: 'Settings' }} />
    <Stack.Screen name="business" options={{ title: 'Business', headerShown: false }} />
  </Stack><Toast /></View></View></ChatProvider>;
}
