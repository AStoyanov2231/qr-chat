import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { codeKeySchema } from '@qr-chat/validation';
import { Button, Copy, ErrorNotice, Field, Icon, Screen, TextButton, colors, styles, useAction } from '@/components/chat-ui';
import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';
import { roomRoute } from '@/lib/room-route';
import { useRoomParams } from '@/hooks/use-room-params';

export default function JoinScreen() {
  const { code } = useRoomParams();
  const parsed = codeKeySchema.safeParse(code);
  const chat = useChat();
  const { api } = useAuth();
  const [editedName, setEditedName] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const name = editedName ?? chat.session?.name ?? '';
  const action = useAction();

  if (!parsed.success) return <Screen><ErrorNotice message="This QR code is invalid." /><Button label="Scan again" onPress={() => router.replace('/scan')} /></Screen>;
  if (chat.ready && chat.group?.venue.codes[0] === parsed.data) return <Redirect href={roomRoute(chat.group)} />;
  if (!completed && chat.scannedCode !== parsed.data) return <Redirect href="/scan" />;

  async function join() {
    if (!parsed.success || completed) return;
    await action.run(async () => {
      await api!.saveProfile({ display_name: name });
      const membership = await api!.joinGroup(parsed.data);
      await chat.refresh();
      setCompleted(true);
      chat.clearScan();
      router.replace({ pathname: '/room', params: { groupId: membership.group_id, code: parsed.data, name: parsed.data } });
    });
  }

  return <Screen>
    <View style={{ alignItems: 'center', gap: 14, paddingVertical: 24 }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }}><Icon name="group" size={28} /></View>
      <Copy accessibilityRole="header" style={styles.subtitle}>Join the room.</Copy>
      <Copy style={[styles.muted, { textAlign: 'center' }]}>{parsed.data}</Copy>
    </View>
    <Field label="Your name" value={name} onChangeText={setEditedName} maxLength={50} autoCapitalize="words" placeholder="Capybara" editable={chat.ready && !action.busy} />
    {chat.group && <Copy style={styles.muted}>Joining this room leaves your current group.</Copy>}
    <ErrorNotice message={action.error || chat.error} retry={chat.error ? () => { void action.run(chat.refresh); } : undefined} />
    <Button label={action.busy || completed ? 'Joining…' : 'Join chat'} disabled={action.busy || completed || !chat.ready || !name.trim()} onPress={() => { void join(); }} />
    <TextButton label="Scan another code" onPress={() => router.replace('/scan')} disabled={action.busy} />
  </Screen>;
}
