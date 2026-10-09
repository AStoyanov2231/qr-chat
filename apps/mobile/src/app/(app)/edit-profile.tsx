import { useState } from 'react';
import { router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Copy, ErrorNotice, Field, Screen, TextButton, styles, useAction } from '@/components/chat-ui';
import { Avatar } from '@/components/avatar';
import { HERO_FADE, profileHeroHeight } from '@/components/conversation-header';
import { pickAvatar, type SelectedAvatar } from '@/lib/avatar';
import { useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';

const GUIDE_WIDTH = 240;

/** The profile header at small scale, so people can see where the colour fade covers their photo. */
function HeroGuide({ url, color }: { url: string; color: string }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const scale = GUIDE_WIDTH / window.width;
  return <View accessibilityElementsHidden style={{ width: GUIDE_WIDTH, height: (profileHeroHeight(insets.top, window.height) - insets.top) * scale, borderRadius: 16, overflow: 'hidden', backgroundColor: color }}>
    <Image source={{ uri: url }} contentFit="cover" contentPosition="top" style={{ flex: 1 }} />
    <LinearGradient colors={[color, 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: HERO_FADE * scale }} />
    <View style={{ position: 'absolute', top: HERO_FADE * scale, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.9)' }} />
  </View>;
}

export default function EditProfileScreen() {
  const chat = useChat();
  const { api } = useAuth();
  const [editedName, setName] = useState<string | null>(null);
  const name = editedName ?? chat.session?.name ?? '';
  const action = useAction();
  const [photo, setPhoto] = useState<SelectedAvatar | null | undefined>();
  const avatar = photo === undefined ? chat.session?.avatarUrl : photo?.uri;
  return <Screen>
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Avatar name={name} url={avatar} size={130} />
      <TextButton label={action.busy ? 'Please wait…' : 'Choose photo'} disabled={action.busy || !chat.ready} onPress={() => { void action.run(async () => { const picked = await pickAvatar(); if (picked) setPhoto(picked); }); }} />
      {avatar && <TextButton label="Remove photo" disabled={action.busy} onPress={() => setPhoto(null)} />}
      {avatar && <HeroGuide url={avatar} color={chat.session?.avatarColor ?? '#64717b'} />}
      <Copy style={[styles.muted, { textAlign: 'center' }]}>{avatar ? 'On your profile, the top of your photo fades into colour above the line. Keep your face below it.' : 'Your photo appears in chats and profiles.'}</Copy>
    </View>
    <Field label="Display name" value={name} onChangeText={setName} maxLength={50} autoCapitalize="words" editable={!action.busy} />
    <ErrorNotice message={action.error || chat.error} />
    <Button label={action.busy ? 'Saving…' : 'Save profile'} disabled={action.busy || !chat.ready || !name.trim()} onPress={() => { void action.run(async () => { await api!.saveProfileWithAvatar(name, photo === null ? null : photo ? { ...photo.upload, uploadId: randomUUID() } : undefined); await chat.refresh(); router.back(); }); }} />
  </Screen>;
}
