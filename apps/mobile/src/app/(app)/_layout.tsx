import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { ChatProvider } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';
import { colors, IconButton } from '@/components/chat-ui';

export default function AppLayout() {
  const { userId, pendingCode, clearPendingCode } = useAuth();
  useEffect(() => {
    if (!pendingCode) return;
    // A handoff opens the camera; only a scan can supply a new join destination.
    router.replace('/scan');
    clearPendingCode();
  }, [pendingCode, clearPendingCode]);
  const modal = { presentation: 'modal' as const, headerRight: () => <IconButton name="close" label="Close" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} /> };
  return <ChatProvider key={userId}><Stack screenOptions={{ headerShadowVisible: false, headerTintColor: colors.ink, contentStyle: { backgroundColor: colors.paper }, headerBackButtonDisplayMode: 'minimal' }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="chats" options={{ headerShown: false }} />
    <Stack.Screen name="profile" options={{ title: 'Your profile', presentation: 'formSheet', sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, sheetCornerRadius: 28, headerRight: modal.headerRight }} />
    <Stack.Screen name="scan" options={{ ...modal, title: 'Scan a code' }} />
    <Stack.Screen name="join" options={{ ...modal, title: 'Join the room' }} />
    <Stack.Screen name="room" options={{ title: 'Group' }} />
    <Stack.Screen name="members" options={{ ...modal, title: 'Members' }} />
    <Stack.Screen name="person/[id]" options={{ ...modal, title: 'Profile' }} />
    <Stack.Screen name="direct/[id]" options={{ title: 'Direct message' }} />
    <Stack.Screen name="edit-profile" options={{ ...modal, title: 'Edit Profile' }} />
    <Stack.Screen name="settings" options={{ ...modal, title: 'Settings' }} />
  </Stack></ChatProvider>;
}
