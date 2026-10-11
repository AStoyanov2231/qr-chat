import { useEffect } from 'react';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { colors, Copy, Screen } from '@/components/chat-ui';

void SplashScreen.preventAutoHideAsync();
function Navigation() {
  const { userId, loading, api } = useAuth();
  useEffect(() => { if (!loading) void SplashScreen.hideAsync(); }, [loading]);
  if (loading) return null;
  if (!api) return <Screen><Copy>QR Chat needs its Supabase URL and publishable key configured before it can connect.</Copy></Screen>;
  return <Stack screenOptions={{ statusBarStyle: 'dark', headerShadowVisible: false, contentStyle: { backgroundColor: colors.canvas }, headerTintColor: colors.text }}>
    <Stack.Protected guard={!!userId}><Stack.Screen name="(app)" options={{ headerShown: false }} /></Stack.Protected>
    <Stack.Protected guard={!userId}><Stack.Screen name="sign-in" options={{ headerShown: false }} /></Stack.Protected>
    <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
  </Stack>;
}
export default function RootLayout() {
  return <ThemeProvider value={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.canvas, card: colors.canvas, text: colors.text, primary: colors.text, border: colors.line } }}>
    <AuthProvider><Navigation /></AuthProvider>
  </ThemeProvider>;
}
