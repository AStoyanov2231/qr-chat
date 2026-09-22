import { useState } from 'react';
import { router } from 'expo-router';
import { Button, ErrorNotice, Field, Screen, useAction } from '@/components/chat-ui';
import { useChat } from '@/providers/chat-provider';
import { useAuth } from '@/providers/auth-provider';

export default function EditProfileScreen() {
  const chat = useChat();
  const { api } = useAuth();
  const [editedName, setName] = useState<string | null>(null);
  const name = editedName ?? chat.session?.name ?? '';
  const action = useAction();
  return <Screen><Field label="Display name" value={name} onChangeText={setName} maxLength={50} autoCapitalize="words" autoFocus editable={!action.busy} />
    <ErrorNotice message={action.error || chat.error} />
    <Button label={action.busy ? 'Saving…' : 'Save profile'} disabled={action.busy || !chat.ready || !name.trim()} onPress={() => { void action.run(async () => { await api!.saveProfile({ display_name: name }); await chat.refresh(); router.back(); }); }} />
  </Screen>;
}
