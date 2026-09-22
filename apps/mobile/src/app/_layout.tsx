import { useEffect } from 'react';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { colors, Copy, Screen } from '@/components/chat-ui';

void SplashScreen.preventAutoHideAsync();
function Navigation() {
  const { userId, loading, api } = useAuth();
  useEffect(() => { if (!loading) void SplashScreen.hideAsync(); }, [loading]);
  if (loading) return null;
  if (!api) return <Screen><Copy>QR Chat needs its Supabase URL and publishable key configured before it can connect.</Copy></Screen>;
  return <Stack screenOptions={{ headerShadowVisible: false, contentStyle: { backgroundColor: colors.paper }, headerTintColor: colors.ink }}>
    <Stack.Protected guard={!!userId}><Stack.Screen name="(app)" options={{ headerShown: false }} /></Stack.Protected>
    <Stack.Protected guard={!userId}><Stack.Screen name="sign-in" options={{ headerShown: false }} /></Stack.Protected>
    <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
  </Stack>;
}
export default function RootLayout() {
  return <ThemeProvider value={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.paper, card: colors.paper, text: colors.ink, primary: colors.ink, border: colors.line } }}>
    <AuthProvider><StatusBar style="dark" /><Navigation /></AuthProvider>
  </ThemeProvider>;
}
