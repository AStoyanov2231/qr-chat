import { useEffect, useEffectEvent, useState } from 'react';
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
  const [chatNameDraftState, setChatNameDraftState] = useState<{ code: string; value: string } | null>(null);
  const [nameLookup, setNameLookup] = useState<{ code: string; result: ChatNameResolution | null } | null>(null);
  const [completed, setCompleted] = useState(false);
  const action = useAction();
  const code = parsed.success ? parsed.data : null;
  const chatNameDraft = chatNameDraftState?.code === code ? chatNameDraftState.value : '';
  const sameGroup = chat.group?.venue.codes[0] === code ? chat.group : null;
  const lookup = nameLookup?.code === code ? nameLookup.result : null;
  const chatName = lookup?.kind === 'saved' || lookup?.kind === 'suggested' ? lookup.name : chatNameDraft.trim();
  const hasSession = !!chat.session;
  const alreadyNamed = !!sameGroup && !sameGroup.venue.nameMissing;
  const autoJoin = useEffectEvent((name: string) => { void join(name); });

  useEffect(() => {
    if (!api || !code || !chat.ready || !hasSession || chat.scannedCode !== code || alreadyNamed) return;
    const controller = new AbortController();
    void api.resolveQrChatName(code, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setNameLookup({ code, result });
        if (result.kind !== 'missing') autoJoin(result.name);
      },
      () => { if (!controller.signal.aborted) setNameLookup({ code, result: { kind: 'missing' } }); },
    );
    return () => controller.abort();
  }, [api, code, chat.ready, chat.scannedCode, hasSession, alreadyNamed]);

  if (!parsed.success) return <Screen><ErrorNotice message="This QR code is invalid." /><Button label="Scan again" onPress={() => router.replace('/scan')} /></Screen>;
  if (chat.ready && sameGroup && !sameGroup.venue.nameMissing) return <Redirect href={roomRoute(sameGroup)} />;
  if (!completed && chat.scannedCode !== parsed.data) return <Redirect href="/scan" />;
  const findingName = !lookup;

  async function join(chosenName = chatName) {
    if (!parsed.success || !chosenName || !api || !chat.ready || !chat.session || completed) return;
    await action.run(async () => {
      let room;
      if (sameGroup) {
        const canonicalName = await api.nameCurrentQrChatIfEmpty(parsed.data, chosenName);
        room = { ...sameGroup, venue: { ...sameGroup.venue, name: canonicalName, nameMissing: false } };
      } else {
        const membership = await api.joinNamedGroup(parsed.data, chosenName);
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
      <Copy accessibilityRole="header" style={styles.subtitle}>{lookup?.kind === 'missing' ? 'Name this chat' : 'Joining…'}</Copy>
      {findingName
        ? <Copy accessibilityLiveRegion="polite" style={[styles.muted, { textAlign: 'center' }]}>Finding the chat name…</Copy>
        : lookup.kind === 'missing'
          ? <Copy style={[styles.muted, { textAlign: 'center' }]}>Unnamed chat</Copy>
          : <Copy style={[styles.muted, { textAlign: 'center' }]}>{lookup.name}</Copy>}
    </View>
    {lookup?.kind === 'missing' && <>
      <Field label="Chat name" value={chatNameDraft} onChangeText={(value) => setChatNameDraftState({ code: parsed.data, value })} maxLength={100} autoCapitalize="words" placeholder="Cafe name" editable={chat.ready && !action.busy} />
      <Copy style={styles.muted}>We couldn’t identify this place. Give this chat a name for everyone.</Copy>
    </>}
    {chat.group && !sameGroup && <Copy style={styles.muted}>Joining this room leaves your current group.</Copy>}
    <ErrorNotice message={action.error || chat.error} retry={chat.error ? () => { void action.run(chat.refresh); } : undefined} />
    {(lookup?.kind === 'missing' || action.error) && <Button label={action.busy || completed ? 'Joining…' : action.error ? 'Try again' : 'Join chat'} disabled={action.busy || completed || !chat.ready || findingName || !chatName} onPress={() => { void join(); }} />}
    <TextButton label="Scan another code" onPress={() => router.replace('/scan')} disabled={action.busy} />
  </Screen>;
}
