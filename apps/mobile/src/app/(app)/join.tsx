import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import type { ChatNameResolution } from '@qr-chat/api';
import { codeKeySchema } from '@qr-chat/validation';
import { Button, Copy, ErrorNotice, Field, Icon, Screen, TextButton, colors, styles, useAction } from '@/components/chat-ui';
import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';
import { roomRoute } from '@/lib/room-route';
import { useRoomParams } from '@/hooks/use-room-params';

export default function JoinScreen() {
  const { code: rawCode } = useRoomParams();
  const parsed = codeKeySchema.safeParse(rawCode);
  const chat = useChat();
  const { api } = useAuth();
  const [editedName, setEditedName] = useState<string | null>(null);
  const [chatNameDraftState, setChatNameDraftState] = useState<{ code: string; value: string } | null>(null);
  const [nameLookup, setNameLookup] = useState<{ code: string; result: ChatNameResolution | null } | null>(null);
  const [completed, setCompleted] = useState(false);
  const name = editedName ?? chat.session?.name ?? '';
  const action = useAction();
  const code = parsed.success ? parsed.data : null;
  const chatNameDraft = chatNameDraftState?.code === code ? chatNameDraftState.value : '';

  useEffect(() => {
    if (!api || !code || !chat.ready || chat.scannedCode !== code) return;
    const controller = new AbortController();
    void api.resolveQrChatName(code, controller.signal).then(
      (result) => { if (!controller.signal.aborted) setNameLookup({ code, result }); },
      () => { if (!controller.signal.aborted) setNameLookup({ code, result: { kind: 'missing' } }); },
    );
    return () => controller.abort();
  }, [api, code, chat.ready, chat.scannedCode]);

  if (!parsed.success) return <Screen><ErrorNotice message="This QR code is invalid." /><Button label="Scan again" onPress={() => router.replace('/scan')} /></Screen>;
  const sameGroup = chat.group?.venue.codes[0] === parsed.data ? chat.group : null;
  if (chat.ready && sameGroup && !sameGroup.venue.nameMissing) return <Redirect href={roomRoute(sameGroup)} />;
  if (!completed && chat.scannedCode !== parsed.data) return <Redirect href="/scan" />;
  const lookup = nameLookup?.code === parsed.data ? nameLookup.result : null;
  const findingName = !lookup;
  const chatName = lookup?.kind === 'saved' || lookup?.kind === 'suggested'
    ? lookup.name
    : chatNameDraft.trim();

  async function join() {
    if (!parsed.success || !lookup || !chatName || !api || completed) return;
    await action.run(async () => {
      await api.saveProfile({ display_name: name });
      let room;
      if (sameGroup) {
        const canonicalName = await api.nameCurrentQrChatIfEmpty(parsed.data, chatName);
        room = { ...sameGroup, venue: { ...sameGroup.venue, name: canonicalName, nameMissing: false } };
      } else {
        const membership = await api.joinNamedGroup(parsed.data, chatName);
        room = { id: membership.group_id, venue: { id: parsed.data, name: membership.display_name, nameMissing: false, codes: [parsed.data], kind: 'place', label: 'A conversation for this QR code.' } };
      }
      await chat.refresh();
      setCompleted(true);
      chat.clearScan();
      router.replace(roomRoute(room));
    });
  }

  return <Screen>
    <View style={{ alignItems: 'center', gap: 14, paddingVertical: 24 }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }}><Icon name="group" size={28} /></View>
      <Copy accessibilityRole="header" style={styles.subtitle}>Join the room</Copy>
      {findingName
        ? <Copy accessibilityLiveRegion="polite" style={[styles.muted, { textAlign: 'center' }]}>Finding the chat name…</Copy>
        : lookup.kind === 'missing'
          ? <Copy style={[styles.muted, { textAlign: 'center' }]}>Unnamed chat</Copy>
          : <Copy style={[styles.muted, { textAlign: 'center' }]}>{lookup.name}</Copy>}
    </View>
    <Field label="Your name" value={name} onChangeText={setEditedName} maxLength={50} autoCapitalize="words" placeholder="Capybara" editable={chat.ready && !action.busy} />
    {lookup?.kind === 'missing' && <>
      <Field label="Chat name" value={chatNameDraft} onChangeText={(value) => setChatNameDraftState({ code: parsed.data, value })} maxLength={100} autoCapitalize="words" placeholder="Cafe name" editable={chat.ready && !action.busy} />
      <Copy style={styles.muted}>We couldn’t identify this place. Give this chat a name for everyone.</Copy>
    </>}
    {chat.group && !sameGroup && <Copy style={styles.muted}>Joining this room leaves your current group.</Copy>}
    <ErrorNotice message={action.error || chat.error} retry={chat.error ? () => { void action.run(chat.refresh); } : undefined} />
    <Button label={action.busy || completed ? 'Joining…' : 'Join chat'} disabled={action.busy || completed || !chat.ready || findingName || !chatName || !name.trim()} onPress={() => { void join(); }} />
    <TextButton label="Scan another code" onPress={() => router.replace('/scan')} disabled={action.busy} />
  </Screen>;
}
