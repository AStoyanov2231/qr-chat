import { useState } from 'react';
import { router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { View } from 'react-native';
import { Button, Copy, ErrorNotice, Field, Screen, TextButton, styles, useAction } from '@/components/chat-ui';
import { Avatar } from '@/components/avatar';
import { pickAvatar, type SelectedAvatar } from '@/lib/avatar';
import { useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';

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
      <Copy style={[styles.muted, { textAlign: 'center' }]}>Your photo appears in chats and profiles.</Copy>
    </View>
    <Field label="Display name" value={name} onChangeText={setName} maxLength={50} autoCapitalize="words" editable={!action.busy} />
    <ErrorNotice message={action.error || chat.error} />
    <Button label={action.busy ? 'Saving…' : 'Save profile'} disabled={action.busy || !chat.ready || !name.trim()} onPress={() => { void action.run(async () => { await api!.saveProfileWithAvatar(name, photo === null ? null : photo ? { ...photo.upload, uploadId: randomUUID() } : undefined); await chat.refresh(); router.back(); }); }} />
  </Screen>;
}
